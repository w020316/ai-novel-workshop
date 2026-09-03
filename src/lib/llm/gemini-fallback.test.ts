import { describe, it, expect, vi } from 'vitest';
import { geminiModelChain, geminiPrimaryForTask, GEMINI_QUALITY_MODEL, GEMINI_BULK_MODEL } from './providers';
import { callWithModelFallback } from './adapter';

describe('providers / gemini 组合策略（B+C）', () => {
  it('geminiModelChain 以主模型打头且无重复', () => {
    const chain = geminiModelChain(GEMINI_BULK_MODEL);
    expect(chain[0]).toBe(GEMINI_BULK_MODEL);
    expect(new Set(chain).size).toBe(chain.length); // 无重复
    expect(chain).toContain(GEMINI_QUALITY_MODEL);
    expect(chain.length).toBe(3);
  });

  it('geminiPrimaryForTask：质量型任务用 3.6，其余用 3.1-flash-lite', () => {
    expect(geminiPrimaryForTask('write')).toBe(GEMINI_QUALITY_MODEL);
    expect(geminiPrimaryForTask('rewrite')).toBe(GEMINI_QUALITY_MODEL);
    expect(geminiPrimaryForTask('humanize')).toBe(GEMINI_QUALITY_MODEL);
    expect(geminiPrimaryForTask('consistency')).toBe(GEMINI_BULK_MODEL);
    expect(geminiPrimaryForTask('title')).toBe(GEMINI_BULK_MODEL);
    expect(geminiPrimaryForTask(undefined)).toBe(GEMINI_BULK_MODEL);
  });
});

describe('adapter / callWithModelFallback（模型级降级链）', () => {
  it('第一个模型成功即返回', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const r = await callWithModelFallback(['a', 'b'], fn, () => true);
    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('可重试错误时依次降级到下一个模型', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce('ok-on-b');
    const r = await callWithModelFallback(['a', 'b', 'c'], fn, () => true);
    expect(r).toBe('ok-on-b');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('全部失败抛出最后一次错误', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      callWithModelFallback(['a', 'b'], fn, () => true)
    ).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('非可重试错误不换模型立即抛出', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401'));
    await expect(
      callWithModelFallback(['a', 'b'], fn, () => false)
    ).rejects.toThrow('401');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});