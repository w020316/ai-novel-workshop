import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLongTermMemory, estimateLongTermTokens } from './long-term';
import type { Worldview, Character, Outline, Foreshadowing, StylePreset } from '@/types';

// 模拟 queries 模块
vi.mock('@/lib/db/queries', () => ({
  getWorldview: vi.fn(),
  listCharacters: vi.fn(),
  getOutline: vi.fn(),
  listPendingForeshadowings: vi.fn(),
  getProjectStylePreset: vi.fn(),
}));

import {
  getWorldview,
  listCharacters,
  getOutline,
  listPendingForeshadowings,
  getProjectStylePreset,
} from '@/lib/db/queries';

const mockWorldview: Worldview = {
  id: 'wv1',
  projectId: 'proj1',
  worldStructure: '仙侠世界，分为九州',
  powerSystem: '灵气修炼，渡劫飞升',
  geography: '东荒、西漠、南疆、北原、中州',
  era: '万年前仙魔大战，封印破碎',
  factions: '宗门林立，强者为尊',
  rules: ['不得使用禁术', '境界压制明显'],
  locked: false,
  updatedAt: Date.now(),
};

const mockCharacters: Character[] = [
  {
    id: 'c1',
    projectId: 'proj1',
    name: '林玄',
    role: 'protagonist' as const,
    appearance: '剑眉星目，白衣胜雪',
    personality: '坚韧不拔',
    catchphrase: '天无绝人之路',
    background: '出身平凡，偶得奇遇',
    motivation: '为父报仇',
    weakness: '重情重义',
    growthArc: '从废柴到强者',
    relationships: [],
    speechStyle: '言辞犀利',
    behaviorPattern: '遇强则强',
    locked: false,
    updatedAt: Date.now(),
  },
];

const mockOutline: Outline = {
  id: 'o1',
  projectId: 'proj1',
  volumes: [{ volumeNo: 1, title: '初入宗门', summary: '入门测试', chapterRange: [1, 10], coreConflict: '身份之谜' }],
  mainPlotline: '主角从凡人成长为绝世强者',
  climaxNodes: ['第一章 入门测试', '第十章 拜师'],
  ending: '主角终成大道',
  updatedAt: Date.now(),
};

const mockForeshadowings: Foreshadowing[] = [
  {
    id: 'f1',
    projectId: 'proj1',
    description: '主角体内封印的神秘力量',
    setupChapter: 1,
    importance: 'high' as const,
    plannedRecoveryChapter: 10,
    status: 'pending' as const,
    relatedCharacters: [],
    createdAt: Date.now(),
  },
];

const mockStylePreset: StylePreset = {
  id: 'sp1',
  name: '古风仙侠',
  narrativePerspective: 'third-limited' as const,
  pacing: 'medium' as const,
  descriptionDensity: 'medium' as const,
  dialogueRatio: 0.4,
  sampleText: '夜色沉沉，青石板长街在月色下泛着冷光。',
};

describe('memory/long-term', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadLongTermMemory', () => {
    it('应加载完整的长期记忆', async () => {
      (getWorldview as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorldview);
      (listCharacters as ReturnType<typeof vi.fn>).mockResolvedValue(mockCharacters);
      (getOutline as ReturnType<typeof vi.fn>).mockResolvedValue(mockOutline);
      (listPendingForeshadowings as ReturnType<typeof vi.fn>).mockResolvedValue(mockForeshadowings);
      (getProjectStylePreset as ReturnType<typeof vi.fn>).mockResolvedValue(mockStylePreset);

      const memory = await loadLongTermMemory('proj1');

      expect(memory.worldview).toEqual(mockWorldview);
      expect(memory.characters).toEqual(mockCharacters);
      expect(memory.outline).toEqual(mockOutline);
      expect(memory.pendingForeshadowings).toEqual(mockForeshadowings);
      expect(memory.stylePreset).toEqual(mockStylePreset);
    });

    it('世界观不存在时应返回 null', async () => {
      (getWorldview as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (listCharacters as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getOutline as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (listPendingForeshadowings as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (getProjectStylePreset as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const memory = await loadLongTermMemory('proj_empty');

      expect(memory.worldview).toBeNull();
      expect(memory.characters).toEqual([]);
      expect(memory.outline).toBeNull();
      expect(memory.pendingForeshadowings).toEqual([]);
      expect(memory.stylePreset).toBeNull();
    });

    it('应并行加载所有数据', async () => {
      (getWorldview as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorldview);
      (listCharacters as ReturnType<typeof vi.fn>).mockResolvedValue(mockCharacters);
      (getOutline as ReturnType<typeof vi.fn>).mockResolvedValue(mockOutline);
      (listPendingForeshadowings as ReturnType<typeof vi.fn>).mockResolvedValue(mockForeshadowings);
      (getProjectStylePreset as ReturnType<typeof vi.fn>).mockResolvedValue(mockStylePreset);

      await loadLongTermMemory('proj1');

      expect(getWorldview).toHaveBeenCalledTimes(1);
      expect(listCharacters).toHaveBeenCalledTimes(1);
      expect(getOutline).toHaveBeenCalledTimes(1);
      expect(listPendingForeshadowings).toHaveBeenCalledTimes(1);
      expect(getProjectStylePreset).toHaveBeenCalledTimes(1);
    });
  });

  describe('estimateLongTermTokens', () => {
    it('应估算完整记忆的 token 消耗', () => {
      const memory = {
        worldview: mockWorldview,
        characters: mockCharacters,
        outline: mockOutline,
        pendingForeshadowings: mockForeshadowings,
        stylePreset: mockStylePreset,
      };

      const tokens = estimateLongTermTokens(memory);
      expect(tokens).toBeGreaterThan(0);
      expect(Number.isFinite(tokens)).toBe(true);
    });

    it('空记忆应返回 0', () => {
      const emptyMemory = {
        worldview: null,
        characters: [],
        outline: null,
        pendingForeshadowings: [],
        stylePreset: null,
      };

      expect(estimateLongTermTokens(emptyMemory)).toBe(0);
    });
  });
});