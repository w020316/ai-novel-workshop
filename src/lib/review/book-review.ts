// ============================================================================
// 全书质量红黄榜（跨章汇总）
// 依据：规划「审校复盘」——读者复盘当前逐章进行，缺跨章/卷级视角。
// 职责：用本地确定性读者评审 localReaderReview 扫描全部已完成章节，
//       跨章聚合共性问题，并按质量升序排出「红黄榜」，让作者一眼定位
//       全书最弱的章（红榜必改、黄榜留意），补齐单章审稿看不到的全局视野。
// 说明：纯函数、无 LLM、无网络、无 IndexedDB，稳定可测。
// ============================================================================
import { localReaderReview } from './reader-review';
import type { ReaderMetrics, ReaderReview } from './reader-review';

/** 参与全书扫描的最低下限字数（低于此值视为「空/占位章」跳过） */
export const MIN_REVIEW_WORDS = 100;

export interface BookChapterVerdict {
  chapterNo: number;
  title: string;
  score: number;
  verdict: ReaderReview['verdict'];
  weaknesses: string[];
  suggestions: string[];
  metrics: ReaderMetrics;
}

export interface BookIssueAggregate {
  /** 共性问题文本（弱项/建议，脱敏去重） */
  issue: string;
  /** 命中章节数 */
  count: number;
  /** 命中章节号 */
  chapters: number[];
}

export interface BookReviewSummary {
  /** 参与扫描的章节数 */
  scanned: number;
  /** 平均分（0-100） */
  avgScore: number;
  /** 红榜：dull 章数（追读力偏弱，优先整改） */
  redCount: number;
  /** 黄榜：ok 章数（中规中矩，留意） */
  yellowCount: number;
  /** 绿榜：gripping 章数 */
  greenCount: number;
  /** 红黄榜：按分升序排序的弱章明细 */
  weakest: BookChapterVerdict[];
  /** 全书 TOP 共性问题（跨章高频弱项/建议汇总） */
  aggregated: BookIssueAggregate[];
}

export interface BookScanInput {
  chapterNo: number;
  title?: string;
  content: string;
}

const VERDICT_RANK: Record<ReaderReview['verdict'], number> = { dull: 0, ok: 1, gripping: 2 };

/**
 * 扫描全书章节，汇总读者视角红黄榜。
 * 仅对正文达到 MIN_REVIEW_WORDS 的已完成章节做本地评审，
 * 结果按「红榜 → 黄榜 → 绿榜」排序、同档内按评分升序（弱的在前）。
 */
export function scanBookReaderReview(chapters: BookScanInput[]): BookReviewSummary {
  const verdicts: BookChapterVerdict[] = [];

  for (const ch of chapters) {
    const content = (ch.content ?? '').trim();
    if (!content) continue;
    const r = localReaderReview(content);
    if (r.metrics.wordCount < MIN_REVIEW_WORDS) continue;
    verdicts.push({
      chapterNo: ch.chapterNo,
      title: ch.title ?? '',
      score: r.score,
      verdict: r.verdict,
      weaknesses: r.weaknesses,
      suggestions: r.suggestions,
      metrics: r.metrics,
    });
  }

  // 排序：dull → ok → gripping，同级按分升序（最弱在前）
  const weakest = [...verdicts].sort(
    (a, b) =>
      VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] ||
      a.score - b.score ||
      a.chapterNo - b.chapterNo
  );

  const scanned = verdicts.length;
  const avgScore =
    scanned > 0 ? Math.round((verdicts.reduce((s, v) => s + v.score, 0) / scanned) * 10) / 10 : 0;
  const redCount = verdicts.filter((v) => v.verdict === 'dull').length;
  const yellowCount = verdicts.filter((v) => v.verdict === 'ok').length;
  const greenCount = verdicts.filter((v) => v.verdict === 'gripping').length;

  return {
    scanned,
    avgScore,
    redCount,
    yellowCount,
    greenCount,
    weakest,
    aggregated: aggregateIssues(weakest),
  };
}

/** 跨章聚合共性问题：将弱章的弱项/建议按出现次数归并，去掉重复后按频率降序 */
function aggregateIssues(verdicts: BookChapterVerdict[]): BookIssueAggregate[] {
  const map = new Map<string, number[]>();
  const collect = (issue: string, chapterNo: number) => {
    const list = map.get(issue) ?? [];
    if (!list.includes(chapterNo)) list.push(chapterNo);
    map.set(issue, list);
  };
  for (const v of verdicts) {
    for (const w of v.weaknesses) collect(w, v.chapterNo);
    for (const s of v.suggestions) collect(s, v.chapterNo);
  }
  return [...map.entries()]
    .map(([issue, chapters]) => ({ issue, count: chapters.length, chapters }))
    .sort((a, b) => b.count - a.count || a.issue.localeCompare(b.issue))
    .slice(0, 8);
}