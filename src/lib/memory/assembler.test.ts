// ============================================================================
// 记忆装配器测试
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { assembleMemory } from './assembler';
import type { LongTermMemory, MidTermMemory, ShortTermMemory } from '@/types';

const emptyLongTerm: LongTermMemory = {
  worldview: null,
  characters: [],
  outline: null,
  pendingForeshadowings: [],
  stylePreset: null,
};

const emptyMidTerm: MidTermMemory = {
  relevantSummaries: [],
  activePlotThreads: [],
  foreshadowingsToRecover: [],
  characterStates: {},
};

describe('assembleMemory', () => {
  it('应在无数据时返回空记忆', async () => {
    const result = await assembleMemory(emptyLongTerm, emptyMidTerm);
    expect(result.longTerm.worldview).toBeNull();
    expect(result.longTerm.characters).toEqual([]);
    expect(result.midTerm.relevantSummaries).toEqual([]);
    expect(result.tokenEstimate).toBeGreaterThanOrEqual(0);
  });

  it('应在有数据时返回完整记忆', async () => {
    const longTerm: LongTermMemory = {
      worldview: {
        id: 'wv1', projectId: 'proj-1', worldStructure: '玄幻世界', powerSystem: '灵力',
        geography: '大陆', era: '古代', factions: '宗门', rules: [], locked: false, updatedAt: 0,
      },
      characters: [
        { id: 'c1', projectId: 'proj-1', name: '主角', role: 'protagonist', appearance: '', personality: '勇敢', catchphrase: '', background: '', motivation: '', weakness: '', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0 },
      ],
      outline: { id: 'o1', projectId: 'proj-1', volumes: [], mainPlotline: '主线', climaxNodes: [], ending: '结局', updatedAt: 0 },
      pendingForeshadowings: [],
      stylePreset: { id: 'st1', name: '爽文', narrativePerspective: 'third-limited', pacing: 'fast', descriptionDensity: 'sparse', dialogueRatio: 0.3 },
    };
    const shortTerm: ShortTermMemory = {
      prevChapters: [],
      currentPlotPoints: ['测试要点'],
    };

    const result = await assembleMemory(longTerm, emptyMidTerm, shortTerm);
    expect(result.longTerm.worldview).not.toBeNull();
    expect(result.longTerm.characters).toHaveLength(1);
    expect(result.longTerm.outline).not.toBeNull();
    expect(result.longTerm.stylePreset).not.toBeNull();
    expect(result.shortTerm.currentPlotPoints).toEqual(['测试要点']);
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });
});