import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withFallback, FallbackExhaustedError } from './fallback';
import { LLMApiError } from './openai-compatible';

// 模拟 createAdapter 返回可控的 mock adapter
vi.mock('./adapter', () => ({
  createAdapter: vi.fn(),
  createFirstAvailableAdapter: vi.fn(),
}));

import { createAdapter } from './adapter';

const mockChat = vi.fn();

function resetMockAdapter() {
  mockChat.mockReset();
  (createAdapter as ReturnType<typeof vi.fn>).mockReset();
  (createAdapter as ReturnType<typeof vi.fn>).mockReturnValue({
    model: 'mock-model',
    provider: 'deepseek',
    chat: mockChat,
    streamChat: vi.fn(),
    embedding: vi.fn(),
  });
}

describe('llm/fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.DEEPSEEK_API_KEY = 'sk-deep';
    process.env.ZHIPU_API_KEY = 'sk-zhipu';
    process.env.QWEN_API_KEY = 'sk-qwen';
    resetMockAdapter();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('主 Provider 成功时应直接返回', async () => {
    mockChat.mockResolvedValue({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } });

    const { result, provider, fallback } = await withFallback(
      async (adapter) => adapter.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      { providers: ['deepseek'] }
    );

    expect(result).toEqual({ content: 'ok', usage: { promptTokens: 10, completionTokens: 5 } });
    expect(provider).toBe('deepseek');
    expect(fallback).toBe(false);
  });

  it('主 Provider 失败时应降级到备选', async () => {
    mockChat
      .mockRejectedValueOnce(new LLMApiError('rate limit', 429, '', 'deepseek'))
      .mockResolvedValue({ content: 'fallback ok', usage: { promptTokens: 5, completionTokens: 3 } });

    // 只配置 deepseek 一个 provider，测试 withRetry 重试后成功
    const { result, provider, fallback } = await withFallback(
      async (adapter) => adapter.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      { providers: ['deepseek'], retry: { maxRetries: 1, baseDelayMs: 10 } }
    );

    expect(result).toEqual({ content: 'fallback ok', usage: { promptTokens: 5, completionTokens: 3 } });
    expect(provider).toBe('deepseek');
    expect(fallback).toBe(false);
  });

  it('所有 Provider 失败时应抛出 FallbackExhaustedError', async () => {
    mockChat.mockRejectedValue(new LLMApiError('err', 503, '', 'deepseek'));

    await expect(
      withFallback(
        async (adapter) => adapter.chat({ messages: [{ role: 'user', content: 'hi' }] }),
        {
          providers: ['deepseek', 'zhipu'],
          retry: { maxRetries: 0, baseDelayMs: 10 }, // 禁止重试加速测试
        }
      )
    ).rejects.toThrow(FallbackExhaustedError);
  });

  it('无任何配置时应抛出错误', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.ZHIPU_API_KEY;
    delete process.env.QWEN_API_KEY;

    await expect(
      withFallback(
        async () => ({ content: '', usage: { promptTokens: 0, completionTokens: 0 } }),
        { providers: [] }
      )
    ).rejects.toThrow('没有任何 LLM Provider 已配置');
  });

  it('应调用 onFallback 回调', async () => {
    const onFallback = vi.fn();

    // 两个 provider 都失败
    mockChat.mockRejectedValue(new LLMApiError('err', 503, '', 'deepseek'));

    await expect(
      withFallback(
        async (adapter) => adapter.chat({ messages: [{ role: 'user', content: 'hi' }] }),
        {
          providers: ['deepseek', 'zhipu'],
          onFallback,
          retry: { maxRetries: 0 }, // 禁止重试，立即降级
        }
      )
    ).rejects.toThrow(FallbackExhaustedError);
  });

  it('不可重试的错误应直接抛出，不降级', async () => {
    mockChat.mockRejectedValue(new LLMApiError('auth', 401, '', 'deepseek'));

    await expect(
      withFallback(
        async (adapter) => adapter.chat({ messages: [{ role: 'user', content: 'hi' }] }),
        { providers: ['deepseek', 'zhipu'] }
      )
    ).rejects.toThrow(LLMApiError);
  });
});