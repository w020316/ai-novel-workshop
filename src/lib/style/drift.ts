// ============================================================================
// 文风一致性指纹 · 实时漂移检测（Style Drift Detection）
// 背景：长篇连载中后期，AI 生成章节的句式节奏 / 对话占比 / 用词偏好会悄悄
//       偏离开篇建立的风格（俗称「文风跑了」），读者最先察觉。
// 设计：纯函数、确定性、零 LLM/零网络（与世界状态机同模式）——
//       复用 profile.ts 的统计指纹（平均句长 / 对话比 / 高频 n-gram），
//       将「最近 K 章」指纹与「基线」（文风预设，或此前全部章节聚合）对比，
//       产出 drift 等级（insufficient/normal/watch/alert）+ 具体告警文案。
// ============================================================================

import { analyzeTextStyle } from './profile';

/** 最近窗口：取最近 N 章与基线对比 */
export const RECENT_CHAPTER_WINDOW = 5;
/** 基线最少章数：此前章节不足此数（且无文风预设）时不判定 */
export const MIN_BASELINE_CHAPTERS = 3;

// ---- 告警阈值 ----
/** 平均句长相对偏差率：≥20% 关注，≥35% 告警 */
export const SENTENCE_LEN_WATCH = 0.2;
export const SENTENCE_LEN_ALERT = 0.35;
/** 对话占比绝对变化：≥0.12 关注，≥0.20 告警 */
export const DIALOGUE_WATCH = 0.12;
export const DIALOGUE_ALERT = 0.2;
/** 高频词组重叠系数（|A∩B| / min(|A|,|B|)）：≤0.4 关注，≤0.2 告警。
 *  不用 Jaccard：预设基线词组通常远少于近期统计集，Jaccard 会结构性偏低导致误报 */
export const PHRASE_OVERLAP_WATCH = 0.4;
export const PHRASE_OVERLAP_ALERT = 0.2;

export interface DriftChapterInput {
  chapterNo: number;
  content: string;
}

/** 文风预设基线（来自 StylePreset 的统计指纹，开篇建立的目标风格） */
export interface DriftPresetBaseline {
  avgSentenceLength?: number;
  dialogueRatio?: number;
  commonPhrases?: string[];
}

export interface DriftBaseline {
  source: 'preset' | 'earlier-chapters';
  label: string;
  /** 基线覆盖的章节范围（预设基线时为 undefined） */
  chapterRange?: [number, number];
  avgSentenceLength: number;
  dialogueRatio: number;
  commonPhrases: string[];
}

export type DriftSignalType = 'sentence-length' | 'dialogue-ratio' | 'phrase-overlap';

export interface StyleDriftSignal {
  type: DriftSignalType;
  level: 'watch' | 'alert';
  description: string;
}

export interface StyleDriftReport {
  /** insufficient：章节不足无法判定；normal：无漂移；watch：留意；alert：明显漂移 */
  level: 'insufficient' | 'normal' | 'watch' | 'alert';
  baseline: DriftBaseline | null;
  recent: {
    chapterRange: [number, number] | null;
    avgSentenceLength: number;
    dialogueRatio: number;
    topPhrases: string[];
  };
  signals: StyleDriftSignal[];
  suggestions: string[];
}

/** 高频词组重叠系数：|A∩B| / min(|A|,|B|)（任一为空返回 1，不告警） */
export function phraseOverlap(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 1;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const minSize = Math.min(setA.size, setB.size);
  return minSize === 0 ? 1 : inter / minSize;
}

function fmtRange([from, to]: [number, number]): string {
  return from === to ? `第 ${from} 章` : `第 ${from}-${to} 章`;
}

function buildBaselineFromChapters(chapters: DriftChapterInput[]): DriftBaseline {
  const stats = analyzeTextStyle(chapters.map((c) => c.content).join('\n'));
  return {
    source: 'earlier-chapters',
    label: `此前 ${chapters.length} 章（${fmtRange([chapters[0].chapterNo, chapters[chapters.length - 1].chapterNo])}）`,
    chapterRange: [chapters[0].chapterNo, chapters[chapters.length - 1].chapterNo],
    avgSentenceLength: stats.avgSentenceLength,
    dialogueRatio: stats.dialogueRatio,
    commonPhrases: [...new Set([...stats.topTrigrams, ...stats.topBigrams])],
  };
}

/**
 * 检测文风漂移。纯函数：相同输入永远得到相同输出。
 *
 * @param chapters 全部已写章节（按 chapterNo 升序内部重排，空正文跳过）
 * @param options.recentK 最近窗口章数（默认 5）
 * @param options.preset 文风预设指纹（提供且含有效句长/词组时优先生效，
 *        因为全书聚合基线会随漂移本身「跟着漂」，预设才是开篇锚点）
 */
