import { describe, it, expect } from 'vitest';
import { recommendStylePreset, styleRecommendBasis } from './recommend';
import type { StylePreset } from '@/types';

function preset(id: string, name: string): StylePreset {
  return {
    id,
    name,
    narrativePerspective: 'third-limited',
    pacing: 'fast',
    descriptionDensity: 'medium',
    dialogueRatio: 0.3,
  };
}

const NAMES = [
  '热血升级',
  '硬核爽文',
  '悬疑冷峻',
  '诡秘惊悚',
  '史诗厚重',
  '古风雅韵',
  '细腻言情',
  '女频甜宠',
  '快穿利落',
  '治愈日常',
  '都市轻喜',
  '霸总苏爽',
  '轻松幽默',
  '网感吐槽体',
  '少年漫热血',
];
/** 覆盖全部内置映射名的完整预设库 */
const FULL = NAMES.map((n, i) => preset(`s${i}`, n));

function libOf(...names: string[]): StylePreset[] {
  return names.map((n, i) => preset(`p${i}`, n));
}

describe('recommendStylePreset · 题材映射', () => {
  it('玄幻/仙侠/武侠 → 热血升级（优先级第一）', () => {
    expect(recommendStylePreset({ genre: '玄幻', presets: FULL })?.name).toBe('热血升级');
    expect(recommendStylePreset({ genre: '仙侠', presets: FULL })?.name).toBe('热血升级');
    expect(recommendStylePreset({ genre: '武侠', presets: FULL })?.name).toBe('热血升级');
  });

  it('悬疑/灵异 → 悬疑冷峻 | 诡秘惊悚', () => {
    expect(recommendStylePreset({ genre: '悬疑', presets: FULL })?.name).toBe('悬疑冷峻');
    expect(recommendStylePreset({ genre: '灵异', presets: FULL })?.name).toBe('悬疑冷峻');
    // 库中无悬疑冷峻时取第二优先级
    expect(
      recommendStylePreset({ genre: '灵异', presets: libOf('诡秘惊悚') })?.name
    ).toBe('诡秘惊悚');
  });

  it('历史 → 史诗厚重 | 古风雅韵', () => {
    expect(recommendStylePreset({ genre: '历史', presets: FULL })?.name).toBe('史诗厚重');
    expect(recommendStylePreset({ genre: '历史', presets: libOf('古风雅韵') })?.name).toBe(
      '古风雅韵'
    );
  });

  it('言情/甜宠/快穿/种田 → 各自专属文风', () => {
    expect(recommendStylePreset({ genre: '言情', presets: FULL })?.name).toBe('细腻言情');
    expect(recommendStylePreset({ genre: '甜宠', presets: FULL })?.name).toBe('女频甜宠');
    expect(recommendStylePreset({ genre: '快穿', presets: FULL })?.name).toBe('快穿利落');
    expect(recommendStylePreset({ genre: '种田', presets: FULL })?.name).toBe('治愈日常');
  });

  it('都市 → 都市轻喜 | 霸总苏爽；轻小说 → 轻松幽默 | 网感吐槽体', () => {
    expect(recommendStylePreset({ genre: '都市', presets: FULL })?.name).toBe('都市轻喜');
    expect(recommendStylePreset({ genre: '都市', presets: libOf('霸总苏爽') })?.name).toBe(
      '霸总苏爽'
    );
    expect(recommendStylePreset({ genre: '轻小说', presets: FULL })?.name).toBe('轻松幽默');
    expect(
      recommendStylePreset({ genre: '轻小说', presets: libOf('网感吐槽体') })?.name
    ).toBe('网感吐槽体');
  });

  it('末世/游戏/脑洞 → 硬核爽文；体育 → 少年漫热血', () => {
    expect(recommendStylePreset({ genre: '末世', presets: FULL })?.name).toBe('硬核爽文');
    expect(recommendStylePreset({ genre: '游戏', presets: FULL })?.name).toBe('硬核爽文');
    expect(recommendStylePreset({ genre: '脑洞', presets: FULL })?.name).toBe('硬核爽文');
    expect(recommendStylePreset({ genre: '体育', presets: FULL })?.name).toBe('少年漫热血');
  });

  it('玄幻库中无热血升级时回落硬核爽文', () => {
    expect(
      recommendStylePreset({ genre: '玄幻', presets: libOf('细腻言情', '硬核爽文') })?.name
    ).toBe('硬核爽文');
  });
});

describe('recommendStylePreset · 简介关键词微调', () => {
  it('言情 + 简介「甜/宠」→ 女频甜宠（微调）', () => {
    expect(
      recommendStylePreset({ genre: '言情', summary: '先婚后爱的高甜宠爱日常', presets: FULL })
        ?.name
    ).toBe('女频甜宠');
  });

  it('简介「宅斗/宫斗」→ 古风雅韵', () => {
    expect(
      recommendStylePreset({ genre: '都市', summary: '深宅大院里的宅斗复仇', presets: FULL })
        ?.name
    ).toBe('古风雅韵');
  });

  it('简介「悬疑」→ 悬疑冷峻', () => {
    expect(
      recommendStylePreset({ genre: '玄幻', summary: '层层反转的悬疑迷局', presets: FULL })?.name
    ).toBe('悬疑冷峻');
  });

  it('简介命中但库中无对应预设 → 回落题材映射/兜底', () => {
    // 言情 + 甜，但库中无女频甜宠/细腻言情 → 题材映射也无 → 兜底第一个
    expect(
      recommendStylePreset({ genre: '言情', summary: '甜甜的恋爱', presets: libOf('硬核爽文') })
        ?.name
    ).toBe('硬核爽文');
  });
});

describe('recommendStylePreset · 兜底', () => {
  it('未收录题材（其他/未知）→ 第一个预设', () => {
    expect(recommendStylePreset({ genre: '其他', presets: FULL })?.name).toBe('热血升级');
    expect(recommendStylePreset({ genre: '未知题材', presets: FULL })?.name).toBe('热血升级');
  });

  it('题材映射无命中预设名时兜底第一个预设', () => {
    expect(recommendStylePreset({ genre: '玄幻', presets: libOf('治愈日常') })?.name).toBe(
      '治愈日常'
    );
  });

  it('预设库为空 → null', () => {
    expect(recommendStylePreset({ genre: '玄幻', presets: [] })).toBeNull();
  });

  it('返回的是预设库中的原对象（含 id）', () => {
    const rec = recommendStylePreset({ genre: '甜宠', presets: FULL });
    expect(rec?.id).toBe('s7');
  });
});

describe('styleRecommendBasis · 推荐依据', () => {
  it('简介关键词命中 → summary', () => {
    expect(styleRecommendBasis('言情', '甜甜的宠爱')).toBe('summary');
    expect(styleRecommendBasis('玄幻', '宅斗上位')).toBe('summary');
  });

  it('题材命中映射 → genre', () => {
    expect(styleRecommendBasis('玄幻', '')).toBe('genre');
    expect(styleRecommendBasis('体育')).toBe('genre');
  });

  it('都未命中 → fallback', () => {
    expect(styleRecommendBasis('其他', '')).toBe('fallback');
    expect(styleRecommendBasis('', '无关紧要的简介')).toBe('fallback');
  });
});
