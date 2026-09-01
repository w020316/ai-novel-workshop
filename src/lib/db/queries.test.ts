import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import * as q from './queries';
import type {
  NovelProject,
  Worldview,
  Character,
  Outline,
  Foreshadowing,
  Chapter,
  ChapterSummary,
  PlotThread,
  ConsistencyReport,
  StylePreset,
  GenreTemplate,
} from '@/types';

// 测试数据构造辅助
function makeProject(over = {}): Omit<NovelProject, 'id' | 'createdAt' | 'updatedAt' | 'currentVolume' | 'currentChapter'> {
  return {
    title: '测试小说',
    genre: '玄幻',
    summary: '测试简介',
    targetWords: 100000,
    stylePresetId: 'style-preset-1',
    llmConfig: { provider: 'zhipu', model: 'glm-4-flash', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
    status: 'ongoing',
    ...over,
  };
}

function makeChapter(projectId: string, chapterNo: number, over: Partial<Chapter> = {}): Chapter {
  return {
    id: `ch-${chapterNo}`,
    projectId,
    volumeNo: 1,
    chapterNo,
    title: `第${chapterNo}章`,
    plotPoints: ['测试要点'],
    content: '测试正文',
    wordCount: 100,
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  };
}

function makeSummary(projectId: string, chapterNo: number): ChapterSummary {
  return {
    id: `summary-${chapterNo}`,
    projectId,
    chapterId: `ch-${chapterNo}`,
    chapterNo,
    volumeNo: 1,
    summary: `第${chapterNo}章摘要`,
    keyEvents: ['事件'],
    characterStates: {},
    embedding: new Float32Array(8),
    createdAt: Date.now(),
  };
}

function makeForeshadowing(projectId: string, id: string, status: Foreshadowing['status']): Foreshadowing {
  return {
    id,
    projectId,
    description: `伏笔${id}`,
    setupChapter: 1,
    importance: 'high',
    status,
    relatedCharacters: [],
    createdAt: Date.now(),
  };
}

describe('db/queries', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  // ============ 项目 ============
  describe('项目 CRUD', () => {
    it('createProject 应生成 id 并写入', async () => {
      const id = await q.createProject(makeProject());
      const p = await db.projects.get(id);
      expect(p).toBeTruthy();
      expect(p!.currentVolume).toBe(1);
      expect(p!.currentChapter).toBe(0);
      expect(p!.createdAt).toBeGreaterThan(0);
    });

    it('getProject / listProjects / updateProject', async () => {
      const id = await q.createProject(makeProject());
      expect((await q.getProject(id))?.title).toBe('测试小说');
      await q.updateProject(id, { title: '改标题' });
      expect((await q.getProject(id))?.title).toBe('改标题');
      // 归档默认不展示
      await q.archiveProject(id);
      expect(await q.listProjects()).toHaveLength(0);
      expect(await q.listProjects(true)).toHaveLength(1);
    });

    it('deleteProject 应级联删除并清理孤儿一致性报告', async () => {
      const pid = await q.createProject(makeProject());
      await db.chapters.bulkAdd([makeChapter(pid, 1), makeChapter(pid, 2)]);
      const report: ConsistencyReport = {
        chapterId: 'ch-1',
        passed: false,
        issues: [{ type: 'plot', severity: 'error', description: '冲突', suggestion: '修复' }],
        checkedAt: Date.now(),
      };
      await db.consistencyReports.add(report);
      await db.characters.add({
        id: 'char-1', projectId: pid, name: '主角', role: 'protagonist',
        appearance: '', personality: '', catchphrase: '', background: '', motivation: '',
        weakness: '', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '',
        locked: false, updatedAt: Date.now(),
      } satisfies Character);
      await db.worldviews.add({ id: 'wv-1', projectId: pid, worldStructure: '结构', powerSystem: '力量', geography: '', era: '', factions: '', rules: [], locked: false, updatedAt: Date.now() } satisfies Worldview);
      await db.outlines.add({ id: 'ol-1', projectId: pid, volumes: [], mainPlotline: '主线', climaxNodes: [], ending: '', updatedAt: Date.now() } satisfies Outline);

      await q.deleteProject(pid);

      expect(await db.projects.get(pid)).toBeUndefined();
      expect(await db.chapters.count()).toBe(0);
      expect(await db.worldviews.count()).toBe(0);
      expect(await db.characters.count()).toBe(0);
      expect(await db.outlines.count()).toBe(0);
      // 关键：一致性报告随对应章节删除被清理，无孤儿
      expect(await db.consistencyReports.count()).toBe(0);
    });
  });

  // ============ 世界观 ============
  describe('世界观/大纲', () => {
    it('getWorldview / saveWorldview', async () => {
      const wv: Worldview = { id: 'wv-1', projectId: 'p1', worldStructure: 'S', powerSystem: 'P', geography: 'G', era: 'E', factions: 'F', rules: ['r'], locked: false, updatedAt: 0 };
      await q.saveWorldview(wv);
      const got = await q.getWorldview('p1');
      expect(got?.worldStructure).toBe('S');
      expect(got!.updatedAt).toBeGreaterThan(0);
    });

    it('getOutline / saveOutline', async () => {
      const o: Outline = { id: 'ol-1', projectId: 'p1', volumes: [], mainPlotline: 'M', climaxNodes: [], ending: 'E', updatedAt: 0 };
      await q.saveOutline(o);
      expect((await q.getOutline('p1'))?.mainPlotline).toBe('M');
    });
  });

  // ============ 人物 ============
  describe('人物', () => {
    it('save/list/get/deleteCharacter', async () => {
      const c: Character = { id: 'c1', projectId: 'p1', name: '主角', role: 'protagonist', appearance: '', personality: '冷静', catchphrase: '', background: '', motivation: '', weakness: '', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0 };
      await q.saveCharacter(c);
      expect(await q.listCharacters('p1')).toHaveLength(1);
      expect((await q.getCharacter('c1'))?.personality).toBe('冷静');
      await q.deleteCharacter('c1');
      expect(await q.listCharacters('p1')).toHaveLength(0);
    });
  });

  // ============ 伏笔 ============
  describe('伏笔', () => {
    it('list/保存/筛选待回收', async () => {
      await db.foreshadowings.bulkAdd([
        makeForeshadowing('p1', 'f1', 'pending'),
        makeForeshadowing('p1', 'f2', 'planted'),
        makeForeshadowing('p1', 'f3', 'recovered'),
      ]);
      expect(await q.listForeshadowings('p1')).toHaveLength(3);
      expect(await q.listPendingForeshadowings('p1')).toHaveLength(2);
    });

    it('markForeshadowingRecovered 更新状态与回收章节', async () => {
      await db.foreshadowings.add(makeForeshadowing('p1', 'f1', 'planted'));
      await q.markForeshadowingRecovered('f1', 10);
      const f = await db.foreshadowings.get('f1');
      expect(f?.status).toBe('recovered');
      expect(f?.actualRecoveryChapter).toBe(10);
    });
  });

  // ============ 章节 ============
  describe('章节', () => {
    it('listChapters 应按章节号排序', async () => {
      await db.chapters.bulkAdd([makeChapter('p1', 3), makeChapter('p1', 1), makeChapter('p1', 2)]);
      const list = await q.listChapters('p1');
      expect(list.map((c) => c.chapterNo)).toEqual([1, 2, 3]);
    });

    it('getChapter / getChapterById', async () => {
      await db.chapters.add(makeChapter('p1', 2));
      expect((await q.getChapter('p1', 2))?.id).toBe('ch-2');
      expect((await q.getChapterById('ch-2'))?.chapterNo).toBe(2);
    });

    it('markChapterNeedsRecheck 仅标记已完成章节并返回计数', async () => {
      await db.chapters.bulkAdd([
        makeChapter('p1', 1, { status: 'completed' }),
        makeChapter('p1', 2, { status: 'drafting' }),
        makeChapter('p1', 3, { status: 'completed' }),
      ]);
      const n = await q.markChapterNeedsRecheck('p1');
      expect(n).toBe(2);
      expect((await db.chapters.get('ch-1'))?.needsRecheck).toBe(true);
      expect((await db.chapters.get('ch-2'))?.needsRecheck).toBeUndefined();
    });

    it('getProjectStats 统计字数与完成章节', async () => {
      await db.chapters.bulkAdd([
        makeChapter('p1', 1, { wordCount: 200, status: 'completed' }),
        makeChapter('p1', 2, { wordCount: 100, status: 'drafting' }),
      ]);
      const stats = await q.getProjectStats('p1');
      expect(stats).toEqual({ totalWords: 300, totalChapters: 2, completedChapters: 1 });
    });
  });

  // ============ 支线 ============
  describe('支线剧情', () => {
    it('list/savePlotThread', async () => {
      const t: PlotThread = { id: 't1', projectId: 'p1', name: '支线', type: 'subplot', description: 'desc', status: 'active', relatedChapters: [1], embedding: new Float32Array(), updatedAt: 0 };
      await q.savePlotThread(t);
      expect(await q.listPlotThreads('p1')).toHaveLength(1);
    });
  });

  // ============ 章节摘要 ============
  describe('章节摘要（中期记忆）', () => {
    it('listChapterSummaries 排序 + getPrevChapterSummaries 取最近', async () => {
      await db.chapterSummaries.bulkAdd([makeSummary('p1', 4), makeSummary('p1', 2), makeSummary('p1', 3)]);
      const all = await q.listChapterSummaries('p1');
      expect(all.map((s) => s.chapterNo)).toEqual([2, 3, 4]);
      const prev = await q.getPrevChapterSummaries('p1', 4, 2);
      expect(prev.map((s) => s.chapterNo)).toEqual([2, 3]);
    });

    it('saveChapterSummary', async () => {
      await q.saveChapterSummary(makeSummary('p1', 1));
      expect(await db.chapterSummaries.count()).toBe(1);
    });
  });

  // ============ 一致性报告 ============
  describe('一致性报告', () => {
    it('get/saveConsistencyReport', async () => {
      const r: ConsistencyReport = { chapterId: 'ch-1', passed: true, issues: [], checkedAt: Date.now() };
      await q.saveConsistencyReport(r);
      const got = await q.getConsistencyReport('ch-1');
      expect(got?.passed).toBe(true);
    });
  });

  // ============ 文风与模板 ============
  describe('文风预设 & 题材模板', () => {
    it('listStylePresets 项目专属排在前面', async () => {
      await db.stylePresets.bulkAdd([
        { id: 'style-preset-1', name: 'A全局', narrativePerspective: 'first', pacing: 'fast', descriptionDensity: 'sparse', dialogueRatio: 0.3 },
        { id: 'style-proj-p9', name: 'B项目', narrativePerspective: 'first', pacing: 'slow', descriptionDensity: 'medium', dialogueRatio: 0.4 },
      ] satisfies StylePreset[]);
      const list = await q.listStylePresets();
      expect(list[0].id).toBe('style-proj-p9');
      // 不含项目专属
      const globalOnly = await q.listStylePresets(false);
      expect(globalOnly.every((s) => !s.id.startsWith('style-proj-'))).toBe(true);
    });

    it('getProjectStylePreset / getStylePreset', async () => {
      await db.stylePresets.add({ id: 'style-proj-p9', name: '项目风格', narrativePerspective: 'third-limited', pacing: 'fast', descriptionDensity: 'medium', dialogueRatio: 0.35 });
      expect(await q.getProjectStylePreset('p9')).toBeTruthy();
      expect(await q.getStylePreset('style-proj-p9')).toBeTruthy();
    });

    it('deleteStylePreset 禁止删除全局预设', async () => {
      await db.stylePresets.add({ id: 'style-preset-1', name: '全局', narrativePerspective: 'first', pacing: 'fast', descriptionDensity: 'sparse', dialogueRatio: 0.3 });
      await expect(q.deleteStylePreset('style-preset-1')).rejects.toThrow('全局预设不可删除');
    });

    it('listGenreTemplates / getGenreTemplate', async () => {
      const g: GenreTemplate = { id: 'genre-template-1', genre: '玄幻', pacingRule: '规则', highlightDesign: '爽点', readerPreference: '偏好', typicalArcs: ['弧'] };
      await db.genreTemplates.add(g);
      expect(await q.listGenreTemplates()).toHaveLength(1);
      expect((await q.getGenreTemplate('玄幻'))?.id).toBe('genre-template-1');
    });
  });
});