export function detectStyleDrift(
  chapters: DriftChapterInput[],
  options?: { recentK?: number; preset?: DriftPresetBaseline }
): StyleDriftReport {
  const emptyRecent = {
    chapterRange: null,
    avgSentenceLength: 0,
    dialogueRatio: 0,
    topPhrases: [] as string[],
  };

  const sorted = [...chapters]
    .filter((c) => c.content && c.content.trim())
    .sort((a, b) => a.chapterNo - b.chapterNo);

  if (sorted.length === 0) {
    return {
      level: 'insufficient',
      baseline: null,
      recent: emptyRecent,
      signals: [],
      suggestions: [],
    };
  }

  const recentK = options?.recentK ?? RECENT_CHAPTER_WINDOW;
  const recentChapters = sorted.slice(-recentK);
  // 注意：总章数 ≤ recentK 时不能用 slice(0, 负数)（会从头吞掉章节）
  const earlierChapters = sorted.length > recentK ? sorted.slice(0, sorted.length - recentK) : [];

  const recentStats = analyzeTextStyle(recentChapters.map((c) => c.content).join('\n'));
  const recent = {
    chapterRange: [recentChapters[0].chapterNo, recentChapters[recentChapters.length - 1].chapterNo] as [number, number],
    avgSentenceLength: recentStats.avgSentenceLength,
    dialogueRatio: recentStats.dialogueRatio,
    topPhrases: [...new Set([...recentStats.topTrigrams, ...recentStats.topBigrams])],
  };

  // ---- 基线：预设优先，其次此前章节聚合，章节数不足则无法判定 ----
  const preset = options?.preset;
  const presetUsable =
    preset &&
    ((preset.avgSentenceLength !== undefined && preset.avgSentenceLength > 0) ||
      (preset.commonPhrases !== undefined && preset.commonPhrases.length > 0));

  let baseline: DriftBaseline | null;
  if (presetUsable) {
    baseline = {
      source: 'preset',
      label: '文风预设指纹（开篇锚点）',
      avgSentenceLength: preset.avgSentenceLength ?? 0,
      dialogueRatio: preset.dialogueRatio ?? recentStats.dialogueRatio,
      commonPhrases: preset.commonPhrases ?? [],
    };
  } else if (earlierChapters.length >= MIN_BASELINE_CHAPTERS) {
    baseline = buildBaselineFromChapters(earlierChapters);
  } else {
    return {
      level: 'insufficient',
      baseline: null,
      recent,
      signals: [],
      suggestions: [
        `已写 ${sorted.length} 章中可用于对比基线的不足 ${MIN_BASELINE_CHAPTERS} 章（且无文风预设），继续写作或先在设置页上传文风样本后再扫描。`,
      ],
    };
  }

  // ---- 信号判定 ----
  const signals: StyleDriftSignal[] = [];

  // 1. 平均句长相对偏差
  if (baseline.avgSentenceLength > 0) {
    const dev = Math.abs(recent.avgSentenceLength - baseline.avgSentenceLength) / baseline.avgSentenceLength;
    if (dev >= SENTENCE_LEN_ALERT || dev >= SENTENCE_LEN_WATCH) {
      const level: 'watch' | 'alert' = dev >= SENTENCE_LEN_ALERT ? 'alert' : 'watch';
      const direction = recent.avgSentenceLength > baseline.avgSentenceLength ? '变慢变长' : '变快变碎';
      signals.push({
        type: 'sentence-length',
        level,
        description: `平均句长 ${fmtRange(recent.chapterRange!)} ${recent.avgSentenceLength} 字/句，基线 ${baseline.avgSentenceLength} 字/句，偏差 ${(dev * 100).toFixed(0)}%，节奏明显${direction}。`,
      });
    }
  }

  // 2. 对话占比绝对变化
  const dialogueChange = Math.abs(recent.dialogueRatio - baseline.dialogueRatio);
  if (dialogueChange >= DIALOGUE_WATCH) {
    const level: 'watch' | 'alert' = dialogueChange >= DIALOGUE_ALERT ? 'alert' : 'watch';
    const direction = recent.dialogueRatio > baseline.dialogueRatio ? '增多' : '减少';
    signals.push({
      type: 'dialogue-ratio',
      level,
      description: `对话占比由基线 ${(baseline.dialogueRatio * 100).toFixed(0)}% 变为 ${(recent.dialogueRatio * 100).toFixed(0)}%（${direction} ${Math.round(dialogueChange * 100)} 个百分点），叙事密度变化明显。`,
    });
  }

  // 3. 高频词组重合度（重叠系数越低漂移越大）
  const overlap = phraseOverlap(baseline.commonPhrases, recent.topPhrases);
  if (overlap <= PHRASE_OVERLAP_WATCH) {
    const level: 'watch' | 'alert' = overlap <= PHRASE_OVERLAP_ALERT ? 'alert' : 'watch';
    signals.push({
      type: 'phrase-overlap',
      level,
      description: `高频词组重合度仅 ${(overlap * 100).toFixed(0)}%（基线 ${baseline.commonPhrases.length} 组 vs 近期 ${recent.topPhrases.length} 组），用词偏好已明显换血。`,
    });
  }

  // ---- 总等级：任一 alert → alert；否则任一 watch → watch；否则 normal ----
  const level: StyleDriftReport['level'] = signals.some((s) => s.level === 'alert')
    ? 'alert'
    : signals.some((s) => s.level === 'watch')
      ? 'watch'
      : 'normal';

  // ---- 建议（确定性映射） ----
  const suggestions: string[] = [];
  if (signals.some((s) => s.type === 'sentence-length')) {
    suggestions.push('生成新章时在文风约束中强调目标句长节奏，或调低 temperature 后重写漂移最重的章节。');
  }
  if (signals.some((s) => s.type === 'dialogue-ratio')) {
    suggestions.push('检查近几章是否偏离原设定的对话/叙述配比，可在章节要点中显式标注「对话推进」或「描写铺陈」。');
  }
  if (signals.some((s) => s.type === 'phrase-overlap')) {
    suggestions.push('近章高频词与开篇差异大，建议把文风样本/StyleGuide 重新注入写作 Prompt，或人工润色标志性表达。');
  }
  if (level === 'normal') {
    suggestions.push('文风指纹与基线一致，无需处理。');
  }

  return { level, baseline, recent, signals, suggestions };
}
