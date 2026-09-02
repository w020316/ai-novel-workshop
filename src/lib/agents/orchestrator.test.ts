// ============================================================================
// 编排器测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateChapter, pickBestCandidate } from './orchestrator';

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

vi.mock('@/lib/llm/generators/chapter-title', () => ({
  generateChapterTitle: vi.fn().mockResolvedValue('灵犀一念'),
}));

vi.mock('./rewrite', () => ({
  rewriteForConsistency: vi.fn().mockResolvedValue('修正后的章节正文内容...'),
}));

vi.mock('./consistency', () => ({
  checkConsistency: vi.fn().mockResolvedValue({
    chapterId: 'mock-ch',
    passed: true,
    issues: [],
    checkedAt: Date.now(),
  }),
  quickCheck: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/memory/long-term', () => ({
  loadLongTermMemory: vi.fn().mockResolvedValue({
    worldview: null,
    characters: [],
    outline: null,
    pendingForeshadowings: [],
    stylePreset: null,
  }),
}));

vi.mock('@/lib/memory/mid-term', () => ({
  loadMidTermMemory: vi.fn().mockResolvedValue({
    relevantSummaries: [],
    activePlotThreads: [],
    foreshadowingsToRecover: [],
    characterStates: {},
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
  getStylePreset: vi.fn().mockResolvedValue({
    id: 'sp1', name: '古风', narrativePerspective: 'third-limited',
    pacing: 'medium', descriptionDensity: 'medium', dialogueRatio: 0.4, sampleText: '夜色沉沉。',
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

  it('项目配置了文风预设时应加载并使用 stylePreset', async () => {
    const queries = await import('@/lib/db/queries');
    vi.mocked(queries.getProject).mockResolvedValue({
      id: 'proj-1', title: '测试', genre: '玄幻', summary: '', targetWords: 100000,
      stylePresetId: 'sp1', llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
      status: 'drafting', currentVolume: 1, currentChapter: 0, createdAt: 0, updatedAt: 0,
    } as never);

    const context = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await generateChapter(context);
    expect(vi.mocked(queries.getStylePreset)).toHaveBeenCalledWith('sp1');
    expect(result.content).toBeTruthy();
  });

  it('记忆装配失败时应降级为空记忆并继续', async () => {
    const { loadLongTermMemory } = await import('@/lib/memory/long-term');
    vi.mocked(loadLongTermMemory).mockRejectedValueOnce(new Error('DB 不可用'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const context = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await generateChapter(context);
    expect(result.content).toBeTruthy();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('一致性校验失败时应降级到快速校验', async () => {
    const consistency = await import('./consistency');
    vi.mocked(consistency.checkConsistency).mockRejectedValueOnce(new Error('LLM 超时'));
    vi.mocked(consistency.quickCheck).mockReturnValue([
      { type: 'character', severity: 'warning', description: '缺人', suggestion: '补人', paragraphIndex: 0 },
    ]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const context = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await generateChapter(context);
    expect(vi.mocked(consistency.quickCheck)).toHaveBeenCalled();
    expect(result.consistencyReport.passed).toBe(false);
    warnSpy.mockRestore();
  });

  it('存在 error 级问题时触发一致性修正重写，二次校验通过后采用修正稿', async () => {
    const consistency = await import('./consistency');
    const invoke = vi.mocked(consistency.checkConsistency);
    invoke
      .mockResolvedValueOnce({
        chapterId: 'mock-ch',
        passed: false,
        issues: [{ type: 'worldview', severity: 'error', description: '力量体系矛盾', suggestion: '修正' }],
        checkedAt: Date.now(),
      })
      .mockResolvedValueOnce({
        chapterId: 'mock-ch',
        passed: true,
        issues: [],
        checkedAt: Date.now(),
      });

    const { rewriteForConsistency } = await import('./rewrite');
    const expectTitle = expect.any(String);
    vi.mocked(rewriteForConsistency).mockResolvedValue('修正后的章节正文内容...');

    const context = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await generateChapter(context);
    expect(rewriteForConsistency).toHaveBeenCalledTimes(1);
    expect(rewriteForConsistency).toHaveBeenCalledWith(
      expect.objectContaining({ issues: [{ type: 'worldview', severity: 'error', description: '力量体系矛盾', suggestion: '修正' }] })
    );
    // 修正稿被采用
    expect(result.content).toBe('修正后的章节正文内容...');
    const stages = context.onProgress.mock.calls.map((c) => c[0]);
    expect(stages).toContain('rewriting_1');
    expect(result.consistencyReport.passed).toBe(true);
    void expectTitle;
  });

  it('一致性修正重写失败时沿用原稿并降级到快速校验', async () => {
    const consistency = await import('./consistency');
    vi.mocked(consistency.checkConsistency).mockResolvedValueOnce({
      chapterId: 'mock-ch',
      passed: false,
      issues: [{ type: 'plot', severity: 'error', description: '剧情矛盾', suggestion: '修正' }],
      checkedAt: Date.now(),
    });
    const { rewriteForConsistency } = await import('./rewrite');
    vi.mocked(rewriteForConsistency).mockRejectedValueOnce(new Error('LLM 不可用'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const context = {
      projectId: 'proj-1',
      chapterNo: 2,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await generateChapter(context);
    expect(result.content).toBeTruthy();
    warnSpy.mockRestore();
  });
});

describe('pickBestCandidate（Q3 抽卡择优）', () => {
  it('选择读者评分更高的候选稿', () => {
    const weak = '太短，毫无展开。'; // <200 字 → 评分明显偏低
    const strong = '突然有人闯入，血光四溅！\n'.repeat(200); // 篇幅充足 + 开篇钩子 → 评分更高
    expect(pickBestCandidate([weak, strong])).toBe(strong);
  });

  it('候选顺序不影响择优结果（评分制稳定）', () => {
    const weak = '太短，毫无展开。';
    const strong = '突然有人闯入，血光四溅！\n'.repeat(200);
    expect(pickBestCandidate([strong, weak])).toBe(strong);
    expect(pickBestCandidate([weak, strong])).toBe(strong);
  });

  it('仅一个候选时直接返回该候选', () => {
    const draft = '突然有人闯入，血光四溅！\n'.repeat(200);
    expect(pickBestCandidate([draft])).toBe(draft);
  });
});