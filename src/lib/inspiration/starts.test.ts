import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
  LLMClientError: class LLMClientErrorMock extends Error {},
}));

import {
  normalizeStarts,
  generateInspirationStarts,
  FALLBACK_STARTS,
  type InspirationStart,
} from './starts';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeStarts', () => {
  it('解析 starts 包装数组并钳制到 5 条', () => {
    const raw = {
      starts: Array.from({ length: 7 }, (_, i) => ({ title: `书名${i}`, genre: '玄幻' })),
    };
    const result = normalizeStarts(raw);
    expect(result).toHaveLength(5);
    expect(result?.[0]).toEqual({ title: '书名0', genre: '玄幻' });
  });

  it('题材越界归「其他」，过滤空标题与排除书名，去重', () => {
    const result = normalizeStarts(
      [
        { title: 'A', genre: '魔法少女' },
        { title: '', genre: '玄幻' },
        { title: 'B', genre: '都市' },
        { title: 'B', genre: '都市' },
        { title: 'EX', genre: '悬疑' },
        { title: 'C', genre: '末世' },
        { title: 'D', genre: '宫斗' },
      ],
      ['EX']
    );
    expect(result).toEqual([
      { title: 'A', genre: '其他' },
      { title: 'B', genre: '都市' },
      { title: 'C', genre: '末世' },
      { title: 'D', genre: '宫斗' },
    ]);
  });

  it('不足 3 条有效项或结构不合法返回 null', () => {
    expect(normalizeStarts([{ title: 'A', genre: '玄幻' }])).toBeNull();
    expect(normalizeStarts('nope')).toBeNull();
    expect(normalizeStarts(null)).toBeNull();
  });
});

describe('generateInspirationStarts', () => {
  it('LLM 返回合法 JSON 时直接使用（AI 优先）', async () => {
    const aiStarts: InspirationStart[] = [
      { title: '扶摇直上', genre: '玄幻' },
      { title: '霓裳劫', genre: '宫斗' },
      { title: '灯下黑', genre: '悬疑' },
      { title: '明天重启', genre: '科幻' },
      { title: '心动信号', genre: '言情' },
    ];
    chatMock.mockResolvedValue({ content: JSON.stringify({ starts: aiStarts }) });
    const { starts, usedFallback } = await generateInspirationStarts(['星河黎明']);
    expect(usedFallback).toBe(false);
    expect(starts).toHaveLength(5);
    // 排除书名传入 prompt
    const [messages] = chatMock.mock.calls[0] as [{ content?: string }[]];
    expect(messages.map((m) => m.content ?? '').join('\n')).toContain('星河黎明');
  });

  it('LLM 失败时回退内置池且不含上一批书名', async () => {
    chatMock.mockRejectedValue(new Error('LLM 不可用'));
    const prev: InspirationStart[] = FALLBACK_STARTS.slice(0, 5).map((s) => s);
    const { starts, usedFallback } = await generateInspirationStarts(prev.map((s) => s.title));
    expect(usedFallback).toBe(true);
    expect(starts).toHaveLength(5);
    for (const s of starts) {
      expect(prev.some((p) => p.title === s.title)).toBe(false);
    }
  });

  it('LLM 返回不合法内容时同样兜底', async () => {
    chatMock.mockResolvedValue({ content: 'no json' });
    const { usedFallback } = await generateInspirationStarts([]);
    expect(usedFallback).toBe(true);
  });
});
