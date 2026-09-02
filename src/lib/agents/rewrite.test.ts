import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock, LLMClientErrorMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  LLMClientErrorMock: class extends Error {
    statusCode = 502;
    retryable = true;
  },
}));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
  LLMClientError: LLMClientErrorMock,
}));

import { rewriteForConsistency } from './rewrite';

const input = {
  content: '林渊一剑劈开山门，口中念念有词念道：吾乃天下第一尊者，修为通天彻底。',
  sceneDesign: {
    setting: '山门',
    conflict: '力量失衡',
    highlight: '修为突破',
    foreshadowingToPlant: [],
    foreshadowingToRecover: [],
    characterAppearances: [],
  },
  chapterNo: 3,
  title: '一剑破山门',
  issues: [
    {
      type: 'worldview',
      severity: 'error',
      description: '人物剑修却自称天下第一尊者，违背力量体系设定',
      suggestion: '保持剑修身份，改写纯力量描述',
    },
  ],
  memory: {
    longTerm: {
      worldview: null,
      characters: [],
      outline: {
        id: 'o1',
        projectId: 'p1',
        volumes: [],
        mainPlotline: '主角以剑证道，问鼎武道之巅',
        climaxNodes: [],
        ending: '终成剑神',
        updatedAt: 0,
      },
      pendingForeshadowings: [],
      stylePreset: null,
    },
    midTerm: { relevantSummaries: [], activePlotThreads: [], foreshadowingsToRecover: [], characterStates: {} },
    shortTerm: { prevChapters: [], currentPlotPoints: ['突破'] },
    tokenEstimate: 0,
  },
};

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

describe('rewriteForConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回修正后的正文，并注入主线锚点约束', async () => {
    chatMock.mockResolvedValue(chatResult('林渊一剑劈开山门，剑意冲霄，踏上问鼎武道之巅的长路。'));
    const result = await rewriteForConsistency(input);
    expect(result).toContain('一剑劈开山门');
    expect(result).not.toBe(input.content);
    expect(chatMock).toHaveBeenCalledTimes(1);
    const [messages] = chatMock.mock.calls[0] as [{ role: string; content: string }[]];
    const userPrompt = messages[1].content;
    // 主线锚点与待修正问题必须随修正指示进入 prompt
    expect(userPrompt).toContain('主线锚点');
    expect(userPrompt).toContain('问鼎武道之巅');
    expect(userPrompt).toContain('待修正问题');
    expect(userPrompt).toContain('违背力量体系设定');
    expect(userPrompt).toContain(input.content);
  });

  it('修正结果为空时抛出可重试错误', async () => {
    chatMock.mockResolvedValue(chatResult('   '));
    await expect(rewriteForConsistency(input)).rejects.toBeInstanceOf(LLMClientErrorMock);
  });

  it('修正结果未实际改动原文时抛出可重试错误', async () => {
    chatMock.mockResolvedValue(chatResult('林渊一剑劈开山门，口中念念有词念道：吾乃天下第一尊者，修为通天彻底。'));
    await expect(rewriteForConsistency(input)).rejects.toBeInstanceOf(LLMClientErrorMock);
  });
});