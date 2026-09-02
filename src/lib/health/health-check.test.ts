import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  NovelProject,
  Outline,
  Character,
  Foreshadowing,
  ChapterSummary,
} from '@/types';

const q = vi.hoisted(() => ({
  getProject: vi.fn(),
  getOutline: vi.fn(),
  listCharacters: vi.fn(),
  listForeshadowings: vi.fn(),
  listChapterSummaries: vi.fn(),
  getProjectStats: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => q);

import { runHealthCheck } from './health-check';

const project: NovelProject = {
  id: 'p1', title: '问剑', genre: '玄幻', summary: '', targetWords: 250000,
  stylePresetId: '', llmConfig: { provider: 'deepseek', model: 'x', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
  status: 'ongoing', currentVolume: 1, currentChapter: 30, createdAt: 0, updatedAt: 0,
};

const outline: Outline = {
  id: 'o1', projectId: 'p1',
  volumes: [
    { volumeNo: 1, title: '宗门', summary: '入门修炼', chapterRange: [1, 30], coreConflict: '宗门纷争' },
    { volumeNo: 2, title: '中州', summary: '外出游历', chapterRange: [31, 60], coreConflict: '中州争霸' },
  ],
  mainPlotline: '主角以剑证道，问鼎武道之巅',
  climaxNodes: ['成为剑神'],
  ending: '终成剑神',
  updatedAt: 0,
};

const protagonist: Character = {
  id: 'c1', projectId: 'p1', name: '林渊', role: 'protagonist', appearance: '黑衣剑修',
  personality: '坚韧', catchphrase: '', background: '', motivation: '', weakness: '', growthArc: '',
  relationships: [], speechStyle: '', behaviorPattern: '', locked: true, updatedAt: 0,
};

const minorRole: Character = {
  ...protagonist, id: 'c2', name: '店小二', role: 'minor', locked: false,
};

function summary(n: number, states: Record<string, string> = {}, text = '本章内容'): ChapterSummary {
  return {
    id: `s${n}`, projectId: 'p1', chapterId: `ch${n}`, chapterNo: n, volumeNo: 1,
    summary: text, keyEvents: [], characterStates: states,
    embedding: new Float32Array(), createdAt: 0,
  };
}

function foreshadow(status: Foreshadowing['status'], planned?: number, setup = 1): Foreshadowing {
  return {
    id: `f${Math.random()}`, projectId: 'p1', description: '某伏笔', setupChapter: setup,
    importance: 'medium', plannedRecoveryChapter: planned, status,
    relatedCharacters: [], createdAt: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runHealthCheck', () => {
  it('空项目：指标归零，并提示缺少大纲规划', async () => {
    q.getProject.mockResolvedValue(project);
    q.getOutline.mockResolvedValue(undefined);
    q.listCharacters.mockResolvedValue([]);
    q.listForeshadowings.mockResolvedValue([]);
    q.listChapterSummaries.mockResolvedValue([]);
    q.getProjectStats.mockResolvedValue({ totalWords: 0, totalChapters: 0, completedChapters: 0 });

    const report = await runHealthCheck('p1');
    expect(report.metrics.totalChapters).toBe(0);
    expect(report.issues.some((i) => i.dimension === 'mainline' && i.severity === 'error')).toBe(true);
    expect(report.metrics.foreshadowingBacklog).toBe(0);
  });

  it('健康项目：有主线/结局，无积压，角色活跃', async () => {
    q.getOutline.mockResolvedValue(outline);
    q.listCharacters.mockResolvedValue([protagonist]);
    q.listForeshadowings.mockResolvedValue([
      foreshadow('recovered'),
      foreshadow('planted', 60),
    ]);
    q.listChapterSummaries.mockResolvedValue([summary(30, { c1: '出场' })]);
    q.getProjectStats.mockResolvedValue({ totalWords: 75000, totalChapters: 30, completedChapters: 30 });

    const report = await runHealthCheck('p1');
    expect(report.metrics.plannedChapters).toBe(60);
    expect(report.metrics.mainlineProgress).toBe(50);
    expect(report.metrics.avgWordsPerChapter).toBe(2500);
    expect(report.issues.some((i) => i.dimension === 'foreshadowing')).toBe(false);
    expect(report.issues.some((i) => i.dimension === 'character')).toBe(false);
  });

  it('伏笔超期未回收：触发积压预警', async () => {
    q.getOutline.mockResolvedValue(outline);
    q.listCharacters.mockResolvedValue([protagonist]);
    q.listForeshadowings.mockResolvedValue([
      foreshadow('planted', 20), // 计划第20章回收，当前30章仍未回收
    ]);
    q.listChapterSummaries.mockResolvedValue([summary(30)]);
    q.getProjectStats.mockResolvedValue({ totalWords: 75000, totalChapters: 30, completedChapters: 30 });

    const report = await runHealthCheck('p1');
    expect(report.metrics.overdrawnForeshadowings).toBe(1);
    expect(report.issues.some((i) => i.dimension === 'foreshadowing' && i.title.includes('超期'))).toBe(true);
  });

  it('重点角色长期未出场：触发遗忘预警（次要角色不计）', async () => {
    q.getOutline.mockResolvedValue(outline);
    q.listCharacters.mockResolvedValue([protagonist, minorRole]);
    q.listForeshadowings.mockResolvedValue([]);
    // 主要角色林渊只在前 5 章出场过，当前已 30 章
    q.listChapterSummaries.mockResolvedValue([summary(30), summary(5, { c1: '出场' })]);
    q.getProjectStats.mockResolvedValue({ totalWords: 75000, totalChapters: 30, completedChapters: 30 });

    const report = await runHealthCheck('p1');
    expect(report.metrics.inactiveMainCharacters).toBe(1);
    const charIssue = report.issues.find((i) => i.dimension === 'character');
    expect(charIssue?.detail).toContain('林渊');
    expect(charIssue?.detail).not.toContain('店小二');
  });

  it('爽点密度：命中爽点时指标大于 0 且不预警', async () => {
    q.getOutline.mockResolvedValue(outline);
    q.listCharacters.mockResolvedValue([protagonist]);
    q.listForeshadowings.mockResolvedValue([]);
    // 10 章，其中 3 章含爽点 → 密度 0.3/章 ≥ 0.2
    const summaries = Array.from({ length: 10 }, (_, i) =>
      i < 3 ? summary(i + 1, {}, '当众打脸，全场震惊') : summary(i + 1)
    );
    q.listChapterSummaries.mockResolvedValue(summaries);
    q.getProjectStats.mockResolvedValue({ totalWords: 25000, totalChapters: 10, completedChapters: 10 });

    const report = await runHealthCheck('p1');
    expect(report.metrics.coolPointPerChapter).toBeGreaterThanOrEqual(0.2);
    expect(report.issues.some((i) => i.dimension === 'coolpoint')).toBe(false);
  });

  it('爽点密度：长期无爽点时触发追读力预警', async () => {
    q.getOutline.mockResolvedValue(outline);
    q.listCharacters.mockResolvedValue([protagonist]);
    q.listForeshadowings.mockResolvedValue([]);
    const summaries = Array.from({ length: 20 }, (_, i) => summary(i + 1));
    q.listChapterSummaries.mockResolvedValue(summaries);
    q.getProjectStats.mockResolvedValue({ totalWords: 50000, totalChapters: 20, completedChapters: 20 });

    const report = await runHealthCheck('p1');
    expect(report.metrics.coolPointPerChapter).toBe(0);
    const issue = report.issues.find((i) => i.dimension === 'coolpoint');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
    expect(issue?.title).toContain('爽点密度');
  });
});