import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildProviderChain } from './providers';
import { callWithProviderFallback, ProviderFallbackExhaustedError } from './adapter';
import { LLMApiError, isConnectionError, isModelFallbackError } from './openai-compatible';

describe('llm/provider-failover', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.ZHIPU_API_KEY = 'sk-zhipu';
    process.env.DEEPSEEK_API_KEY = 'sk-deep';
    process.env.QWEN_API_KEY = 'sk-qwen';
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER_ORDER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ============ isConnectionError ============
  describe('isConnectionError（仅网络连接级错误）', () => {
    it('HTTP 状态错误（LLMApiError）不算连接错误', () => {
      expect(isConnectionError(new LLMApiError('rate limit', 429, '', 'zhipu'))).toBe(false);
      expect(isConnectionError(new LLMApiError('server error', 503, '', 'zhipu'))).toBe(false);
    });

    it('fetch 网络失败（TypeError）与超时中止（AbortError）算连接错误', () => {
      expect(isConnectionError(new TypeError('fetch failed'))).toBe(true);
      expect(isConnectionError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    });

    it('DNS / 拒连 / undici 连接超时等 errno 算连接错误', () => {
      expect(isConnectionError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe(true);
      expect(isConnectionError(Object.assign(new Error('dns'), { code: 'ENOTFOUND' }))).toBe(true);
      expect(isConnectionError(Object.assign(new Error('timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }))).toBe(true);
    });

    it('undici ConnectTimeoutError（Gemini 本地实测的错误形态）算连接错误', () => {
      const err = Object.assign(new Error('Connect Timeout Error'), { name: 'ConnectTimeoutError' });
      expect(isConnectionError(err)).toBe(true);
    });

    it('普通业务错误不算连接错误', () => {
      expect(isConnectionError(new Error('something broke'))).toBe(false);
      expect(isConnectionError(null)).toBe(false);
      expect(isConnectionError('timeout')).toBe(false);
    });
  });

  // ============ isModelFallbackError（模型级降级判定） ============
  describe('isModelFallbackError', () => {
    it('404 模型不存在/已下线应触发模型切换', () => {
      expect(isModelFallbackError(new LLMApiError('model not found', 404, '', 'gemini'))).toBe(true);
    });

    it('可重试错误（429/5xx/超时/网络）应触发模型切换', () => {
      expect(isModelFallbackError(new LLMApiError('rate limit', 429, '', 'gemini'))).toBe(true);
      expect(isModelFallbackError(new LLMApiError('server error', 500, '', 'gemini'))).toBe(true);
      expect(isModelFallbackError(Object.assign(new Error('t'), { name: 'AbortError' }))).toBe(true);
      expect(isModelFallbackError(new TypeError('fetch failed'))).toBe(true);
    });

    it('401/400 等非模型错误不应触发模型切换', () => {
      expect(isModelFallbackError(new LLMApiError('auth', 401, '', 'gemini'))).toBe(false);
      expect(isModelFallbackError(new LLMApiError('bad request', 400, '', 'gemini'))).toBe(false);
      expect(isModelFallbackError(new Error('boom'))).toBe(false);
    });
  });

  // ============ buildProviderChain ============
  describe('buildProviderChain', () => {
    it('请求的 provider 已配置时排在链首并携带请求模型，其余按优先级追加', () => {
      const chain = buildProviderChain('qwen', 'qwen-plus');
      expect(chain[0]).toEqual({ provider: 'qwen', model: 'qwen-plus' });
      expect(chain.map((c) => c.provider)).toEqual(['qwen', 'zhipu', 'deepseek']);
      // 其余 provider 套用各自默认模型
      expect(chain[1].model).toBe('glm-4-flash');
      expect(chain[2].model).toBe('deepseek-chat');
    });

    it('请求的 provider 未配置时回退到全部已配置 provider', () => {
      const chain = buildProviderChain('gemini', 'gemini-3.6-flash');
      expect(chain.map((c) => c.provider)).toEqual(['zhipu', 'deepseek', 'qwen']);
      // 未采用的请求模型不应泄露到链上
      expect(chain.every((c) => c.model !== 'gemini-3.6-flash')).toBe(true);
    });

    it('未指定请求 provider 时返回完整优先级链', () => {
      expect(buildProviderChain().map((c) => c.provider)).toEqual(['zhipu', 'deepseek', 'qwen']);
    });

    it('无任何已配置 provider 时返回空数组', () => {
      delete process.env.ZHIPU_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.QWEN_API_KEY;
      expect(buildProviderChain()).toEqual([]);
    });

    it('遵循 LLM_PROVIDER_ORDER 自定义顺序', () => {
      process.env.LLM_PROVIDER_ORDER = 'deepseek,zhipu';
      expect(buildProviderChain().map((c) => c.provider)).toEqual(['deepseek', 'zhipu']);
    });
  });

  // ============ callWithProviderFallback ============
  describe('callWithProviderFallback', () => {
    const chain = [
      { provider: 'zhipu' as const, model: 'glm-4-flash' },
      { provider: 'deepseek' as const, model: 'deepseek-chat' },
    ];

    it('首个 Provider 成功即返回，无降级记录', async () => {
      const call = vi.fn().mockResolvedValue('ok');
      const r = await callWithProviderFallback(chain, call);
      expect(r).toEqual({
        result: 'ok',
        provider: 'zhipu',
        fallback: false,
        fallbackHistory: [],
      });
      expect(call).toHaveBeenCalledTimes(1);
      expect(call).toHaveBeenCalledWith(chain[0]);
    });

    it('连接错误时切换下一个 Provider 成功', async () => {
      const connErr = Object.assign(new Error('Connect Timeout Error'), { name: 'ConnectTimeoutError' });
      const call = vi.fn().mockRejectedValueOnce(connErr).mockResolvedValue('ok-on-deepseek');

      const r = await callWithProviderFallback(chain, call);

      expect(r.result).toBe('ok-on-deepseek');
      expect(r.provider).toBe('deepseek');
      expect(r.fallback).toBe(true);
      expect(r.fallbackHistory).toEqual([{ provider: 'zhipu', error: connErr }]);
      expect(call).toHaveBeenCalledTimes(2);
      expect(call).toHaveBeenLastCalledWith(chain[1]);
    });

    it('非连接错误（如 401/429）不切换，原样抛出', async () => {
      const authErr = new LLMApiError('auth failed', 401, '', 'zhipu');
      const call = vi.fn().mockRejectedValue(authErr);

      await expect(callWithProviderFallback(chain, call)).rejects.toThrow(authErr);
      expect(call).toHaveBeenCalledTimes(1);
    });

    it('全部 Provider 连接失败时抛出 ProviderFallbackExhaustedError 并携带失败记录', async () => {
      const e1 = new TypeError('fetch failed');
      const e2 = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
      const call = vi.fn().mockRejectedValueOnce(e1).mockRejectedValueOnce(e2);

      try {
        await callWithProviderFallback(chain, call);
        expect.unreachable('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderFallbackExhaustedError);
        const exhausted = err as ProviderFallbackExhaustedError;
        expect(exhausted.attempted).toEqual(['zhipu', 'deepseek']);
        expect(exhausted.fallbackHistory).toEqual([
          { provider: 'zhipu', error: e1 },
          { provider: 'deepseek', error: e2 },
        ]);
        expect(exhausted.message).toContain('zhipu');
        expect(exhausted.message).toContain('deepseek');
      }
      expect(call).toHaveBeenCalledTimes(2);
    });
  });
});
