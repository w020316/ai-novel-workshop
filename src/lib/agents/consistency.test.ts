import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkConsistency, quickCheck } from './consistency';
import type { Chapter, AssembledMemory, SceneDesign } from '@/types';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      passed: true,
      issues: [],
    }),
    usage: { promptTokens: 200, completionTokens: 30 },
    provider: 'deepseek',
    model: 'deepseek-chat',
  }),
}));

const mockSceneDesign: SceneDesign = {
  setting: '宗门演武场',
  conflict: '弟子比试',
  highlight: '主角展现实力',
  foreshadowingToPlant: [],
  foreshadowingToRecover: ['f1'],
  characterAppearances: ['c1'],
};

const mockChapter: Chapter = {
  id: 'ch1',
  projectId: 'proj1',
  volumeNo: 1,
  chapterNo: 5,
  title: '初露锋芒',
  plotPoints: ['主角获胜'],
  sceneDesign: mockSceneDesign,
  content: '主角在演武场上一展身手。',
  wordCount: 100,
  status: 'completed',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockMemory: AssembledMemory = {
  longTerm: {
    worldview: {
      id: 'wv1',
      projectId: 'proj1',
      worldStructure: '仙侠世界',
      powerSystem: '灵气修炼',
      geography: '九州',
      era: '上古',
      factions: '宗门',
      rules: ['不得使用禁术'],
      locked: false,
      updatedAt: Date.now(),
    },
    characters: [
      {
        id: 'c1',
        projectId: 'proj1',
        name: '林玄',
        role: 'protagonist',
        appearance: '剑眉星目',
        personality: '坚韧',
        catchphrase: '天无绝人之路',
        background: '出身平凡',
        motivation: '为父报仇',
        weakness: '重情',
        growthArc: '从废柴到强者',
        relationships: [],
        speechStyle: '犀利',
        behaviorPattern: '遇强则强',
        locked: false,
        updatedAt: Date.now(),
      },
    ],
    outline: null,
    pendingForeshadowings: [
      {
        id: 'f1',
        projectId: 'proj1',
        description: '神秘力量',
        setupChapter: 1,
        importance: 'high',
        status: 'pending',
        relatedCharacters: [],
        createdAt: Date.now(),
      },
    ],
    stylePreset: null,
  },
  midTerm: {
    relevantSummaries: [],
    activePlotThreads: [],
    foreshadowingsToRecover: [],
    characterStates: {},
  },
  shortTerm: {
    prevChapters: [],
    currentPlotPoints: [],
  },
  tokenEstimate: 300,
};

describe('agents/consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('quickCheck', () => {
    it('出场人物在档案中时应无 warning', () => {
      const issues = quickCheck(mockChapter, mockMemory);
      const characterIssues = issues.filter(
        (i) => i.type === 'character'
      );
      expect(characterIssues).toHaveLength(0);
    });

    it('出场人物不在档案中时应报警告', () => {
      const chapterWithUnknown = {
        ...mockChapter,
        sceneDesign: {
          ...mockSceneDesign,
          characterAppearances: ['unknown_id'],
        },
      };
      const issues = quickCheck(chapterWithUnknown, mockMemory);
      expect(issues.some((i) => i.type === 'character')).toBe(true);
    });
  });

  describe('checkConsistency', () => {
    it('应返回校验报告', async () => {
      const report = await checkConsistency(mockChapter, mockMemory);
      expect(report).toBeDefined();
      expect(report.chapterId).toBe('ch1');
      expect(report.checkedAt).toBeGreaterThan(0);
    });
  });
});