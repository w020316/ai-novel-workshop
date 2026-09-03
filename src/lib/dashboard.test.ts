import { describe, it, expect } from 'vitest';
import { buildDashboardData } from './dashboard';
import type { Chapter } from '@/types';

function ch(no: number, words: number, status: Chapter['status'] = 'completed', updatedAt = 1000 + no * 100): Chapter {
  return {
    id: `c${no}`,
    projectId: 'p1',
    volumeNo: 1,
    chapterNo: no,
    title: `第${no}章`,
    plotPoints: [],
    sceneDesign: {} as Chapter['sceneDesign'],
    content: 'x'.repeat(words),
    wordCount: words,
    status,
    createdAt: 1000 + no * 100,
    updatedAt,
  };
}

describe('lib/dashboard', () => {
  it('空章节返回全零基态', () => {
    const d = buildDashboardData([]);
    expect(d.totalChapters).toBe(0);
    expect(d.totalWords).toBe(0);
    expect(d.maxChapterWords).toBe(1);
    expect(d.cumulativePeak).toBe(1);
  });

  it('按章节号排序并累计字数、统计完成度', () => {
    const d = buildDashboardData([ch(2, 20), ch(1, 10), ch(3, 30)]);
    expect(d.series.map((p) => p.chapterNo)).toEqual([1, 2, 3]);
    expect(d.series[2].cumulative).toBe(60); // 10+20+30
    expect(d.totalWords).toBe(60);
    expect(d.totalChapters).toBe(3);
    expect(d.completedChapters).toBe(3);
    expect(d.avgWordsPerChapter).toBe(20);
  });

  it('未完成章节不计入均已平均', () => {
    const d = buildDashboardData([ch(1, 10), ch(2, 50, 'pending')]);
    expect(d.totalWords).toBe(60);
    expect(d.completedChapters).toBe(1);
    expect(d.pendingChapters).toBe(1);
    expect(d.avgWordsPerChapter).toBe(10); // 仅按已完成 10 字
  });

  it('识别最长章节', () => {
    const d = buildDashboardData([ch(1, 10), ch(2, 80), ch(3, 30)]);
    expect(d.longestChapter).toEqual({ chapterNo: 2, wordCount: 80 });
    expect(d.maxChapterWords).toBe(80);
  });

  it('最近 7 天字数按 updatedAt 统计', () => {
    const now = Date.now();
    const d = buildDashboardData([
      ch(1, 100, 'completed', now),
      ch(2, 200, 'completed', now - 2 * 3600 * 1000),
      ch(3, 400, 'completed', now - 8 * 24 * 3600 * 1000), // 8 天前，排除
    ]);
    expect(d.last7dWords).toBe(300);
  });
});