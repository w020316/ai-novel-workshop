// ============================================================================
// 写作数据看板（UX 评估 N1）· 纯计算层
// 输入：章节列表；输出：看板统计与逐章序列（供前端 SVG 渲染，不引入图表库）。
// ============================================================================
import type { Chapter } from '@/types';

export interface ChapterPoint {
  chapterNo: number;
  title: string;
  wordCount: number;
  cumulative: number;
  status: Chapter['status'];
}

export interface DashboardData {
  totalWords: number;
  totalChapters: number;
  completedChapters: number;
  pendingChapters: number;
  avgWordsPerChapter: number;
  longestChapter: { chapterNo: number; wordCount: number } | null;
  maxChapterWords: number; // 用于 SVG 归一化
  series: ChapterPoint[];
  cumulativePeak: number;
  /** 最近一周新增字数（按 updatedAt 粗估）——用于「创作动量」提示 */
  last7dWords: number;
}

/** 按章节号排序的序列；聚合统计 */
export function buildDashboardData(chapters: Chapter[]): DashboardData {
  const sorted = [...chapters].sort((a, b) => a.chapterNo - b.chapterNo);
  const completed = sorted.filter((c) => c.status === 'completed');
  const totalWords = sorted.reduce((s, c) => s + (c.wordCount || 0), 0);
  const completedWords = completed.reduce((s, c) => s + (c.wordCount || 0), 0);

  let cumulative = 0;
  const series = sorted.map((c) => {
    cumulative += c.wordCount || 0;
    return {
      chapterNo: c.chapterNo,
      title: c.title || `第${c.chapterNo}章`,
      wordCount: c.wordCount || 0,
      cumulative,
      status: c.status,
    };
  });

  const maxChapterWords = Math.max(1, ...series.map((p) => p.wordCount));
  let longest: DashboardData['longestChapter'] = null;
  let longestWords = 0;
  for (const p of series) {
    if (p.wordCount > longestWords) {
      longestWords = p.wordCount;
      longest = { chapterNo: p.chapterNo, wordCount: p.wordCount };
    }
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const last7dWords = sorted
    .filter((c) => (c.updatedAt ?? 0) >= weekAgo)
    .reduce((s, c) => s + (c.wordCount || 0), 0);

  return {
    totalWords,
    totalChapters: sorted.length,
    completedChapters: completed.length,
    pendingChapters: sorted.length - completed.length,
    avgWordsPerChapter: completed.length ? Math.round(completedWords / completed.length) : 0,
    longestChapter: longest,
    maxChapterWords,
    series,
    cumulativePeak: Math.max(1, cumulative),
    last7dWords,
  };
}