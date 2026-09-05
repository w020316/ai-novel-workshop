import { describe, it, expect } from 'vitest';
import { buildPipeline } from './pipeline';
import type { Chapter, Volume, BatchJob } from '@/types';

function makeChapter(overrides: Partial<Chapter> & { chapterNo: number }): Chapter {
  return {
    id: `ch_${overrides.chapterNo}`,
    projectId: 'p1',
    volumeNo: 1,
    title: `第${overrides.chapterNo}章`,
    plotPoints: [],
    content: 'x'.repeat(100),
    wordCount: 100,
    status: 'completed',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Chapter;
}

const volumes: Volume[] = [
  {
    volumeNo: 1,
    title: '初入江湖',
    summary: '',
    chapterRange: [1, 5],
    coreConflict: '',
  },
  {
    volumeNo: 2,
    title: '宗门试炼',
    summary: '',
    chapterRange: [6, 10],
    coreConflict: '',
  },
];

describe('buildPipeline', () => {
  it('空输入 → 空分组与全零统计', () => {
    const board = buildPipeline([], [], null);
    expect(board.groups).toEqual([]);
    expect(board.stats).toEqual({
      total: 0,
      done: 0,
      recheck: 0,
      active: 0,
      pending: 0,
      failed: 0,
      planned: 0,
    });
  });

  it('按大纲卷分组：已写章 done、规划章 planned', () => {
    const chapters = [
      makeChapter({ chapterNo: 1 }),
      makeChapter({ chapterNo: 2, needsRecheck: true }),
      makeChapter({ chapterNo: 3, status: 'drafting' }),
      makeChapter({ chapterNo: 4, status: 'pending' }),
    ];
    const board = buildPipeline(chapters, volumes, null);
    expect(board.groups.map((g) => g.title)).toEqual(['初入江湖', '宗门试炼']);
    const g1 = board.groups[0].chapters;
    expect(g1.map((n) => n.status)).toEqual(['done', 'recheck', 'active', 'pending', 'planned']);
    expect(g1[4]).toMatchObject({ chapterNo: 5, status: 'planned', exists: false });
    // 卷2 全部规划占位
    expect(board.groups[1].chapters.map((n) => n.status)).toEqual([
      'planned',
      'planned',
      'planned',
      'planned',
      'planned',
    ]);
    expect(board.stats).toEqual({
      total: 10,
      done: 1,
      recheck: 1,
      active: 1,
      pending: 1,
      failed: 0,
      planned: 6,
    });
  });

  it('批量失败章号映射为 failed 节点并携带原因（即使无章节记录）', () => {
    const job: BatchJob = {
      id: 'batch_p1',
      projectId: 'p1',
      total: 3,
      startChapterNo: 6,
      plotTemplate: '',
      status: 'paused',
      updatedAt: 0,
      failedChapterNo: 6,
      lastError: 'LLM 超时',
    };
    const board = buildPipeline([], volumes, job);
    const g2 = board.groups.find((g) => g.volumeNo === 2)!;
    const failedNode = g2.chapters.find((n) => n.chapterNo === 6)!;
    expect(failedNode.status).toBe('failed');
    expect(failedNode.lastError).toBe('LLM 超时');
    expect(board.stats.failed).toBe(1);
  });

  it('失败优先级高于 completed：已有记录的失败章仍标 failed', () => {
    const chapters = [makeChapter({ chapterNo: 1, status: 'completed' })];
    const job: BatchJob = {
      id: 'batch_p1',
      projectId: 'p1',
      total: 1,
      startChapterNo: 1,
      plotTemplate: '',
      status: 'paused',
      updatedAt: 0,
      failedChapterNo: 1,
      lastError: '限流',
    };
    const board = buildPipeline(chapters, volumes, job);
    expect(board.groups[0].chapters[0].status).toBe('failed');
  });

  it('章节 volumeNo 超出大纲范围 → 回退「第 N 卷」标题成组，不丢弃', () => {
    const chapters = [makeChapter({ chapterNo: 20, volumeNo: 3 })];
    const board = buildPipeline(chapters, volumes, null);
    expect(board.groups.map((g) => g.volumeNo)).toEqual([1, 2, 3]);
    const g3 = board.groups.find((g) => g.volumeNo === 3)!;
    expect(g3.title).toBe('第 3 卷');
    expect(g3.chapters).toHaveLength(1);
    expect(g3.chapters[0].status).toBe('done');
  });

  it('无大纲 volumes → 全部按章节自身 volumeNo 成组', () => {
    const chapters = [
      makeChapter({ chapterNo: 1 }),
      makeChapter({ chapterNo: 2 }),
      makeChapter({ chapterNo: 3, volumeNo: 2 }),
    ];
    const board = buildPipeline(chapters, [], null);
    expect(board.groups.map((g) => g.volumeNo)).toEqual([1, 2]);
    expect(board.groups[0].chapters).toHaveLength(2);
    expect(board.stats.done).toBe(3);
  });

  it('章号空洞（删章）不影响分组：空洞处由大纲 planned 补位', () => {
    const chapters = [
      makeChapter({ chapterNo: 1 }),
      makeChapter({ chapterNo: 3 }), // 第 2 章被删
    ];
    const board = buildPipeline(chapters, volumes, null);
    const g1 = board.groups[0].chapters;
    expect(g1.map((n) => n.chapterNo)).toEqual([1, 2, 3, 4, 5]);
    expect(g1[1].status).toBe('planned');
    expect(g1[2].status).toBe('done');
  });

  it('非法卷区间（end < start）被安全跳过', () => {
    const bad: Volume[] = [
      { volumeNo: 1, title: 'x', summary: '', chapterRange: [5, 2], coreConflict: '' },
    ];
    const board = buildPipeline([], bad, null);
    expect(board.groups).toEqual([]);
  });
});
