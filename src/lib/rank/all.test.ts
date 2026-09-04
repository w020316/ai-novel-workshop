// ============================================================================
// 实时榜单一键抓取 helper 单测（注入 mock，不抓真实网络 / 不依赖 IndexedDB）
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { fetchAllRankSources } from './all';
import type { RankFetchResult } from './scraper';

function mkResult(over: Partial<RankFetchResult> & { sourceId: string }): RankFetchResult {
  return {
    ok: false,
    sourceName: over.sourceId,
    url: '',
    fetchedAt: Date.now(),
    message: '',
    books: [],
    ...over,
  } as RankFetchResult;
}

describe('fetchAllRankSources（注入 mock）', () => {
  it('成功并发并入的源计入 successCount 与 outcomes', async () => {
    // mock：任意 sourceId 均返回一部作品成功
    const single = vi.fn(async (id: string): Promise<RankFetchResult> => {
      return mkResult({ sourceId: id, ok: true, books: [{ sourceId: id, title: '书' + id, rank: 1 }] });
    });
    const res = await fetchAllRankSources(single as never);
    // 应有全部可直抓平台被逐一抓取
    expect(res.successCount).toBeGreaterThanOrEqual(6);
    expect(res.outcomes.length).toBeGreaterThanOrEqual(6);
    expect(res.outcomes.every((o) => o.ok && o.count === 1)).toBe(true);
    expect(single).toHaveBeenCalledTimes(res.outcomes.length);
  });

  it('失败源不中断整体，降级为 ok=false 并计数为 0', async () => {
    const single = vi.fn(async (id: string): Promise<RankFetchResult> => {
      if (id === 'fanqie') return mkResult({ sourceId: id, ok: false, message: 'boom' });
      return mkResult({ sourceId: id, ok: true, books: [{ sourceId: id, title: '书', rank: 1 }] });
    });
    const res = await fetchAllRankSources(single as never);
    const fanqie = res.outcomes.find((o) => o.sourceId === 'fanqie');
    expect(fanqie).toMatchObject({ ok: false, count: 0 });
    // 其余仍成功，且未被单个失败中断
    expect(res.successCount).toBe(res.outcomes.length - 1);
  });

  it('singleScrape 抛错时该平台降级为 ok=false（兜底）', async () => {
    const single = vi.fn(async () => {
      throw new Error('network down');
    });
    const res = await fetchAllRankSources(single as never);
    expect(res.outcomes.length).toBeGreaterThanOrEqual(6);
    expect(res.successCount).toBe(0);
    expect(res.outcomes.every((o) => o.ok === false)).toBe(true);
  });
});
