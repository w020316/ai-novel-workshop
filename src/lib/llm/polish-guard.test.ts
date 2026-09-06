import { describe, it, expect } from 'vitest';
import { retentionRatio, isRewritten } from './polish-guard';

describe('polish-guard（润色改写侦测）', () => {
  it('原文逐句保留 + 追加扩写 → 覆盖率高，不判定为改写', () => {
    const original = '身为杂役弟子的他，因伪灵根被当作炼丹炉试验品。当众人都以为他必死无疑时，他通过每日存档不断重置伤势。';
    const expanded = original + '在无数次死亡循环中，他以命换道，强行炼出了传说中的禁忌神丹。';
    expect(retentionRatio(original, expanded)).toBeGreaterThan(0.9);
    expect(isRewritten(original, expanded)).toBe(false);
  });

  it('整体改写（更换措辞重述）→ 覆盖率骤降，判定为改写', () => {
    const original =
      '身为伪灵根杂役，他被权贵视为炼丹炉试验品，时刻徘徊在生死边缘。绝境中，他觉醒了每日存档天赋。';
    const rewritten =
      '一个落魄的少年修士在宗门底层挣扎求存，偶然获得了可以回到过去的神秘能力，从此踏上逆袭之路。';
    expect(retentionRatio(original, rewritten)).toBeLessThan(0.5);
    expect(isRewritten(original, rewritten)).toBe(true);
  });

  it('保留原文但在句间插入扩写（前后拼接）→ 不判定为改写', () => {
    const original = '主角获得每日存档天赋，可无视代价回溯身体状态。他以命换道强行炼出禁忌神丹。';
    const expanded =
      '主角获得每日存档天赋，可无视代价回溯身体状态。每次回溯，他都要承受记忆撕裂般的剧痛。他以命换道强行炼出禁忌神丹，丹成那日天雷滚滚。';
    expect(isRewritten(original, expanded)).toBe(false);
  });

  it('原文过短（<6 字）不拦截，润色结果为空覆盖率记 0', () => {
    expect(retentionRatio('太短', '随便什么结果都行')).toBe(1);
    expect(isRewritten('太短', '完全不同的表述')).toBe(false);
    expect(retentionRatio('足够长的原始简介文本', '')).toBe(0);
    expect(isRewritten('足够长的原始简介文本', '')).toBe(true);
  });

  it('自定义阈值生效', () => {
    const original = '少年偶得上古传承，从此一路高歌猛进。';
    const polished = '少年偶得上古传承。'; // 覆盖率约 0.5 上下
    const r = retentionRatio(original, polished);
    expect(isRewritten(original, polished, Math.max(0.1, r - 0.01))).toBe(false);
    expect(isRewritten(original, polished, Math.min(0.99, r + 0.01))).toBe(true);
  });
});
