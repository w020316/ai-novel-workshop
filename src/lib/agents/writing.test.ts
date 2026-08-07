// ============================================================================
// 文笔创作 Agent 测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeChapter, rewriteParagraph } from './writing';
import type { SceneDesign, AssembledMemory, GenerationContext } from '@/types';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('writeChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应返回章节内容', async () => {
    // Mock SSE response
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"token":"模拟文本"}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
});