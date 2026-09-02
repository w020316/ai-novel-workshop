// ============================================================================
// 文笔创作 Agent 测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeChapter, rewriteParagraph } from './writing';
import type { SceneDesign, AssembledMemory, GenerationContext, StylePreset } from '@/types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock 文风仿写指南，验证注入写作提示词
vi.mock('@/lib/style/clone', () => ({
  styleGuideToPrompt: (g: { summary: string }) => `【文风仿写指南（严格模仿）】\n总括：${g.summary}`,
}));

describe('writeChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应返回章节内容', async () => {
    // Mock SSE response（与生成接口真实协议一致：event + data）
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: start\ndata: {"provider":"zhipu","model":"glm-4-flash"}\n\n'));
        controller.enqueue(encoder.encode('event: token\ndata: {"token":"模拟文本"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"totalTokens":4}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const sceneDesign: SceneDesign = {
      setting: '测试场景',
      conflict: '测试冲突',
      highlight: '测试爽点',
      foreshadowingToPlant: [],
      foreshadowingToRecover: [],
      characterAppearances: [],
    };
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: ['测试要点'] },
      tokenEstimate: 500,
    };
    const context: GenerationContext = {
      projectId: 'proj-1',
      chapterNo: 1,
      plotPoints: ['测试要点'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    const result = await writeChapter(sceneDesign, memory, context);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result).toContain('模拟文本');
  });

  it('有出场人物与文风 sampleText 时也能正常生成', async () => {
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: token\ndata: {"token":"带文风正文"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"totalTokens":5}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, body: mockStream });

    const sceneDesign: SceneDesign = {
      setting: '场景',
      conflict: '冲突',
      highlight: '爽点',
      foreshadowingToPlant: [],
      foreshadowingToRecover: [],
      characterAppearances: ['c1', 'c2'],
    };
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: [] },
      tokenEstimate: 0,
    };
    const context: GenerationContext = {
      projectId: 'proj-1',
      chapterNo: 2,
      plotPoints: [],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };
    const stylePreset: StylePreset = {
      id: 'sp1',
      name: '古风',
      narrativePerspective: 'third-limited',
      pacing: 'medium',
      descriptionDensity: 'medium',
      dialogueRatio: 0.3,
      sampleText: '山巅残雪，寸寸入骨。',
    };

    const result = await writeChapter(sceneDesign, memory, context, stylePreset);

    expect(result).toContain('带文风正文');
  });

  it('带 styleGuide 文风仿写指南时注入写作提示词（请求体中含保证文本）', async () => {
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: token\ndata: {"token":"仿写正文"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"totalTokens":5}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, body: mockStream });

    const sceneDesign: SceneDesign = {
      setting: '场景',
      conflict: '冲突',
      highlight: '爽点',
      foreshadowingToPlant: [],
      foreshadowingToRecover: [],
      characterAppearances: [],
    };
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: [] },
      tokenEstimate: 0,
    };
    const context: GenerationContext = {
      projectId: 'proj-1',
      chapterNo: 5,
      plotPoints: [],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };
    const stylePreset: StylePreset = {
      id: 'sp2',
      name: '冷硬风格',
      narrativePerspective: 'third-limited',
      pacing: 'fast',
      descriptionDensity: 'sparse',
      dialogueRatio: 0.4,
      styleGuide: {
        summary: '冷峻克制的都市悬疑笔法',
        rhythm: '短句卡点',
        tone: '冷叙',
        wordPreferences: '动作词',
        taboos: '禁抒情',
      },
    };

    const result = await writeChapter(sceneDesign, memory, context, stylePreset);
    expect(result).toContain('仿写正文');

    // 请求体应包含文风仿写指南文本
    const body = mockFetch.mock.calls[0][1]?.body as string | undefined;
    const parsed = body ? JSON.parse(body) : null;
    const userPrompt = parsed?.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '';
    expect(userPrompt).toContain('文风仿写指南（严格模仿）');
    expect(userPrompt).toContain('冷峻克制的都市悬疑笔法');
  });

  it('用户主动中断 signal 时应返回已生成的部分内容', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const reader = {
      read: vi.fn().mockRejectedValue((() => {
        const err = new Error('aborted') as Error & { name: string };
        err.name = 'AbortError';
        return err;
      })()),
      releaseLock: vi.fn(),
    };
    mockFetch.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const sceneDesign: SceneDesign = {
      setting: 's', conflict: 'c', highlight: 'h',
      foreshadowingToPlant: [], foreshadowingToRecover: [], characterAppearances: [],
    };
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: ['p'] },
      tokenEstimate: 0,
    };
    const context: GenerationContext = {
      projectId: 'proj-1',
      chapterNo: 3,
      plotPoints: ['p'],
      signal: ctrl.signal,
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    // 主动中断不抛错，返回已生成部分（此处为空字符串）
    const result = await writeChapter(sceneDesign, memory, context);
    expect(result).toBe('');
  });

  it('流错误时应抛出 onError 的错误信息', async () => {
    const reader = {
      read: vi.fn().mockRejectedValue(new Error('流式生成异常')),
      releaseLock: vi.fn(),
    };
    mockFetch.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const sceneDesign: SceneDesign = {
      setting: 's', conflict: 'c', highlight: 'h',
      foreshadowingToPlant: [], foreshadowingToRecover: [], characterAppearances: [],
    };
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: ['p'] },
      tokenEstimate: 0,
    };
    const context: GenerationContext = {
      projectId: 'proj-1',
      chapterNo: 4,
      plotPoints: ['p'],
      onStream: vi.fn(),
      onProgress: vi.fn(),
    };

    await expect(writeChapter(sceneDesign, memory, context)).rejects.toThrow('流式生成异常');
  });
});

describe('rewriteParagraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应返回重写后的文本', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ content: '重写后的段落' }),
    });

    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: [] },
      tokenEstimate: 0,
    };

    const result = await rewriteParagraph('第一段\n\n第二段\n\n第三段', 1, '让它更幽默', memory);
    expect(result).toBe('重写后的段落');
  });

  it('段落索引超出范围时应抛错', async () => {
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: [] },
      tokenEstimate: 0,
    };

    await expect(
      rewriteParagraph('第一段\n\n第二段', 5, '改', memory)
    ).rejects.toThrow('段落索引 5 超出范围（共 2 段）');
  });

  it('HTTP 非 2xx 时应抛「重写失败」', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const memory: AssembledMemory = {
      longTerm: { worldview: null, characters: [], outline: null, pendingForeshadowings: [], stylePreset: null },
      midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
      shortTerm: { prevChapters: [], currentPlotPoints: [] },
      tokenEstimate: 0,
    };

    await expect(
      rewriteParagraph('第一段', 0, '改', memory)
    ).rejects.toThrow('重写失败：HTTP 500');
  });
});