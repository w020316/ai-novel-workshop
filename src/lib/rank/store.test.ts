// ============================================================================
// 实时榜单动态查重库（运行时叠加黑名单）测试
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/schema';
import {
  saveLiveRankedWorks,
  loadLiveRankedTitles,
  countLiveRankedWorks,
  clearLiveRankedWorks,
  purgeStaleLiveRankedWorks,
  LIVE_RANK_TTL_MS,
} from './store';

function mkWork(sourceId: string, title: string, extra: Partial<{ author: string; rank: number; url: string }> = {}) {
  return { sourceId, title, author: extra.author, rank: extra.rank, url: extra.url, sourceName: sourceId };
}

describe('rank/store 实时榜单查重库', () => {
  beforeEach(async () => {
    await db.liveRankedWorks.clear();
  });

  it('空列表写入返回 0 且不落库', async () => {
    expect(await saveLiveRankedWorks([])).toBe(0);
    expect((await db.liveRankedWorks.toArray()).length).toBe(0);
  });

  it('覆盖写入并跨来源按标题去重', async () => {
    const added1 = await saveLiveRankedWorks([mkWork('fanqie', '雾镇银鱼', { rank: 1 }), mkWork('feilu', '远山有信', { rank: 2 })], '番茄');
    expect(added1).toBe(2);
    const added2 = await saveLiveRankedWorks([mkWork('zongheng', '雾镇银鱼', { rank: 9 })], '纵横');
    expect(added2).toBe(0);
    const rows = await db.liveRankedWorks.toArray();
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.title === '雾镇银鱼')?.sourceName).toBe('番茄');
  });

  it('跳过空白标题并 trim 前后空格', async () => {
    const added = await saveLiveRankedWorks([mkWork('fanqie', '  深海电台  '), mkWork('feilu', '   ')]);
    expect(added).toBe(1);
    const titles = await loadLiveRankedTitles();
    expect(titles).toEqual(['深海电台']);
  });

  it('loadLiveRankedTitles 返回去重后的书名', async () => {
    await saveLiveRankedWorks([mkWork('fanqie', '甲'), mkWork('feilu', '乙'), mkWork('zongheng', '甲')]);
    const titles = await loadLiveRankedTitles();
    expect(titles.sort()).toEqual(['乙', '甲']);
  });

  it('countLiveRankedWorks 统计总数与覆盖平台数', async () => {
    await saveLiveRankedWorks([mkWork('fanqie', '甲'), mkWork('feilu', '乙'), mkWork('fanqie', '丙')]);
    const stat = await countLiveRankedWorks();
    expect(stat.total).toBe(3);
    expect(stat.platforms).toBe(2);
  });

  it('clearLiveRankedWorks 支持全清与按平台清', async () => {
    await saveLiveRankedWorks([mkWork('fanqie', '甲'), mkWork('feilu', '乙')]);
    await clearLiveRankedWorks('fanqie');
    let rows = await db.liveRankedWorks.toArray();
    expect(rows.map((r) => r.title)).toEqual(['乙']);
    await clearLiveRankedWorks();
    rows = await db.liveRankedWorks.toArray();
    expect(rows.length).toBe(0);
  });

  it('purgeStaleLiveRankedWorks 清除超过保活窗口的过期条目', async () => {
    const now = Date.now();
    // 直接以显式时间戳落库，避免 ms 级时序抖动（确定性）
    await db.liveRankedWorks.add({
      id: 'old_1', sourceId: 'fanqie', sourceName: 'fanqie', title: '陈年热梗',
      rank: 1, fetchedAt: now - LIVE_RANK_TTL_MS - 1000,
    } as never);
    await db.liveRankedWorks.add({
      id: 'in_1', sourceId: 'fanqie', sourceName: 'fanqie', title: '窗口内',
      rank: 2, fetchedAt: now - LIVE_RANK_TTL_MS / 2,
    } as never);
    const removed = await purgeStaleLiveRankedWorks();
    expect(removed).toBe(1); // 仅陈年热梗被清
    const titles = (await db.liveRankedWorks.toArray()).map((r) => r.title);
    expect(titles).toEqual(['窗口内']);
  });

  it('saveLiveRankedWorks 会自动清理过期条目避免无限膨胀', async () => {
    await db.liveRankedWorks.add({
      id: 'ancient_1', sourceId: 'fanqie', sourceName: 'fanqie', title: '远古热梗',
      rank: 1, fetchedAt: Date.now() - LIVE_RANK_TTL_MS * 2,
    } as never);
    await saveLiveRankedWorks([mkWork('feilu', '榜单新书')]);
    const titles = (await db.liveRankedWorks.toArray()).map((r) => r.title);
    expect(titles).not.toContain('远古热梗');
    expect(titles).toContain('榜单新书');
  });
});
