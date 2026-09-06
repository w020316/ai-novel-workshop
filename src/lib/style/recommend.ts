// ============================================================================
// 文风预设推荐（需求 8）：按题材/简介确定性推荐文风预设
// 设计：纯函数、零 LLM/零网络——
//   1. 简介关键词微调（甜/宠/宅斗/宫斗/悬疑 等，优先级最高）
//   2. 题材 → 目标文风名（按优先级排列，取预设库中第一个命中的名字）
//   3. 兜底：无更精准匹配时返回第一个预设；预设库为空返回 null
// 与 seed.ts 内置预设名对齐（热血升级/硬核爽文/悬疑冷峻/诡秘惊悚…）。
// ============================================================================

import type { Genre, StylePreset } from '@/types';

/** 题材 → 目标文风名（按优先级排列；取 presets 中第一个命中的名字） */
export const GENRE_STYLE_NAMES: Partial<Record<Genre, string[]>> = {
  玄幻: ['热血升级', '硬核爽文'],
  仙侠: ['热血升级', '硬核爽文'],
  武侠: ['热血升级', '硬核爽文'],
  悬疑: ['悬疑冷峻', '诡秘惊悚'],
  灵异: ['悬疑冷峻', '诡秘惊悚'],
  历史: ['史诗厚重', '古风雅韵'],
  言情: ['细腻言情'],
  甜宠: ['女频甜宠'],
  快穿: ['快穿利落'],
  种田: ['治愈日常'],
  都市: ['都市轻喜', '霸总苏爽'],
  轻小说: ['轻松幽默', '网感吐槽体'],
  末世: ['硬核爽文'],
  游戏: ['硬核爽文'],
  脑洞: ['硬核爽文'],
  体育: ['少年漫热血'],
};

/** 简介关键词 → 文风微调（优先级高于题材映射；命中但预设库无对应名时继续走题材映射） */
export const SUMMARY_STYLE_HINTS: Array<{ re: RegExp; names: string[] }> = [
  { re: /甜|宠/, names: ['女频甜宠', '细腻言情'] },
  { re: /宅斗|宫斗/, names: ['古风雅韵', '史诗厚重'] },
  { re: /悬疑/, names: ['悬疑冷峻', '诡秘惊悚'] },
];

/** 在预设库中按名字优先级取第一个命中的预设 */
function pickByNames(presets: StylePreset[], names: string[]): StylePreset | null {
  for (const name of names) {
    const hit = presets.find((p) => p.name === name);
    if (hit) return hit;
  }
  return null;
}

export interface RecommendStylePresetInput {
  /** 项目题材（Genre 或任意字符串，未收录题材走兜底） */
  genre: string;
  /** 项目简介（可选，用于关键词微调） */
  summary?: string;
  /** 候选预设库（内置 + 项目专属） */
  presets: StylePreset[];
}

/**
 * 按题材与简介推荐文风预设（确定性纯函数）。
 * 优先级：简介关键词微调 > 题材映射 > 第一个预设；预设库为空返回 null。
 */
export function recommendStylePreset(input: RecommendStylePresetInput): StylePreset | null {
  const { genre, summary, presets } = input;
  if (!Array.isArray(presets) || presets.length === 0) return null;

  const text = (summary ?? '').trim();
  if (text) {
    for (const hint of SUMMARY_STYLE_HINTS) {
      if (hint.re.test(text)) {
        const hit = pickByNames(presets, hint.names);
        if (hit) return hit;
      }
    }
  }

  const genreHit = pickByNames(presets, GENRE_STYLE_NAMES[genre as Genre] ?? []);
  if (genreHit) return genreHit;

  // 兜底：无更精准匹配 → 第一个预设
  return presets[0];
}

/** 推荐依据（供 UI 展示理由一句话） */
export type StyleRecommendBasis = 'summary' | 'genre' | 'fallback';

/**
 * 与 recommendStylePreset 同优先级的依据判断（只做命中判断，不查预设库）：
 * summary 命中关键词微调 / 题材命中映射表 / 兜底。
 */
export function styleRecommendBasis(genre: string, summary?: string): StyleRecommendBasis {
  const text = (summary ?? '').trim();
  if (text && SUMMARY_STYLE_HINTS.some((h) => h.re.test(text))) return 'summary';
  if (GENRE_STYLE_NAMES[genre as Genre]) return 'genre';
  return 'fallback';
}
