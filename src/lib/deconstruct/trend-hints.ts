// ============================================================================
// 拆书 · 平台相似风向参考（需求 10）
// 对拆书样本/灵感卡文本做轻量题材匹配——复用开书包的「灵感关键词 → 题材」
// 启发式（heuristicBookPackage 同源模式表），再取主流平台该题材的热门风向，
// 产出「同题材热门桥段对照」，提示用户可差异化方向。
// 纯本地确定性计算，不调 LLM；未命中任何题材关键词时回落「其他」。
// ============================================================================
import { getTrend } from '@/lib/trend/trends';
import { inferGenreFromText } from '@/lib/llm/generators/book-package';

/** 参与对照的主流平台（男频 / 免费 / 女频各取其一，覆盖主要读者盘） */
const TREND_SOURCE_IDS = ['qidian', 'fanqie', 'jinjiang'];

export interface SimilarTrendHints {
  /** 匹配到的题材（未命中回落「其他」） */
  genre: string;
  /** 各平台该题材风向要点（2-3 行）+ 末尾一条差异化建议提示行 */
  hints: string[];
}

/**
 * 由参考文本推断题材，并汇总主流平台同题材风向：
 * 每个平台一行（热点方向 + 高频桥段 + 热度词），末尾追加差异化建议提示行。
 */
export function buildSimilarTrendHints(sampleText: string): SimilarTrendHints {
  const genre = inferGenreFromText(sampleText) ?? '其他';
  const hints: string[] = [];
  for (const id of TREND_SOURCE_IDS) {
    const t = getTrend(id, genre);
    if (!t) continue;
    hints.push(
      `${t.sourceName}·${genre}风向：${t.hotspot}；高频桥段：${t.tropes
        .slice(0, 3)
        .join('、')}；热度词：${t.words.slice(0, 4).join('、')}`
    );
  }
  hints.push('差异化建议：避开上述高频桥段的直接复刻，可做设定/人设交叉创新。');
  return { genre, hints };
}
