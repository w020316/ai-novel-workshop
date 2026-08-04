// ============================================================================
// LLM Mock（用于测试，避免消耗 API 额度）
// 依据：spec 7.4 节 Mock 策略
// ============================================================================
import { vi } from 'vitest';
import type {
  LLMAdapter,
  ChatParams,
  StreamChatParams,
  ChatResponse,
  ChatMessage,
  SceneDesign,
  ConsistencyReport,
} from '@/types';

const mockSceneDesign: SceneDesign = {
  setting: '青石板长街，月色如霜',
  conflict: '主角遭遇伏击，需在寡不敌众中突围',
  highlight: '觉醒血脉之力，反杀首领',
  foreshadowingToPlant: [],
  foreshadowingToRecover: [],
  characterAppearances: [],
};

const mockConsistencyReport: ConsistencyReport = {
  chapterId: 'mock-chapter',
  passed: true,
  issues: [],
  checkedAt: Date.now(),
};

const mockNovelText = `夜色沉沉，青石板长街在月色下泛着冷光。

少年立于长街中央，身后是万丈深渊，身前是层层围杀的黑衣人。风掠过他的衣袂，却吹不散他眸底的冷意。

"交出东西，留你全尸。"为首的黑衣人冷声开口，声线里没有半分温度。

少年没有答话，只是缓缓抬起了手中的剑。剑身如水，映着他苍白的脸。

他知道，今夜之后，他要么踏着这些人的尸骨走出长街，要么，就永远留在这里。`;

export const mockLLMAdapter: LLMAdapter = {
  async chat({ messages }: ChatParams): Promise<ChatResponse> {
    const systemPrompt = messages[0]?.content ?? '';
    let content = '';

    if (systemPrompt.includes('剧情设计')) {
      content = JSON.stringify(mockSceneDesign);
    } else if (systemPrompt.includes('校对编辑')) {
      content = JSON.stringify(mockConsistencyReport);
    } else if (systemPrompt.includes('摘要')) {
      content = '本章主角在青石板长街遭遇伏击，觉醒血脉之力反杀首领，身份之谜浮现。';
    } else if (systemPrompt.includes('伏笔')) {
      content = JSON.stringify({
        newForeshadowings: [],
        recoveredForeshadowingIds: [],
      });
    } else {
      content = mockNovelText;
    }

    return {
      content,
      usage: {
        promptTokens: Math.ceil(systemPrompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
      },
    };
  },

  async streamChat({ messages, onToken }: StreamChatParams): Promise<void> {
    const response = await this.chat({ messages });
    // 模拟流式输出：每 10ms 推送一个字符
    for (const char of response.content) {
      await new Promise((r) => setTimeout(r, 1));
      onToken(char);
    }
  },

  async embedding(): Promise<Float32Array> {
    // 返回随机 384 维向量
    const arr = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      arr[i] = Math.random() * 2 - 1;
    }
    // 归一化
    const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
    return arr.map((v) => v / norm) as Float32Array;
  },
};

// Vi mock 工厂函数：用于 vi.mock 时按需定制响应
export function createMockLLMAdapter(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  return { ...mockLLMAdapter, ...overrides };
}

// 构造特定响应的 LLM mock
export function createScriptedLLMAdapter(responses: {
  sceneDesign?: SceneDesign;
  novelText?: string;
  consistencyReport?: ConsistencyReport;
}): LLMAdapter {
  return {
    ...mockLLMAdapter,
    chat: vi.fn(async ({ messages }: ChatParams) => {
      const systemPrompt = messages[0]?.content ?? '';
      let content = '';
      if (systemPrompt.includes('剧情设计')) {
        content = JSON.stringify(responses.sceneDesign ?? mockSceneDesign);
      } else if (systemPrompt.includes('校对编辑')) {
        content = JSON.stringify(responses.consistencyReport ?? mockConsistencyReport);
      } else {
        content = responses.novelText ?? mockNovelText;
      }
      return {
        content,
        usage: { promptTokens: 100, completionTokens: 200 },
      };
    }) as LLMAdapter['chat'],
  };
}

// 构造会抛错的 LLM mock（用于测试重试逻辑）
export function createFailingLLMAdapter(error: Error): LLMAdapter {
  return {
    chat: vi.fn(async () => {
      throw error;
    }) as LLMAdapter['chat'],
    streamChat: vi.fn(async () => {
      throw error;
    }) as LLMAdapter['streamChat'],
    embedding: vi.fn(async () => {
      throw error;
    }) as LLMAdapter['embedding'],
  };
}

// 构造临时序返回的 mock（前N次失败，第N+1次成功）
export function createFlakyLLMAdapter(failCount: number): LLMAdapter {
  let count = 0;
  return {
    chat: vi.fn(async (params: ChatParams) => {
      count++;
      if (count <= failCount) {
        throw new Error(`模拟失败（第 ${count} 次）`);
      }
      return mockLLMAdapter.chat(params);
    }) as LLMAdapter['chat'],
    streamChat: mockLLMAdapter.streamChat,
    embedding: mockLLMAdapter.embedding,
  };
}

export const MOCK_NOVEL_TEXT = mockNovelText;
export const MOCK_SCENE_DESIGN = mockSceneDesign;
export const MOCK_CONSISTENCY_REPORT = mockConsistencyReport;
