import { describe, it, expect, vi } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
}));

import {
  RANK_SOURCES,
  GENRE_TRENDS,
  getTrend,
  deriveTrendHints,
  generateTrendInspiration,
} from './trends';

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

describe('lib/trend/trends', () => {
  it('内置 5 个平台渠道', () => {
    expect(RANK_SOURCES.length).toBeGreaterThanOrEqual(5);
    expect(RANK_SOURCES.some((s) => s.id === 'qidian')).toBe(true);
  });

  it('每个题材画像字段完整', () => {
    for (const t of GENRE_TRENDS) {
      expect(t.genre).toBeTruthy();
      expect(t.hotspot.length).toBeGreaterThan(3);
      expect(t.tropes.length).toBeGreaterThanOrEqual(1);
      expect(t.contrast.length).toBeGreaterThanOrEqual(1);
      expect(t.words.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('getTrend 渠道×题材返回正确分析', () => {
    const t = getTrend('qidian', '玄幻');
    expect(t).not.toBeNull();
    expect(t!.sourceName).toBe('起点中文网');
    expect(t!.genre).toBe('玄幻');
  });

  it('未知渠道返回 null', () => {
    expect(getTrend('no-such', '玄幻')).toBeNull();
  });

  it('未知题材回退到「其他」', () => {
    const t = getTrend('fanqie', '火星文');
    expect(t).not.toBeNull();
    expect(t!.genre).toBe('其他');
  });

  it('deriveTrendHints 派生可读建议', () => {
    const t = getTrend('jinjiang', '言情')!;
    const hints = deriveTrendHints(t);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.join('')).toContain('晋江文学城');
  });
});

describe('lib/trend/generateTrendInspiration（LLM 路径）', () => {
  it('LLM 返回合法 cards → 解析并过滤空内容，fromLLM=true', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          cards: [
            { kind: 'hook', title: '弃婴开局', content: '开篇即被遗弃，章末身份反转' },
            { kind: 'badkind', title: '非法type', content: '应回退为 structure' },
            { kind: 'coolpoint', title: '空卡', content: '' },
          ],
        })
      )
    );
    const { cards, trend, fromLLM } = await generateTrendInspiration('p1', 'qidian', '玄幻');
    expect(fromLLM).toBe(true);
    expect(trend.sourceName).toBe('起点中文网');
    // 空内容被过滤，剩 2 张
    expect(cards).toHaveLength(2);
    expect(cards[0].kind).toBe('hook');
    // 非法 kind 回退为 structure
    expect(cards[1].kind).toBe('structure');
    expect(cards.every((c) => c.projectId === 'p1' && c.content.length > 0)).toBe(true);
  });

  it('LLM 返回非 JSON/无 cards → 降级为确定性派生卡，fromLLM=false', async () => {
    chatMock.mockResolvedValue(chatResult('不是 JSON'));
    const { cards, fromLLM } = await generateTrendInspiration('p1', 'fanqie', '都市');
    expect(fromLLM).toBe(false);
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe('structure');
    expect(cards[0].content.length).toBeGreaterThan(0);
  });

  it('LLM 抛错 → 静默降级为派生卡，fromLLM=false', async () => {
    chatMock.mockRejectedValue(new Error('网络错误'));
    const { cards, trend, fromLLM } = await generateTrendInspiration('p1', 'fanqie', '都市');
    expect(fromLLM).toBe(false);
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].content).toEqual(expect.any(String));
    expect(trend.sourceName).toContain('番茄');
  });

  it('未知渠道时回退到默认趋势分析', async () => {
    chatMock.mockRejectedValue(new Error('x'));
    const { trend } = await generateTrendInspiration('p1', 'no-such', '都市');
    expect(trend).toBeTruthy();
    expect([...RANK_SOURCES.map((s) => s.name)].includes(trend.sourceName)).toBe(true);
  });

  it('LLM 返回 cards 超过 5 张时截断', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          cards: Array.from({ length: 7 }, (_, i) => ({
            kind: 'other',
            title: `卡${i}`,
            content: `内容${i}`,
          })),
        })
      )
    );
    const { cards, fromLLM } = await generateTrendInspiration('p1', 'fanqie', '都市');
    expect(fromLLM).toBe(true);
    expect(cards.length).toBe(5);
  });
});