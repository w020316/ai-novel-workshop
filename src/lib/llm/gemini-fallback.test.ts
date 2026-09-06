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

  it('显式指定模型（项目配置默认）失效 404 → 自动落链内下一个模型', async () => {
    // 模拟路由行为：显式 model 以其打头构建链；首模型下线返回 404（isModelFallbackError 命中）
    const requested = GEMINI_QUALITY_MODEL; // gemini-3.6-flash
    const chain = geminiModelChain(requested);
    expect(chain[0]).toBe(requested);
    expect(chain).toContain(GEMINI_BULK_MODEL); // 链尾兜底为批量模型

    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('model not found'), { statusCode: 404 }))
      .mockResolvedValueOnce('ok-on-next');
    const r = await callWithModelFallback(chain, fn, (err) =>
      (err as { statusCode?: number }).statusCode === 404
    );
    expect(r).toBe('ok-on-next');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, requested);
    expect(fn).toHaveBeenNthCalledWith(2, chain[1]);
  });

  it('显式指定的非链内自定义模型 → 链为主模型 + 默认三级链（去重）', () => {
    // 用户在设置里填了自定义 gemini 模型：链 = 自定义 + 3.6/3.5/3.1 去重，保底仍有效
    const chain = geminiModelChain('gemini-custom-experimental');
    expect(chain[0]).toBe('gemini-custom-experimental');
    expect(chain).toEqual([
      'gemini-custom-experimental',
      GEMINI_QUALITY_MODEL,
      'gemini-3.5-flash',
      GEMINI_BULK_MODEL,
    ]);
  });
});