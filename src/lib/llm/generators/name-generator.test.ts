import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
}));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
}));

import { generateNamesWithLLM } from './name-generator';

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

function makeInput(count = 3) {
  return {
    projectId: 'proj_1',
    category: 'skill' as const,
    topic: '冰系剑道',
    genre: '玄幻' as const,
    count,
  };
}

describe('generateNamesWithLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LLM 返回合法 JSON 时清洗并截断到 count', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          names: [
            { name: '寒渊剑诀', meaning: '冰寒剑意，深不可测' },
            { name: '玄冰破', meaning: '破冰之威，势如奔雷' },
            { name: '霜天诀', meaning: '霜覆苍天，一念冰封' },
            { name: '多余名字', meaning: '超出数量应被截断' },
          ],
        })
      )
    );
    const names = await generateNamesWithLLM(makeInput(3));
    expect(names).toHaveLength(3);
    expect(names[0].name).toBe('寒渊剑诀');
    expect(names[0].id).toMatch(/^name_/);
  });

  it('返回值含空名字的条目会被过滤', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({ names: [{ name: '  ', meaning: '空名字' }, { name: '有效名', meaning: 'OK' }] })
      )
    );
    const names = await generateNamesWithLLM(makeInput(5));
    expect(names).toHaveLength(1);
    expect(names[0].name).toBe('有效名');
  });

  it('LLM 返回非法内容时回退为空数组，不抛错', async () => {
    chatMock.mockResolvedValue(chatResult('这不是 JSON'));
    const names = await generateNamesWithLLM(makeInput(3));
    expect(names).toHaveLength(0);
  });

  it('LLM 调用失败时回退为空数组，不向上抛错', async () => {
    chatMock.mockRejectedValue(new Error('llm down'));
    const names = await generateNamesWithLLM(makeInput(3));
    expect(names).toHaveLength(0);
  });
});