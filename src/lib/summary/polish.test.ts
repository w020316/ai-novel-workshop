import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}));

import { chat } from '@/lib/llm/client';
import { polishSummary, cleanupSummary } from './polish';

const mockChat = vi.mocked(chat);

beforeEach(() => {
  mockChat.mockReset();
});

describe('cleanupSummary（本地降级清理）', () => {
  it('压缩多余空白并去除首尾空白', () => {
    expect(cleanupSummary('  重生   都市\n\n成为  大佬  ')).toBe('重生 都市 成为 大佬');
  });

  it('超过 200 字时截断到 200 字', () => {
    const long = '字'.repeat(260);
    expect(cleanupSummary(long)).toHaveLength(200);
  });
});

describe('polishSummary', () => {
  it('LLM 成功：返回润色文本且 fromLLM 为 true', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: '签到百年，家族陷落那夜，他终于不再隐藏。',
      }),
    } as never);

    const result = await polishSummary({
      genre: '都市',
      title: '隐藏大佬',
      summary: '主角有个系统，每天签到，后来家里出事了，他就出手了。',
    });

    expect(result.fromLLM).toBe(true);
    expect(result.summary).toBe('签到百年，家族陷落那夜，他终于不再隐藏。');
    expect(mockChat).toHaveBeenCalledTimes(1);
    // prompt 中应包含题材与原简介
    const [messages] = mockChat.mock.calls[0] as unknown as [{ content?: string }[]];
    const combined = messages.map((m: { content?: string }) => m.content ?? '').join('\n');
    expect(combined).toContain('都市');
    expect(combined).toContain('隐藏大佬');
    expect(combined).toContain('主角有个系统');
    // 润色 prompt 必须约束「扩写完善而非缩减」
    const system = messages[0]?.content ?? '';
    expect(system).toContain('扩写');
    expect(system).toContain('不得少于原简介');
  });

  it('LLM 失败：降级为本地清理文本且 fromLLM 为 false', async () => {
    mockChat.mockRejectedValueOnce(new Error('LLM 不可用'));

    const original = '  凡人 修仙   的故事  ';
    const result = await polishSummary({
      genre: '仙侠',
      title: '仙道长青',
      summary: original,
    });

    expect(result.fromLLM).toBe(false);
    expect(result.summary).toBe('凡人 修仙 的故事');
  });

  it('LLM 返回非法 JSON：降级为本地清理文本', async () => {
    mockChat.mockResolvedValueOnce({ content: '这不是 JSON' } as never);

    const result = await polishSummary({
      genre: '玄幻',
      title: '测试',
      summary: '一个普通的升级流故事',
    });

    expect(result.fromLLM).toBe(false);
    expect(result.summary).toBe('一个普通的升级流故事');
  });

  it('LLM 返回空 summary 字段：降级为本地清理文本', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({ summary: '   ' }),
    } as never);

    const result = await polishSummary({
      genre: '玄幻',
      title: '测试',
      summary: '一个普通的升级流故事',
    });

    expect(result.fromLLM).toBe(false);
    expect(result.summary).toBe('一个普通的升级流故事');
  });

  it('LLM 润色结果超长时截断到 200 字', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({ summary: '钩'.repeat(260) }),
    } as never);

    const result = await polishSummary({
      genre: '玄幻',
      title: '测试',
      summary: '一个普通的升级流故事',
    });

    expect(result.fromLLM).toBe(true);
    expect(result.summary).toHaveLength(200);
  });

  it('简介小于 4 字时直接返回原样且不调 LLM', async () => {
    const result = await polishSummary({
      genre: '玄幻',
      title: '测试',
      summary: ' 短 ',
    });

    expect(result.fromLLM).toBe(false);
    expect(result.summary).toBe(' 短 ');
    expect(mockChat).not.toHaveBeenCalled();
  });
});
