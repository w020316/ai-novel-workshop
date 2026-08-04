import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';
import { LLMApiError } from './openai-compatible';

describe('llm/retry', () => {
  describe('withRetry', () => {
    it('成功时应直接返回结果（不重试）', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await withRetry(fn, { maxRetries: 3 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('可重试错误应重试直到成功', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new LLMApiError('err', 502, '', 'deepseek'))
        .mockRejectedValueOnce(new LLMApiError('err', 502, '', 'deepseek'))
        .mockResolvedValue('ok');

      const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('超过最大重试次数应抛出 LLMApiError', async () => {
      const fn = vi.fn().mockRejectedValue(
        new LLMApiError('persistent', 502, '', 'deepseek')
      );

      await expect(
        withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
      ).rejects.toThrow(LLMApiError);
      expect(fn).toHaveBeenCalledTimes(3); // 原始 + 2 次重试
    });

    it('不可重试的错误不应重试', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new LLMApiError('auth', 401, '', 'deepseek'))
        .mockResolvedValue('ok');

      await expect(
        withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
      ).rejects.toThrow();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('应调用 onRetry 回调', async () => {
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new LLMApiError('err', 503, '', 'deepseek'))
        .mockResolvedValue('ok');

      await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, onRetry });
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(LLMApiError), expect.any(Number));
    });

    it('网络错误（TypeError）应可重试', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValue('ok');

      const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 10 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});