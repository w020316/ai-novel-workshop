import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock, ErrorClass } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  ErrorClass: class LLMClientErrorMock extends Error {
    statusCode = 0;
    retryable = false;
    constructor(message: string, statusCode = 0, retryable = false) {
      super(message);
      this.statusCode = statusCode;
      this.retryable = retryable;
    }
  },
}));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
  LLMClientError: ErrorClass,
}));

import { generateCharacterWithLLM } from './character';

const input = {
  projectId: 'p1',
  name: '',
  keywords: '冷酷剑修 孤独 复仇',
  role: 'protagonist' as const,
  genre: '玄幻' as const,
};

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateCharacterWithLLM', () => {
  it('解析正常 JSON 并返回完整人物档案（未锁定、roles 关联）', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          name: '洛渊',
          appearance: '一袭玄衣，眉目清冷',
          personality: '隐忍而决绝，对旧事绝口不提',
          catchphrase: '剑在，人在。',
          background: '没落世族遗孤',
          motivation: '为师复仇，重振门楣',
          weakness: '触及旧事时易冲动',
          growthArc: '从独行到执剑护道',
          speechStyle: '惜字如金',
          behaviorPattern: '遇险先以剑开路',
        })
      )
    );

    const c = await generateCharacterWithLLM(input);
    expect(c.projectId).toBe('p1');
    expect(c.role).toBe('protagonist');
    expect(c.locked).toBe(false);
    expect(c.name).toBe('洛渊');
    expect(c.personality).toContain('隐忍');
    expect(c.catchphrase).toBe('剑在，人在。');
    expect(c.relationships).toEqual([]);
    expect(c.id.startsWith('char')).toBe(true);
  });

  it('姓名缺失时用 LLM 返回解析，LLM 也未给姓名则由模板补齐非空', async () => {
    chatMock.mockResolvedValue(
      chatResult(JSON.stringify({ personality: '沉稳而孤傲的性格描述' }))
    );
    const c = await generateCharacterWithLLM(input);
    expect(c.personality).toBe('沉稳而孤傲的性格描述');
    expect(c.name.trim().length).toBeGreaterThan(0);
    // 缺失字段补齐为模板内容（非空）
    expect(c.appearance.trim().length).toBeGreaterThan(0);
    expect(c.background.trim().length).toBeGreaterThan(0);
  });

  it('核心字段 personality 缺失时抛出 LLMClientError 供上层回退', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ name: '无名氏' })));
    await expect(generateCharacterWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('无效文本 / chat 失败时向上抛出', async () => {
    chatMock.mockResolvedValue(chatResult('no json'));
    await expect(generateCharacterWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    await expect(generateCharacterWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('prompt 包含角色定位、关键词、姓名与题材', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ personality: 'x' })));
    await generateCharacterWithLLM(input);
    const [messages] = chatMock.mock.calls[0] as [[{ content?: string }[], unknown]];
    const combined = messages.map((m: { content?: string }) => m.content ?? '').join('\n');
    expect(combined).toContain('主角');
    expect(combined).toContain('冷酷剑修');
    expect(combined).toContain('玄幻');
  });
});