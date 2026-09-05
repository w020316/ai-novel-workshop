// 人物团提案生成器单测：归一化校验 + LLM mock + 回退路径
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}));

import { chat } from '@/lib/llm/client';
import { generateCastProposal, normalizeCastProposal } from './cast';

const mockChat = vi.mocked(chat);

describe('normalizeCastProposal', () => {
  it('接受 {cast:[...]} 结构并过滤非法项、去重、钳制数量', () => {
    const raw = {
      cast: [
        { name: '林九', role: 'protagonist', keywords: '坚韧、复仇' },
        { name: '林九', role: 'supporting', keywords: '重复姓名应剔除' },
        { name: '', role: 'supporting', keywords: '缺姓名剔除' },
        { name: '王五', role: 'unknown', keywords: '非法角色剔除' },
        { name: '赵六', role: 'antagonist', keywords: '城府、执念' },
      ],
    };
    const out = normalizeCastProposal(raw, 6);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(2);
    expect(out![0]).toEqual({ name: '林九', role: 'protagonist', keywords: '坚韧、复仇' });
    expect(out![1].name).toBe('赵六');
  });

  it('顶层数组同样可用', () => {
    const out = normalizeCastProposal(
      [{ name: 'A', role: 'minor', keywords: 'k' }],
      5
    );
    expect(out).toHaveLength(1);
  });

  it('完全非法输入返回 null', () => {
    expect(normalizeCastProposal('oops', 5)).toBeNull();
    expect(normalizeCastProposal({ cast: 'no' }, 5)).toBeNull();
    expect(normalizeCastProposal({ cast: [{ name: 'x', role: 'minor' }] }, 5)).toBeNull();
  });
});

describe('generateCastProposal', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it('LLM 成功：返回归一化提案且不回退', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        cast: [
          { name: '沈青梧', role: 'protagonist', keywords: '扫地即是禁咒、守墓人、隐世高手' },
          { name: '顾长风', role: 'supporting', keywords: '豪爽、刀客、忠义' },
          { name: '乌衡', role: 'antagonist', keywords: '禁咒执掌者、傲慢、秩序' },
          { name: '小满', role: 'minor', keywords: '机灵、市井、消息贩子' },
        ],
      }),
    } as never);

    const { proposals, usedFallback } = await generateCastProposal({ genre: '玄幻' });
    expect(usedFallback).toBe(false);
    expect(proposals).toHaveLength(4);
    expect(proposals[0].name).toBe('沈青梧');
    expect(mockChat).toHaveBeenCalledOnce();
  });

  it('LLM 返回垃圾内容：回退题材启发式人物团（含主角与反派）', async () => {
    mockChat.mockResolvedValueOnce({ content: '这不是 JSON' } as never);
    const { proposals, usedFallback } = await generateCastProposal({ genre: '玄幻' });
    expect(usedFallback).toBe(true);
    expect(proposals.length).toBeGreaterThanOrEqual(3);
    expect(proposals.some((p) => p.role === 'protagonist')).toBe(true);
    expect(proposals.some((p) => p.role === 'antagonist')).toBe(true);
  });

  it('LLM 抛错（如未配 Key）：静默回退，保证一键生成始终可用', async () => {
    mockChat.mockRejectedValueOnce(new Error('no api key'));
    const { proposals, usedFallback } = await generateCastProposal({ genre: '都市' });
    expect(usedFallback).toBe(true);
    expect(proposals.length).toBeGreaterThanOrEqual(3);
    expect(proposals.every((p) => p.keywords.length > 0)).toBe(true);
  });

  it('count 钳制到 3-6', async () => {
    mockChat.mockRejectedValueOnce(new Error('x'));
    const { proposals } = await generateCastProposal({ count: 99 });
    expect(proposals.length).toBeLessThanOrEqual(6);
  });
});
