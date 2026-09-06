import { describe, it, expect, vi } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
}));

import {
  RANK_SOURCES,
  GENRE_TRENDS,
  listGenresByChannel,
  getTrend,
  deriveTrendHints,
  generateTrendInspiration,
  buildGenreSignature,
  matchesGenre,
  deterministicGenreCards,
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
      expect(['male', 'female', 'neutral']).toContain(t.channel);
      expect(t.hotspot.length).toBeGreaterThan(3);
      expect(t.tropes.length).toBeGreaterThanOrEqual(1);
      expect(t.contrast.length).toBeGreaterThanOrEqual(1);
      expect(t.words.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('题材扩容：新增男频/女频题材均在画像内', () => {
    const genres = GENRE_TRENDS.map((t) => t.genre);
    expect(GENRE_TRENDS.length).toBeGreaterThanOrEqual(16);
    for (const g of ['仙侠', '军事', '脑洞', '甜宠', '快穿', '种田']) {
      expect(genres, `应包含新题材 ${g}`).toContain(g);
    }
  });

  it('listGenresByChannel 男频不含女频专属，女频不含男频专属，不限返回全部', () => {
    const male = listGenresByChannel('male');
    const female = listGenresByChannel('female');
    const all = listGenresByChannel('all');
    expect(male).toContain('玄幻');
    expect(male).not.toContain('甜宠');
    expect(male).toContain('都市'); // 中性题材双频道可见
    expect(female).toContain('甜宠');
    expect(female).not.toContain('玄幻');
    expect(all.length).toBe(GENRE_TRENDS.length);
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

describe('lib/trend/题材强绑定（签名词校验）', () => {
  it('buildGenreSignature：包含题材名、热度词、桥段与反差短语片段', () => {
    const t = getTrend('qidian', '玄幻')!;
    const sig = buildGenreSignature(t);
    for (const k of ['玄幻', '觉醒', '血脉觉醒', '表面废柴']) {
      expect(sig, `签名词应含 ${k}`).toContain(k);
    }
  });

  it('matchesGenre：命中签名词通过，纯泛用文本被拒', () => {
    const sig = buildGenreSignature(getTrend('qidian', '玄幻')!);
    expect(matchesGenre('废柴逆袭开局，章末觉醒', sig)).toBe(true);
    expect(matchesGenre('开篇被退婚，章末身份反转', sig)).toBe(false);
    expect(matchesGenre('', sig)).toBe(false);
  });

  it('deterministicGenreCards：内容天然携带题材元素且 genre 锁定', () => {
    const t = getTrend('qidian', '仙侠')!;
    const cards = deterministicGenreCards('p1', t, 3);
    expect(cards.length).toBe(3);
    const sig = buildGenreSignature(t);
    for (const c of cards) {
      expect(matchesGenre(`${c.title}：${c.content}`, sig)).toBe(true);
      expect(c.genre).toBe('仙侠');
    }
  });

  it('deterministicGenreCards：排除已有标题', () => {
    const t = getTrend('qidian', '仙侠')!;
    const [first] = deterministicGenreCards('p1', t, 1);
    const again = deterministicGenreCards('p1', t, 2, [first.title]);
    expect(again.map((c) => c.title)).not.toContain(first.title);
  });
});

describe('lib/trend/generateTrendInspiration（LLM 路径）', () => {
  it('LLM 返回合法 cards → 解析并过滤空内容，fromLLM=true', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          cards: [
            { kind: 'hook', title: '血脉觉醒', content: '开篇血脉觉醒，章末跃迁反杀' },
            { kind: 'badkind', title: '觉醒非法type', content: '应回退为 structure，气运加身' },
            { kind: 'coolpoint', title: '空卡', content: '' },
          ],
        })
      )
    );
    const { cards, trend, fromLLM } = await generateTrendInspiration('p1', 'qidian', '玄幻');
    expect(fromLLM).toBe(true);
    expect(trend.sourceName).toBe('起点中文网');
    // 空内容被过滤剩 2 张 LLM 卡；有效卡不足 3 → 确定性题材卡补齐 1 张
    expect(cards).toHaveLength(3);
    expect(cards[0].kind).toBe('hook');
    // 非法 kind 回退为 structure
    expect(cards[1].kind).toBe('structure');
    // 第 3 张为确定性题材卡（玄幻·桥段 命名）
    expect(cards[2].title.startsWith('玄幻·')).toBe(true);
    expect(cards.every((c) => c.projectId === 'p1' && c.content.length > 0)).toBe(true);
  });

  it('内容不含题材签名词的漂移卡被剔除，重试有效则采用重试结果', async () => {
    const drift = JSON.stringify({
      cards: [{ kind: 'hook', title: '退婚开局', content: '开篇被退婚，章末打脸' }],
    });
    const bound = JSON.stringify({
      cards: [
        { kind: 'hook', title: '血脉觉醒', content: '废柴血脉觉醒，章末跃迁' },
        { kind: 'character', title: '表面废柴', content: '表面废柴实则帝尊，气运藏身' },
        { kind: 'coolpoint', title: '异界降临', content: '异界降临打脸全场，圣境压制的反差' },
      ],
    });
    chatMock.mockResolvedValueOnce(chatResult(drift)).mockResolvedValueOnce(chatResult(bound));
    const { cards, fromLLM } = await generateTrendInspiration('p1', 'qidian', '玄幻');
    expect(fromLLM).toBe(true);
    expect(cards).toHaveLength(3);
    // 返工请求应携带题材绑定要求（chat 首参即 messages 数组，取最后一次调用）
    const reworkMsg = (chatMock.mock.calls.at(-1)![0] as Array<{ role: string; content: string }>).find(
      (m) => m.role === 'user'
    );
    expect(reworkMsg?.content).toContain('题材绑定返工');
  });

  it('重试仍漂移 → 全部用确定性题材卡补齐到 3 张，fromLLM=false', async () => {
    const drift = JSON.stringify({
      cards: [{ kind: 'hook', title: '退婚开局', content: '开篇被退婚，章末打脸' }],
    });
    chatMock.mockResolvedValue(chatResult(drift));
    const { cards, fromLLM } = await generateTrendInspiration('p1', 'qidian', '玄幻');
    expect(cards).toHaveLength(3);
    const sig = buildGenreSignature(getTrend('qidian', '玄幻')!);
    expect(cards.every((c) => matchesGenre(`${c.title}：${c.content}`, sig))).toBe(true);
    expect(cards.every((c) => c.title.startsWith('玄幻·'))).toBe(true);
    expect(fromLLM).toBe(false); // LLM 卡全部因漂移被剔除
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
            content: `隐藏大佬觉醒内容${i}`,
          })),
        })
      )
    );
    const { cards, fromLLM } = await generateTrendInspiration('p1', 'fanqie', '都市');
    expect(fromLLM).toBe(true);
    expect(cards.length).toBe(5);
  });

  it('卡片 genre 强制锁定所选题材（不采信 LLM 自报的其他题材）', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          cards: [
            { kind: 'hook', title: '卡A', content: '觉醒内容', genre: '玄幻' },
            { kind: 'hook', title: '卡B', content: '气运内容', genre: '科幻' },
            { kind: 'hook', title: '卡C', content: '跃迁内容', genre: '不存在的题材' },
            { kind: 'hook', title: '卡D', content: '圣境内容' },
          ],
        })
      )
    );
    const { cards } = await generateTrendInspiration('p1', 'qidian', '玄幻');
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.genre === '玄幻')).toBe(true);
  });

  it('降级兜底卡 genre 为所选题材', async () => {
    chatMock.mockRejectedValue(new Error('网络错误'));
    const { cards } = await generateTrendInspiration('p1', 'fanqie', '都市');
    expect(cards).toHaveLength(1);
    expect(cards[0].genre).toBe('都市');
  });
});