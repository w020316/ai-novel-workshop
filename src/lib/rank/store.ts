// ============================================================================
// 实时榜单 - 动态查重库（Runtime Overlay Store）
// 把抓取到的实时作品名持久化到 Dexie，作为 checkOriginality 的「运行时叠加黑
// 名单」：生成/体检时对照最新热书，不只依赖内置 static 库。
// ============================================================================
import { db } from '@/lib/db/schema';
import type { LiveRankedWork } from '@/types';
import type { RankedBook } from './scraper';

/** 覆盖/增量写入一批抓取到的实时作品，按 (title) 全库去重，返回新增条数 */
export async function saveLiveRankedWorks(
  works: RankedBook[],
  sourceName = ''
): Promise<number> {
  if (!works.length) return 0;
  const fetchedAt = Date.now();
  const existing = await db.liveRankedWorks.toArray();
  const seenTitle = new Set(existing.map((w) => w.title));
  let added = 0;
  for (const w of works) {
    const low = w.title.trim();
    if (!low || seenTitle.has(low)) continue;
    seenTitle.add(low);
    await db.liveRankedWorks.add({
      id: `${w.sourceId}_${low}_${fetchedAt}`,
      sourceId: w.sourceId,
      sourceName: sourceName || w.sourceId,
      title: low,
      author: w.author,
      rank: w.rank,
      url: w.url,
      fetchedAt,
    } satisfies LiveRankedWork);
    added++;
  }
  return added;
}

/** 取当前运行时叠加黑名单（去重后的作品名） */
export async function loadLiveRankedTitles(): Promise<string[]> {
  const rows = await db.liveRankedWorks.orderBy('fetchedAt').toArray();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (seen.has(r.title)) continue;
    seen.add(r.title);
    out.push(r.title);
  }
  return out;
}

/** 统计运行时叠加库的作品数与覆盖平台数 */
export async function countLiveRankedWorks(): Promise<{ total: number; platforms: number }> {
  const rows = await db.liveRankedWorks.toArray();
  return { total: rows.length, platforms: new Set(rows.map((r) => r.sourceId)).size };
}

/** 清空运行时叠加库（全部或按平台） */
export async function clearLiveRankedWorks(sourceId?: string): Promise<void> {
  if (sourceId) await db.liveRankedWorks.where('sourceId').equals(sourceId).delete();
  else await db.liveRankedWorks.clear();
}
