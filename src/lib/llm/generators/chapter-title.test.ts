import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock, LLMClientErrorMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  LLMClientErrorMock: class extends Error {},
}));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
  LLMClientError: LLMClientErrorMock,
}));

import { generateChapterTitle } from './chapter-title';

const input = {
  chapterNo: 23,
  plotPoints: ['主角突破瓶颈', '遭遇暗算'],
  sceneDesign: {
    setting: '秘境深处',
    conflict: '叛徒暴露',
    highlight: '绝境反杀',
    foreshadowingToPlant: [],
    foreshadowingToRecover: [],
    characterAppearances: [],
  },
  volumeTitle: '风起云涌',
};

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

describe('generateChapterTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正常返回清洗后的标题并去除引号', async () => {
    chatMock.mockResolvedValue(chatResult('「秘境反杀」'));
    const title = await generateChapterTitle(input);
    expect(title).toBe('秘境反杀');
  });

  it('超长标题被截断到 12 字以内', async () => {
    chatMock.mockResolvedValue(chatResult('这是一个非常特别极其漫长的章节标题名字测试'));
    const title = await generateChapterTitle(input);
    expect(title.length).toBeLessThanOrEqual(12);
  });

  it('LLM 返回空内容时回退为「第 N 章」', async () => {
    chatMock.mockResolvedValue(chatResult('   '));
    const title = await generateChapterTitle(input);
    expect(title).toBe('第23章');
  });

  it('LLM 调用失败时回退为「第 N 章」，不向上抛错', async () => {
    chatMock.mockRejectedValue(new Error('llm down'));
    const title = await generateChapterTitle(input);
    expect(title).toBe('第23章');
  });

  it('偶发返回 JSON 时兜底解析出标题', async () => {
    chatMock.mockResolvedValue(chatResult('{"title": "一鸣惊人"}'));
    const title = await generateChapterTitle(input);
    expect(title).toBe('一鸣惊人');
  });
});