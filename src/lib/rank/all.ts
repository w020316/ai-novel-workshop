// ============================================================================
// 实时榜单一键抓取（聚合直抓源）
// 供「趋势灵感 - 实时榜单抓取」页「一键抓取全部」使用：把全部样式为 ssr 的
// 平台一次抓取并并入运行时查重库，避免用户逐个平台点击。
// 设计：fetchAllRankSources 接受可注入的 singleScrape（默认 scrapePlatform），
//       便于单测注入 mock，不消耗真实 LLM/网络。
// ============================================================================
import { scrapePlatform, scrapableSourceIds, type RankFetchResult } from './scraper';
import { saveLiveRankedWorks } from './store';

export interface SourceOutcome {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  blocked?: boolean;
  count: number;
  message: string;
}

export interface FetchAllResult {
  /** 各平台抓取结果（含失败/降级） */
  outcomes: SourceOutcome[];
  /** 本次实际并入运行时查重库的新热书数 */
  saved: number;
  /** 全部成功的平台数 */
  successCount: number;
}

/**
 * 依次抓取全部可直抓（ssr）平台，并把成功结果并入运行时查重库。
 * @param singleScrape 单平台抓取器（默认 scrapePlatform；测试注入 mock）
 */
export async function fetchAllRankSources(
  singleScrape: (sourceId: string) => Promise<RankFetchResult> = scrapePlatform
): Promise<FetchAllResult> {
  const ids = scrapableSourceIds();
  const outcomes: SourceOutcome[] = [];
  let saved = 0;
  let successCount = 0;

  // 平台无直抓源时直接返回空结果
  if (ids.length === 0) {
    return { outcomes, saved, successCount };
  }

  // 依次抓取（串行，避免瞬间并发打到各站触发风控）
  for (const sourceId of ids) {
    let result: RankFetchResult;
    try {
      result = await singleScrape(sourceId);
    } catch {
      result = {
        ok: false, sourceId, sourceName: sourceId, url: '', fetchedAt: Date.now(),
        message: '抓取异常',
        books: [],
      };
    }
    if (result.ok && result.books.length > 0) {
      try {
        saved += await saveLiveRankedWorks(result.books, result.sourceName);
      } catch {
        // 落库失败（如 IndexedDB 异常）只记为未并入，不中断整体
      }
      successCount++;
    }
    outcomes.push({
      sourceId,
      sourceName: result.sourceName,
      ok: result.ok,
      blocked: result.blocked,
      count: result.books.length,
      message: result.message ?? '',
    });
  }

  return { outcomes, saved, successCount };
}
