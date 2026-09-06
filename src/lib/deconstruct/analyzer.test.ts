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
  deconstructionToSkill,
} from './analyzer';
import type { Deconstruction } from '@/types';

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
  it('LLM 返回骨架五件套/因果链/公式/建议/灵感卡时全部采用', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        skeleton: {
          goal: '查明黑衣人身份',
          openingHook: '尸体突现制造危机',
          conflict: '李沉舟 VS 幕后黑手，赌注是城西满城性命',
          payoff: '当众反将一军的智斗快感',
          cliffhanger: '火光冲天+「这局是谁布的」',
        },
        causalChain: ['因为黑衣人携暗号出现', '所以李沉舟识破雷家布局', '进而发现城西火起，全局升级'],
        formula: '使者位携旧暗号归来 → 执棋位识破布局 → 危机位同步爆发收尾',
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
    expect(deconstruction.skeleton?.goal).toBe('查明黑衣人身份');
    expect(deconstruction.causalChain?.length).toBe(3);
    expect(deconstruction.formula).toContain('使者位');
  });

  it('骨架五项不全或因果链不足 3 步时丢弃（防半残骨架）', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        skeleton: { goal: '只有一项', openingHook: '', conflict: '', payoff: '', cliffhanger: '' },
        causalChain: ['只有一步'],
        formula: '  ',
        suggestions: ['正常建议'],
      }),
    });
    const { deconstruction } = await generateDeconstruction('proj-1', '《测试》', SAMPLE);
    expect(deconstruction.skeleton).toBeUndefined();
    expect(deconstruction.causalChain).toBeUndefined();
    expect(deconstruction.formula).toBeUndefined();
    expect(deconstruction.fromLLM).toBe(true);
  });

  it('LLM 抛出时降级为指标衍生建议、无灵感卡', async () => {
    chatMock.mockRejectedValue(new Error('api down'));
    const { deconstruction, cards } = await generateDeconstruction('proj-1', '《测试》', SAMPLE);
    expect(deconstruction.fromLLM).toBe(false);
    expect(deconstruction.suggestions.length).toBeGreaterThan(0);
    expect(cards.length).toBe(0);
    expect(deconstruction.skeleton).toBeUndefined();
  });

  it('短样本不调用 LLM', async () => {
    chatMock.mockReset();
    const { deconstruction } = await generateDeconstruction('proj-1', '', SHORT);
    expect(chatMock).not.toHaveBeenCalled();
    expect(deconstruction.suggestions.length).toBeGreaterThan(0);
  });
});

describe('deconstructionToSkill（拆解沉淀为技能）', () => {
  it('把五件套/因果链/公式/建议组装为 plot 技能指令，并强调只学结构', () => {
    const dec: Deconstruction = {
      id: 'decon_1',
      projectId: 'proj-1',
      sourceTitle: '《测试》第三章',
      samplePreview: '…',
      metrics: analyzeDeconstruction(SAMPLE),
      suggestions: ['开头先给钩子', '高潮章末留悬念', '借鉴节奏铺陈', '多余建议'],
      fromLLM: true,
      skeleton: {
        goal: '查明黑衣人身份',
        openingHook: '尸体突现制造危机',
        conflict: '李沉舟 VS 幕后黑手',
        payoff: '智斗反将的快感',
        cliffhanger: '火光冲天留钩',
      },
      causalChain: ['因为黑衣人出现', '所以识破布局', '进而危机升级'],
      formula: '使者位 → 执棋位 → 危机位',
      createdAt: Date.now(),
    };
    const skill = deconstructionToSkill(dec);
    expect(skill.category).toBe('plot');
    expect(skill.source).toBe('custom');
    expect(skill.name).toContain('拆书·《测试》');
    expect(skill.instruction).toContain('剧情骨架');
    expect(skill.instruction).toContain('核心目标：查明黑衣人身份');
    expect(skill.instruction).toContain('1. 因为黑衣人出现');
    expect(skill.instruction).toContain('使者位 → 执棋位 → 危机位');
    expect(skill.instruction).toContain('开头先给钩子');
    expect(skill.instruction).toContain('严禁照抄');
    expect(skill.instruction).not.toContain('多余建议');
  });

  it('无骨架时仍可生成技能（仅有建议与原创约束）', () => {
    const dec: Deconstruction = {
      id: 'decon_2',
      projectId: 'proj-1',
      sourceTitle: '《测试》',
      samplePreview: '…',
      metrics: analyzeDeconstruction(SAMPLE),
      suggestions: ['借鉴节奏'],
      fromLLM: false,
      createdAt: Date.now(),
    };
    const skill = deconstructionToSkill(dec);
    expect(skill.instruction).toContain('借鉴节奏');
    expect(skill.instruction).toContain('完全原创');
    expect(skill.description).not.toContain('五件套');
  });
});