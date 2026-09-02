import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateMemoryAfterChapter,
  generateChapterSummary,
  updateForeshadowings,
  updatePlotThreads,
  syncSettingsChanged,
  batchUpdateForeshadowings,
} from './updater';
import type { Chapter, Foreshadowing, PlotThread, SceneDesign } from '@/types';

// 模拟 queries 模块
vi.mock('@/lib/db/queries', () => ({
  saveChapterSummary: vi.fn(),
  saveForeshadowing: vi.fn(),
  markForeshadowingRecovered: vi.fn(),
  markChapterNeedsRecheck: vi.fn(),
  listForeshadowings: vi.fn(),
  listPlotThreads: vi.fn(),
  savePlotThread: vi.fn(),
}));

// 模拟 embedding 模块
vi.mock('./embedding', () => ({
  getDefaultEmbedder: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue(new Float32Array(384)),
  })),
}));

import {
  saveChapterSummary,
  saveForeshadowing,
  markForeshadowingRecovered,
  markChapterNeedsRecheck,
  listForeshadowings,
  listPlotThreads,
  savePlotThread,
} from '@/lib/db/queries';

const mockSceneDesign: SceneDesign = {
  setting: '宗门演武场',
  conflict: '弟子比试',
  highlight: '主角展现实力',
  foreshadowingToPlant: ['f1'],
  foreshadowingToRecover: ['f2'],
  characterAppearances: ['c1', 'c2'],
};

const mockChapter: Chapter = {
  id: 'ch1',
  projectId: 'proj1',
  volumeNo: 1,
  chapterNo: 5,
  title: '初露锋芒',
  plotPoints: ['主角在演武场受伤', '神秘力量觉醒'],
  sceneDesign: mockSceneDesign,
  content: '这是一段章节正文内容，描述了主角在演武场上的精彩表现。',
  wordCount: 1500,
  status: 'completed',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockForeshadowings: Foreshadowing[] = [
  {
    id: 'f1',
    projectId: 'proj1',
    description: '主角体内封印的神秘力量',
    setupChapter: 0,
    importance: 'high',
    status: 'pending',
    relatedCharacters: [],
    createdAt: Date.now(),
  },
  {
    id: 'f2',
    projectId: 'proj1',
    description: '反派的阴谋',
    setupChapter: 2,
    importance: 'medium',
    status: 'planted',
    relatedCharacters: [],
    createdAt: Date.now(),
  },
];

const mockPlotThreads: PlotThread[] = [
  {
    id: 'pt1',
    projectId: 'proj1',
    name: '力量觉醒',
    type: 'main',
    description: '主角体内神秘力量的觉醒过程',
    status: 'active',
    relatedChapters: [1, 2, 3],
    embedding: new Float32Array(384),
    updatedAt: Date.now(),
  },
];

describe('memory/updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateChapterSummary', () => {
    it('应生成章节摘要并保存', async () => {
      const summary = await generateChapterSummary('proj1', mockChapter);

      expect(summary.chapterId).toBe('ch1');
      expect(summary.chapterNo).toBe(5);
      expect(summary.volumeNo).toBe(1);
      expect(summary.summary).toBeTruthy();
      expect(summary.keyEvents).toEqual(mockChapter.plotPoints);
      expect(saveChapterSummary).toHaveBeenCalledTimes(1);
    });

    it('应使用提供的摘要文本', async () => {
      const customSummary = '这是一段自定义的章节摘要';
      const summary = await generateChapterSummary('proj1', mockChapter, customSummary);

      expect(summary.summary).toBe(customSummary);
    });

    it('应提取人物状态', async () => {
      const summary = await generateChapterSummary('proj1', mockChapter);

      expect(summary.characterStates).toBeDefined();
      expect(Object.keys(summary.characterStates).length).toBeGreaterThan(0);
    });
  });

  describe('updateForeshadowings', () => {
    it('应将铺设的伏笔标记为 planted', async () => {
      (listForeshadowings as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockForeshadowings
      );

      await updateForeshadowings('proj1', mockChapter);

      expect(saveForeshadowing).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'f1',
          status: 'planted',
          setupChapter: 5,
        })
      );
    });

    it('应将回收的伏笔标记为 recovered', async () => {
      (listForeshadowings as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockForeshadowings
      );

      await updateForeshadowings('proj1', mockChapter);

      expect(markForeshadowingRecovered).toHaveBeenCalledWith('f2', 5);
    });

    it('无 sceneDesign 时应跳过', async () => {
      const chapterWithoutScene = { ...mockChapter, sceneDesign: undefined };
      await updateForeshadowings('proj1', chapterWithoutScene);

      expect(listForeshadowings).not.toHaveBeenCalled();
    });
  });

  describe('updatePlotThreads', () => {
    it('应将章节关联到匹配的支线', async () => {
      (listPlotThreads as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPlotThreads
      );

      await updatePlotThreads('proj1', mockChapter);

      expect(savePlotThread).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pt1',
          relatedChapters: [1, 2, 3, 5],
        })
      );
    });

    it('支线已关联该章节时应跳过', async () => {
      const threadWithChapter = {
        ...mockPlotThreads[0],
        relatedChapters: [1, 2, 3, 5],
      };
      (listPlotThreads as ReturnType<typeof vi.fn>).mockResolvedValue([
        threadWithChapter,
      ]);

      await updatePlotThreads('proj1', mockChapter);

      expect(savePlotThread).not.toHaveBeenCalled();
    });
  });

  describe('updateMemoryAfterChapter', () => {
    it('应执行完整的记忆更新流程', async () => {
      (listForeshadowings as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockForeshadowings
      );
      (listPlotThreads as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockPlotThreads
      );

      const summary = await updateMemoryAfterChapter('proj1', mockChapter);

      expect(summary).toBeDefined();
      expect(saveChapterSummary).toHaveBeenCalled();
      expect(saveForeshadowing).toHaveBeenCalled();
      expect(savePlotThread).toHaveBeenCalled();
    });
  });

  describe('syncSettingsChanged', () => {
    it('应标记所有已完成章节为 needsRecheck', async () => {
      (markChapterNeedsRecheck as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      const count = await syncSettingsChanged('proj1');

      expect(count).toBe(5);
      expect(markChapterNeedsRecheck).toHaveBeenCalledWith('proj1');
    });
  });

  describe('batchUpdateForeshadowings', () => {
    it('应批量更新伏笔状态', async () => {
      await batchUpdateForeshadowings([
        { id: 'f1', status: 'recovered', actualRecoveryChapter: 5 },
        { id: 'f2', status: 'abandoned' },
      ]);

      expect(markForeshadowingRecovered).toHaveBeenCalledWith('f1', 5);
    });
  });
});