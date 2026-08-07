// ============================================================================
// 编排器测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateChapter } from './orchestrator';

vi.mock('@/lib/memory/assembler', () => ({
  assembleMemory: vi.fn().mockResolvedValue({
    longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
    midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
    shortTerm: { prevChapters: [], currentPlotPoints: ['测试要点'] },
    tokenEstimate: 500,
  }),
}));

vi.mock('./plot-design', () => ({
  designPlot: vi.fn().mockResolvedValue({
    setting: '测试场景',
    conflict: '测试冲突',
    highlight: '测试爽点',
    foreshadowingToPlant: [],
    foreshadowingToRecover: [],
    characterAppearances: [],
  }),
}));

vi.mock('./writing', () => ({
  writeChapter: vi.fn().mockResolvedValue('生成的章节正文内容...'),
}));

vi.mock('./consistency', () => ({
  checkConsistency: vi.fn().mockResolvedValue({
    chapterId: 'mock-ch',
    passed: true,
    issues: [],
    checkedAt: Date.now(),
  }),
}));

vi.mock('@/lib/memory/updater', () => ({
  updateMemoryAfterChapter: vi.fn().mockResolvedValue({
    id: 'sum1', projectId: 'proj-1', chapterId: 'ch1', chapterNo: 1, volumeNo: 1,
    summary: '摘要', keyEvents: [], characterStates: {}, embedding: new Float32Array(384), createdAt: Date.now(),
  }),
}));

vi.mock('@/lib/db/queries', () => ({
  saveChapter: vi.fn(),
  getProject: vi.fn().mockResolvedValue({
    id: 'proj-1', title: '测试', genre: '玄幻', summary: '', targetWords: 100000,
    stylePresetId: '', llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
    status: 'drafting', currentVolume: 1, currentChapter: 0, createdAt: 0, updatedAt: 0,
  }),
}));

describe('generateChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应完整执行生成流程并返回结果', async () => {
    const context = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await generateChapter(context);
    expect(result).toBeDefined();
    expect(result.content).toBeTruthy();
    expect(result.consistencyReport).toBeDefined();
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('应在生成失败时抛出错误', async () => {
    const mockWrite = vi.mocked(await import('./writing')).writeChapter;
    mockWrite.mockRejectedValueOnce(new Error('生成失败'));

    const context = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    await expect(generateChapter(context)).rejects.toThrow();
  });
});