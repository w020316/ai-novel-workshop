// ============================================================================
// 记忆装配器测试
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { assembleMemory, memoryToPrompt } from './assembler';
import type { LongTermMemory, MidTermMemory, ShortTermMemory, ChapterSummary, Foreshadowing } from '@/types';

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

  it('超过 token 预算时应触发压缩', async () => {
    const summaries: ChapterSummary[] = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      projectId: 'proj-1',
      chapterId: `ch${i}`,
      chapterNo: i + 1,
      volumeNo: 1,
      summary: '主角在宗门中刻苦修炼剑法并不断突破境界获得新的机缘。'.repeat(3),
      keyEvents: [],
      characterStates: {},
      embedding: new Float32Array(8),
      createdAt: 0,
    }));
    const midTerm: MidTermMemory = {
      relevantSummaries: summaries,
      activePlotThreads: [{ id: 't1', projectId: 'proj-1', name: '支线', type: 'subplot', description: '追查真相', status: 'active', relatedChapters: [], embedding: new Float32Array(), updatedAt: 0 }],
      foreshadowingsToRecover: [],
      characterStates: {},
    };
    const shortTerm: ShortTermMemory = {
      prevChapters: summaries.slice(0, 10),
      currentPlotPoints: ['当前要点'],
    };

    const result = await assembleMemory(emptyLongTerm, midTerm, shortTerm, 200);
    expect(result.tokenEstimate).toBeLessThanOrEqual(300);
    expect(result.midTerm.relevantSummaries.length).toBeLessThan(40);
    expect(result.shortTerm.prevChapters.length).toBeLessThan(10);
  });

  it('memoryToPrompt 应渲染各级记忆各分区文本', () => {
    const longTerm: LongTermMemory = {
      worldview: { id: 'wv', projectId: 'p', worldStructure: '世界架构', powerSystem: '力量体系', geography: '地理', era: '时代', factions: '势力', rules: ['规则1.5'], locked: false, updatedAt: 0 },
      characters: [{ id: 'c', projectId: 'p', name: '主角', role: 'protagonist', appearance: '外貌', personality: '勇敢', catchphrase: '口头禅', background: '背景', motivation: '执念', weakness: '弱点', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0 }],
      outline: { id: 'o', projectId: 'p', volumes: [], mainPlotline: '主线剧情', climaxNodes: [], ending: '结局', updatedAt: 0 },
      pendingForeshadowings: [{ id: 'f', projectId: 'p', description: '待回收伏笔', setupChapter: 1, importance: 'high', status: 'pending', relatedCharacters: [], createdAt: 0 } satisfies Foreshadowing],
      stylePreset: { id: 'st', name: '爽文', narrativePerspective: 'first', pacing: 'fast', descriptionDensity: 'sparse', dialogueRatio: 0.3, sampleText: '样本' },
    };
    const midTerm: MidTermMemory = {
      relevantSummaries: [{ id: 's1', projectId: 'p', chapterId: 'c1', chapterNo: 1, volumeNo: 1, summary: '摘要', keyEvents: [], characterStates: {}, embedding: new Float32Array(), createdAt: 0 }],
      activePlotThreads: [{ id: 't', projectId: 'p', name: '线', type: 'subplot', description: '支线描述', status: 'active', relatedChapters: [], embedding: new Float32Array(), updatedAt: 0 }],
      foreshadowingsToRecover: [],
      characterStates: {},
    };
    const shortTerm: ShortTermMemory = {
      prevChapters: [{ id: 's2', projectId: 'p', chapterId: 'c2', chapterNo: 2, volumeNo: 1, summary: '前情', keyEvents: [], characterStates: {}, embedding: new Float32Array(), createdAt: 0 }],
      currentPlotPoints: ['要点1.5', '要点2'],
    };

    const prompt = memoryToPrompt({ longTerm, midTerm, shortTerm, tokenEstimate: 0 });
    expect(prompt).toContain('【世界观设定】');
    expect(prompt).toContain('世界架构');
    expect(prompt).toContain('【人物档案】');
    // 大纲注入为主线锚点，包含主线程 / 高潮 / 结局归宿
    expect(prompt).toContain('【主线锚点');
    expect(prompt).toContain('主线程：主线剧情');
    expect(prompt).toContain('结局归宿：结局');
    expect(prompt).toContain('【待回收伏笔】');
    expect(prompt).toContain('【文风要求】');
    expect(prompt).toContain('【相关章节回顾】');
    expect(prompt).toContain('【活跃支线】');
    expect(prompt).toContain('【前情提要】');
    expect(prompt).toContain('【当前剧情要点】');
  });

  it('memoryToPrompt 在空记忆时应忽略所有分区', () => {
    const prompt = memoryToPrompt({
      longTerm: emptyLongTerm,
      midTerm: emptyMidTerm,
      shortTerm: { prevChapters: [], currentPlotPoints: [] },
      tokenEstimate: 0,
    });
    expect(prompt).toBe('');
    expect(prompt).not.toContain('【');
  });
});