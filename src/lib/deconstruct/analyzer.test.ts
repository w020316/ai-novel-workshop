// ============================================================================
// 拆书工坊（拆文分析 + 灵感沉淀）测试
// ============================================================================
import { describe, it, expect, vi } from 'vitest';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));

import {
  analyzeDeconstruction,
  deriveSuggestions,
  generateDeconstruction,
} from './analyzer';

// 含钩子、爽点、对话与断章的参考片段（500+ 字）
const SAMPLE = `
夜色如墨，朱雀大街空无一人。突然，巷口传来一声闷响——李沉舟脚步一顿，握紧了刀柄。
黑衣人贴着墙根滑落，像一块被丢开的破布。李沉舟只觉得心脏骤停：这人不可能还活着。
"谁派你来的？"他压低嗓音，刀已出鞘三寸。
黑影没有答话。半晌，一只苍白的手探出，指尖叩地三下——是暗号，第五记。
李沉舟瞳孔微缩，当众反将一军："第五记？三日前那夜，你早该被烧成灰了。"
话音未落，黑衣人口中溢出血沫："雷家……动的手。"
李沉舟想起什么，骤然转身。就在这时，城西方向火光冲天，隐约传来喊杀声。他深吸一口气，又缓缓吐出，望着映红半边天的火光，脑海里只剩下一个念头：这场局，究竟是谁布下的？`;
const SHORT = '短短几句，没有内容。';

describe('analyzeDeconstruction（确定性，无 LLM）', () => {
  it('识别钩子、爽点、对话与断章', () => {
    const m = analyzeDeconstruction(SAMPLE);
    expect(m.wordCount).toBeGreaterThan(0);
    expect(m.hasOpeningHook).toBe(true);
    expect(m.hasCliffhanger).toBe(true);
    expect(m.coolPointHits.length).toBeGreaterThan(0);
    expect(m.dialogueRatio).toBeGreaterThan(0);
    expect(m.sentenceCount).toBeGreaterThan(0);
  });

  it('短样本给出更低密度与节奏', () => {
    const m = analyzeDeconstruction(SHORT);
    expect(m.wordCount).toBeLessThan(20);
    expect(m.coolPointDensity).toBe(0);
  });

  it('不同句长推断不同节奏', () => {
    const fast = analyzeDeconstruction('短句。快。打脸。反转。');
    const slow = analyzeDeconstruction(
      '这是一段非常长的铺陈描写，它试图用大量细节累积出一种缓慢而沉重的氛围感，并且在句内不断叠加修饰与转折来拉长节奏。'
    );
    expect(fast.rhythm).toBe('fast');
    expect(slow.rhythm).toBe('slow');
  });
});

describe('deriveSuggestions（降级建议）', () => {
  it('无爽点、无钩子时给出对应建议', () => {
    const m = analyzeDeconstruction('平平无奇的叙述，没有冲突转折，只是流水账。');
    const s = deriveSuggestions(m);
    expect(s.some((x) => x.includes('爽点'))).toBe(true);
    expect(s.some((x) => x.includes('钩子'))).toBe(true);
  });

  it('均衡时给出稳定建议', () => {
    const m = analyzeDeconstruction(SAMPLE);
    const s = deriveSuggestions(m);
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('generateDeconstruction（LLM 赋能，带降级）', () => {
  it('LLM 返回建议与灵感卡时采用', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        suggestions: ['开头先给钩子', '高潮章末留悬念'],
        cards: [
          { kind: 'hook', title: '断章钩子', content: '章末用"就在这时"+危机爆发锁住追读' },
          { kind: 'coolpoint', title: '打脸节奏', content: '冲突后立刻接一个当众反将' },
        ],
      }),
    });
    const { deconstruction, cards } = await generateDeconstruction('proj-1', '《测试》', SAMPLE);
    expect(deconstruction.fromLLM).toBe(true);
    expect(deconstruction.suggestions).toContain('开头先给钩子');
    expect(cards.length).toBe(2);
    expect(cards[0].kind).toBe('hook');
    expect(cards[0].sourceDeconstructionId).toBe(deconstruction.id);
  });

  it('LLM 抛出时降级为指标衍生建议、无灵感卡', async () => {
    chatMock.mockRejectedValue(new Error('api down'));
    const { deconstruction, cards } = await generateDeconstruction('proj-1', '《测试》', SAMPLE);
    expect(deconstruction.fromLLM).toBe(false);
    expect(deconstruction.suggestions.length).toBeGreaterThan(0);
    expect(cards.length).toBe(0);
  });

  it('短样本不调用 LLM', async () => {
    chatMock.mockReset();
    const { deconstruction } = await generateDeconstruction('proj-1', '', SHORT);
    expect(chatMock).not.toHaveBeenCalled();
    expect(deconstruction.suggestions.length).toBeGreaterThan(0);
  });
});