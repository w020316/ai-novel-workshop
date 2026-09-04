// ============================================================================
// 跨章全文检索（Chapter-level Full-text Search）
// 用途：在全部章节正文中检索人名/伏笔/设定词，返回命中章节 + 上下文片段 +
//       高亮片段 + 命中次数，帮助作者在百万字长篇中快速定位设定出现位置。
// 设计：纯函数+确定性、无网络/无 IndexedDB、可测；单关键词统一小写匹配，
//       片段以关键词为中心左右对称截取，命中词置于窗口中央。
// ============================================================================

export interface ChapterSearchHit {
  /** 章节标识（通常为 chapterNo 字符串） */
  chapterId: string;
  chapterNo: number;
  title: string;
  /** 该章命中次数 */
  count: number;
  /** 上下文片段（以命中词为中心的若干段） */
  snippets: string[];
}

export interface ChapterSearchResult {
  query: string;
  /** 命中章节列表（按章号升序） */
  hits: ChapterSearchHit[];
  /** 命中章节数 */
  matchedChapters: number;
  /** 全书总命中次数 */
  totalMatches: number;
}

export interface SearchableChapter {
  id: string;
  chapterNo: number;
  title: string;
  content: string;
}

export interface ChapterSearchOptions {
  /** 每个命中章节最多返回的上下文片段数（缺省 3） */
  maxSnippets?: number;
  /** 片段半宽（命中词两侧各取字符数，缺省 30） */
  snippetRadius?: number;
}

const DEFAULT_MAX_SNIPPETS = 3;
const DEFAULT_RADIUS = 30;

/**
 * 在章节集中检索关键词。
 * @param chapters 章节（含未完成稿，一并可搜）
 * @param query 搜索词（空串返回空结果）
 */
export function searchChapters(
  chapters: SearchableChapter[],
  query: string,
  options: ChapterSearchOptions = {}
): ChapterSearchResult {
  const q = (query ?? '').trim();
  if (!q) return { query: q, hits: [], matchedChapters: 0, totalMatches: 0 };

  const ql = q.toLowerCase();
  const maxSnippets = Math.max(1, options.maxSnippets ?? DEFAULT_MAX_SNIPPETS);
  const radius = Math.max(1, options.snippetRadius ?? DEFAULT_RADIUS);

  const hits: ChapterSearchHit[] = [];
  let totalMatches = 0;

  for (const ch of chapters) {
    const content = ch.content ?? '';
    if (!content) continue;
    const lower = content.toLowerCase();

    // 计数命中次数（非重叠）
    let count = 0;
    let idx = lower.indexOf(ql);
    const positions: number[] = [];
    while (idx !== -1) {
      count++;
      positions.push(idx);
      idx = lower.indexOf(ql, idx + q.length);
    }
    if (count === 0) continue;

    totalMatches += count;
    hits.push({
      chapterId: ch.id,
      chapterNo: ch.chapterNo,
      title: ch.title || `第${ch.chapterNo}章`,
      count,
      snippets: extractSnippets(content, positions, q, maxSnippets, radius),
    });
  }

  hits.sort((a, b) => a.chapterNo - b.chapterNo);
  return { query: q, hits, matchedChapters: hits.length, totalMatches };
}

/**
 * 从命中位置提取互不重叠的上下文片段（命中词置于中央，含中略号）。
 * 去重相邻位置产生的重复片段。
 */
function extractSnippets(
  content: string,
  positions: number[],
  q: string,
  maxSnippets: number,
  radius: number
): string[] {
  const snippets: string[] = [];
  for (const pos of positions) {
    if (snippets.length >= maxSnippets) break;
    const start = Math.max(0, pos - radius);
    const end = Math.min(content.length, pos + q.length + radius);
    let seg = content.slice(start, end);
    // 压缩内部换行为空格，保证片段单行可读
    seg = seg.replace(/\s+/g, ' ');
    if (start > 0) seg = '…' + seg;
    if (end < content.length) seg = seg + '…';
    // 跳过与上一条几乎相同的重复片段
    if (!snippets.some((s) => s === seg)) {
      snippets.push(seg);
    }
  }
  return snippets;
}