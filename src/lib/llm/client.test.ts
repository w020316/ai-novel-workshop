// ============================================================================
// LLM 客户端调用测试
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  chat,
  embedding,
  embeddingBatch,
  getProviders,
  isLLMReady,
  LLMClientError,
} from './client';
import type { ChatMessage } from '@/types';

const API_BASE = '/api/llm';

function makeResponse(
  body: unknown,
  status = 200,
  jsonThrows = false
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jsonThrows
      ? async () => {
          throw new SyntaxError('Unexpected token');
        }
      : async () => body,
  } as unknown as Response;
}

describe('llm/client', () => {
  const messages: ChatMessage[] = [{ role: 'user', content: '你好' }];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('chat', () => {
    it('应返回 ChatResult 并正确构造请求', async () => {
      const result = {
        content: '回答',
        usage: { promptTokens: 5, completionTokens: 3 },
        provider: 'deepseek',
        model: 'deepseek-chat',
      };
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(result));
      vi.stubGlobal('fetch', fetchMock);

      const res = await chat(messages, { provider: 'deepseek', temperature: 0.5 });
      expect(res).toEqual(result);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${API_BASE}/chat`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      const body = JSON.parse(init.body);
      expect(body.messages).toEqual(messages);
      expect(body.temperature).toBe(0.5);
    });

    it('网络失败时抛出可重试的 LLMClientError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

      const err = await chat(messages).then(
        () => null as never,
        (e) => e
      );
      expect(err).toBeInstanceOf(LLMClientError);
      expect(err.statusCode).toBe(0);
      expect(err.retryable).toBe(true);
      expect(err.message).toContain('网络请求失败');
    });

    it('响应不是合法 JSON 时抛出错误', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(undefined, 200, true)));

      const err = await chat(messages).then(
        () => null as never,
        (e) => e
      );
      expect(err).toBeInstanceOf(LLMClientError);
      expect(err.statusCode).toBe(200);
      expect(err.retryable).toBe(false);
      expect(err.message).toContain('不是合法 JSON');
    });

    it('HTTP 非 2xx 时抛出包含服务端 message 的错误', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(makeResponse({ error: '限流', retryable: true }, 429))
      );

      const err = await chat(messages).then(
        () => null as never,
        (e) => e
      );
      expect(err).toBeInstanceOf(LLMClientError);
      expect(err.statusCode).toBe(429);
      expect(err.retryable).toBe(true);
      expect(err.message).toBe('限流');
    });

    it('HTTP 非 2xx 且无 error 字段时使用默认文案', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({}, 500)));

      const err = await chat(messages).then(
        () => null as never,
        (e) => e
      );
      expect(err.statusCode).toBe(500);
      expect(err.retryable).toBe(false);
      expect(err.message).toContain('HTTP 500');
    });
  });

  describe('embedding', () => {
    it('应返回 Float32Array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          makeResponse({
            vectors: [[0.1, 0.2, 0.3]],
            count: 1,
            dim: 3,
            provider: 'deepseek',
            model: 'm',
            usage: { promptTokens: 1 },
          })
        )
      );
      const vec = await embedding('测试文本');
      expect(vec).toBeInstanceOf(Float32Array);
      expect(Math.round(vec[0] * 100) / 100).toBe(0.1);
      expect(Math.round(vec[2] * 100) / 100).toBe(0.3);
    });

    it('embedding 空结果时抛出错误', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          makeResponse({
            vectors: [],
            count: 0,
            dim: 0,
            provider: 'deepseek',
            model: 'm',
            usage: { promptTokens: 1 },
          })
        )
      );
      await expect(embedding('测试')).rejects.toThrow('Embedding 返回为空');
      await expect(embedding('测试')).rejects.toBeInstanceOf(LLMClientError);
    });
  });

  describe('embeddingBatch', () => {
    it('应返回多个 Float32Array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          makeResponse({
            vectors: [
              [1, 2],
              [3, 4],
            ],
            count: 2,
            dim: 2,
            provider: 'deepseek',
            model: 'm',
            usage: { promptTokens: 2 },
          })
        )
      );
      const res = await embeddingBatch(['a', 'b']);
      expect(res).toHaveLength(2);
      expect(res[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(res[1])).toEqual([3, 4]);
    });

    it('应传递 texts 数组作为请求体', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          makeResponse({ vectors: [[0]], count: 1, dim: 1, provider: 'deepseek', model: 'm', usage: { promptTokens: 1 } })
        );
      vi.stubGlobal('fetch', fetchMock);
      await embeddingBatch(['x', 'y']);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.texts).toEqual(['x', 'y']);
    });
  });

  describe('getProviders / isLLMReady', () => {
    it('getProviders 应返回结果', async () => {
      const providersResult = {
        providers: [],
        defaultProvider: 'deepseek',
        configured: 1,
        ready: true,
      };
      const fetchMock = vi.fn();
      fetchMock.mockResolvedValue(makeResponse(providersResult));
      vi.stubGlobal('fetch', fetchMock);

      expect(await getProviders()).toEqual(providersResult);
      expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/providers`);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });

    it('getProviders 非 2xx 时抛出 LLMClientError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({}, 500)));
      await expect(getProviders()).rejects.toBeInstanceOf(LLMClientError);
    });

    it('isLLMReady 为 true', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ ready: true })));
      expect(await isLLMReady()).toBe(true);
    });

    it('isLLMReady 在请求失败时返回 false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
      expect(await isLLMReady()).toBe(false);
    });

    it('isLLMReady 在 ready=false 时返回 false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ ready: false })));
      expect(await isLLMReady()).toBe(false);
    });

    it('LLMClientError 默认 retryable 为 false', () => {
      const err = new LLMClientError('错误', 400);
      expect(err.retryable).toBe(false);
      expect(err.name).toBe('LLMClientError');
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('错误');
    });
  });
});