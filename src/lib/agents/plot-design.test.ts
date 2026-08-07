import { describe, it, expect, vi, beforeEach } from 'vitest';
import { designPlot } from './plot-design';
import type { GenerationContext, AssembledMemory } from '@/types';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      setting: '宗门演武场，阳光明媚',
      conflict: '主角与反派进行生死对决',
      highlight: '主角在绝境中觉醒隐藏力量',
      foreshadowingToPlant: ['f_new_1'],
      foreshadowingToRecover: ['f_existing_1'],
      characterAppearances: ['c1', 'c2'],
    }),
    usage: { promptTokens: 100, completionTokens: 50 },
    provider: 'deepseek',
    model: 'deepseek-chat',
  }),
}));

vi.mock('@/lib/memory/assembler', () => ({
  memoryToPrompt: vi.fn(() => 'mock memory prompt'),
}));

const mockMemory: AssembledMemory = {
  longTerm: {
    worldview: null,
    characters: [],
    outline: null,
    pendingForeshadowings: [],
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
    currentPlotPoints: ['主角进入宗门', '遇到神秘老者'],
  },
  tokenEstimate: 500,
};

const mockContext: GenerationContext = {
  projectId: 'proj1',
  chapterNo: 5,
  plotPoints: ['主角进入宗门', '遇到神秘老者'],
  onStream: vi.fn(),
  onProgress: vi.fn(),
};

describe('agents/plot-design', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应生成合法的 SceneDesign', async () => {
    const design = await designPlot(mockContext, mockMemory);

    expect(design).toBeDefined();
    expect(design.setting).toBeTruthy();
    expect(design.conflict).toBeTruthy();
    expect(design.highlight).toBeTruthy();
    expect(Array.isArray(design.foreshadowingToPlant)).toBe(true);
    expect(Array.isArray(design.foreshadowingToRecover)).toBe(true);
    expect(Array.isArray(design.characterAppearances)).toBe(true);
  });

  it('应使用用户干预参数', async () => {
    const contextWithIntervention: GenerationContext = {
      ...mockContext,
      userIntervention: {
        forcedCharacters: ['c3'],
        disabledForeshadowings: ['f_bad'],
      },
    };

    const design = await designPlot(contextWithIntervention, mockMemory);
    expect(design).toBeDefined();
  });

  it('解析失败时应返回默认值', async () => {
    const { chat } = await import('@/lib/llm/client');
    (chat as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: 'invalid json',
      usage: { promptTokens: 10, completionTokens: 5 },
      provider: 'deepseek',
      model: 'deepseek-chat',
    });

    const design = await designPlot(mockContext, mockMemory);
    expect(design).toBeDefined();
    expect(design.setting).toBeTruthy(); // 应有默认值
  });
});