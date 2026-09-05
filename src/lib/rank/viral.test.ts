import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}));

import { chat } from '@/lib/llm/client';
import {
  heuristicViralBreakdown,
  generateViralBreakdowns,
  viralBreakdownsToCards,
  type ViralBreakdown,
} from './viral';

const mockChat = vi.mocked(chat);

beforeEach(() => {
  mockChat.mockReset();
});

describe('heuristicViralBreakdown', () => {
  it('书名关键词推断题材定位与金手指', () => {
    const b = heuristicViralBreakdown({ rank: 1, title: '神豪赘婿的逆袭人生' }, '番茄');
    expect(b.title).toBe('神豪赘婿的逆袭人生');
    expect(b.genre).toBe('都市赘婿/战神流');
    expect(b.goldenFinger).toContain('身份反差');
    expect(b.fromLLM).toBe(false);
    expect(b.hooks.length).toBeGreaterThan(0);
    expect(b.emotionalPayoffs.length).toBeGreaterThan(0);
    expect(b.techniques.length).toBeGreaterThan(0);
  });

  it('无法识别题材时回落通用拆解，不抛错', () => {
    const b = heuristicViralBreakdown({ title: '《某书》' });
    expect(b.genre).toBe('网文热门题材');
    expect(b.emotionalPayoffs[0]).toContain('payoff');
    expect(b.hooks[0]).toContain('钩子');
  });

  it('书名含爽点词时命中对应情绪爽点', () => {
    const b = heuristicViralBreakdown({ title: '废柴逆袭：满级战神归来' });
    expect(b.emotionalPayoffs).toContain('底层逆袭的扬眉吐气');
    expect(b.emotionalPayoffs).toContain('王者归来的反差冲击');
  });

  it('纯函数确定性：同输入同输出', () => {
    const book = { rank: 2, title: '修罗战神' };
    expect(heuristicViralBreakdown(book, '纵横')).toEqual(heuristicViralBreakdown(book, '纵横'));
  });
});

describe('generateViralBreakdowns', () => {
  it('LLM 可用：按书名匹配 LLM 结果，标记 fromLLM', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        books: [
          {
            title: '甲书',
            genre: '玄幻修仙',
            goldenFinger: '吞噬万物体质',
            hooks: ['开篇即灭门惨案'],
            emotionalPayoffs: ['废物觉醒的扬眉吐气'],
            techniques: ['首章建立血仇驱动'],
          },
        ],
      }),
    } as never);

    const out = await generateViralBreakdowns(
      [{ rank: 1, title: '甲书' }, { rank: 2, title: '乙书' }],
      '起点'
    );
    expect(out).toHaveLength(2);
    expect(out[0].fromLLM).toBe(true);
    expect(out[0].goldenFinger).toBe('吞噬万物体质');
    // 未被 LLM 覆盖的书降级启发式
    expect(out[1].fromLLM).toBe(false);
  });

  it('LLM 失败：全部降级启发式且不抛错', async () => {
    mockChat.mockRejectedValueOnce(new Error('quota exhausted'));
    const out = await generateViralBreakdowns([{ rank: 1, title: '赘婿战神' }], '飞卢');
    expect(out).toHaveLength(1);
    expect(out[0].fromLLM).toBe(false);
    expect(out[0].genre).toBe('都市赘婿/战神流');
  });

  it('LLM 产出半残（缺字段）：整部退回启发式，避免半残卡', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        books: [{ title: '丙书', genre: '末世求生' }],
      }),
    } as never);
    const out = await generateViralBreakdowns([{ rank: 3, title: '丙书' }]);
    expect(out[0].fromLLM).toBe(false);
    expect(out[0].genre).not.toBe('末世求生');
  });

  it('只拆头部 maxN 部；空列表安全返回空', async () => {
    mockChat.mockRejectedValueOnce(new Error('skip'));
    const books = Array.from({ length: 9 }, (_, i) => ({ rank: i + 1, title: `书${i + 1}` }));
    const out = await generateViralBreakdowns(books, '番茄', 3);
    expect(out).toHaveLength(3);
    expect(out.map((b) => b.title)).toEqual(['书1', '书2', '书3']);

    const empty = await generateViralBreakdowns([], '番茄');
    expect(empty).toEqual([]);
    expect(mockChat).toHaveBeenCalledTimes(1); // 空列表不调 LLM
  });
});

describe('viralBreakdownsToCards', () => {
  it('拆解结果转换为 structure 灵感卡，内容五要素齐全', () => {
    const bd: ViralBreakdown = {
      title: '甲书',
      genre: '玄幻修仙',
      goldenFinger: '吞噬体质',
      hooks: ['灭门开局'],
      emotionalPayoffs: ['废柴觉醒'],
      techniques: ['血仇驱动'],
      fromLLM: true,
    };
    const cards = viralBreakdownsToCards('proj_1', [bd], '起点');
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.kind).toBe('structure');
    expect(c.title).toBe('出圈拆解·甲书');
    expect(c.projectId).toBe('proj_1');
    expect(c.sourceDeconstructionId).toMatch(/^viral_/);
    expect(c.content).toContain('题材定位：玄幻修仙');
    expect(c.content).toContain('金手指：吞噬体质');
    expect(c.content).toContain('钩子：灭门开局');
    expect(c.content).toContain('情绪爽点：废柴觉醒');
    expect(c.content).toContain('可借鉴：血仇驱动');
    expect(c.content).toContain('（来源：起点 实时榜单）');
  });

  it('空拆解返回空卡列表', () => {
    expect(viralBreakdownsToCards('proj_1', [])).toEqual([]);
  });
});
