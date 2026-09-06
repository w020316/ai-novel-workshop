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
  const BASE = {
    genre: '都市',
    title: '隐藏大佬',
    summary: '主角有个系统，每天签到，后来家里出事了，他就出手了。',
  };
  /** 在原文基础上扩写的合规润色（原文语句全保留 + 追加内容） */
  const EXPANDED = '主角有个系统，每天签到领奖。后来家里出事了，他就出手了，一鸣惊人。';
  /** 整体改写的不合规润色（措辞全部更换） */
  const REWRITTEN = '少年意外觉醒神秘面板，从此踏上逆袭巅峰之路，家族危机中力挽狂澜。';

  it('LLM 成功（扩写式润色）：返回润色文本且 fromLLM 为 true', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({ summary: EXPANDED }),
    } as never);

    const result = await polishSummary(BASE);

    expect(result.fromLLM).toBe(true);
    expect(result.summary).toBe(EXPANDED);
    expect(mockChat).toHaveBeenCalledTimes(1);
    // prompt 中应包含题材与原简介（底稿）
    const [messages] = mockChat.mock.calls[0] as unknown as [{ content?: string }[]];
    const combined = messages.map((m: { content?: string }) => m.content ?? '').join('\n');
    expect(combined).toContain('都市');
    expect(combined).toContain('隐藏大佬');
    expect(combined).toContain('主角有个系统');
    // 润色 prompt 必须约束「原文为底稿、严禁整体改写」
    const system = messages[0]?.content ?? '';
    expect(system).toContain('原文是底稿');
    expect(system).toContain('严禁整体改写');
  });

  it('首轮整体改写 → 守卫拦截并带返工要求重试，返工通过后返回', async () => {
    mockChat
      .mockResolvedValueOnce({ content: JSON.stringify({ summary: REWRITTEN }) } as never)
      .mockResolvedValueOnce({ content: JSON.stringify({ summary: EXPANDED }) } as never);

    const result = await polishSummary(BASE);

    expect(result.fromLLM).toBe(true);
    expect(result.summary).toBe(EXPANDED);
    expect(mockChat).toHaveBeenCalledTimes(2);
    // 第二次调用的 user 消息携带返工要求
    const secondMessages = mockChat.mock.calls[1]?.[0] as { content?: string }[];
    expect(secondMessages[1]?.content).toContain('返工要求');
    expect(secondMessages[1]?.content).toContain('整体改写');
  });

  it('两次均整体改写 → 保留原简介（keptOriginal）且不视为 LLM 结果', async () => {
    mockChat
      .mockResolvedValueOnce({ content: JSON.stringify({ summary: REWRITTEN }) } as never)
      .mockResolvedValueOnce({
        content: JSON.stringify({ summary: REWRITTEN.replace('少年', '青年') }),
      } as never);

    const result = await polishSummary(BASE);

    expect(result.fromLLM).toBe(false);
    expect(result.keptOriginal).toBe(true);
    expect(result.summary).toBe(BASE.summary);
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

  it('LLM 润色结果超长时截断到 200 字（原文保留在结果内）', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({ summary: '一个普通的升级流故事' + '钩'.repeat(260) }),
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
