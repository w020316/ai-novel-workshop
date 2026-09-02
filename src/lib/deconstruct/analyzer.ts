// ============================================================================
// 拆书工坊（P5' 粘贴拆文 + 灵感沉淀）
// 依据：调研结论 —— OpenWrite「小说拆解」能力 + 已收敛的 P5 范围：
//       粘贴参考书片段 → 拆解黄金三章/爽点/节奏/钩子 → 生成可收藏灵感卡。
// 组成：
//   - analyzeDeconstruction  确定性拆文指标（勾/爽点/节奏/断章/词频），无 LLM 依赖
//   - generateDeconstruction 在其上加 LLM 综合建议 + 灵感卡生成，失败降级指标衍生
// 复用：style/profile（句长/ngram/对话）、review（钩子/断章正则思路）
// 降级：任何异常都返回可用的确定性拆文结果，绝不阻塞。
// ============================================================================
import { analyzeTextStyle } from '@/lib/style/profile';
import { chat } from '@/lib/llm/client';
import { generateId, safeParseJSON, countChineseWords } from '@/lib/utils';
import type { Deconstruction, DeconstructionMetrics, InspirationCard } from '@/types';

/** 开篇/情节钩子关键词 */
const HOOK_WORDS =
  /(突然|竟|却|不可能|秘密|阴谋|危机|失踪|死亡|现身|真相|不对劲|可是|骤然)/g;
/** 断章悬念特征（句尾） */
const CLIFF_WORDS = /(…|？|\.\.\.|就在这时|难道|却又|究竟|到底|忽然|意想不到)/g;
/** 爽点/高潮关键词（与 health 的 COOL_POINT_WORDS 同体系） */
const COOL_WORDS = [
  '打脸', '反转', '逆袭', '翻盘', '揭穿', '反杀', '大胜', '扬眉吐气',
  '一鸣惊人', '刮目相看', '震惊全场', '当众', '跪下道歉', '碾压', '秒杀',
];

/**
 * 确定性拆文分析：从参考文本提取可复用指标，完全不依赖 LLM。
 */
export function analyzeDeconstruction(text: string): DeconstructionMetrics {
  const stats = analyzeTextStyle(text);
  const wordCount = countChineseWords(text);

  // 钩子 / 断章
  const hookMatches = text.match(HOOK_WORDS) ?? [];
  const cliffMatches = text.match(CLIFF_WORDS) ?? [];

  // 爽点
  let coolPointHits: string[] = [];
  for (const w of COOL_WORDS) {
    if (text.includes(w)) coolPointHits.push(w);
  }
  // 去重并按出现位置排序，限制数量
  coolPointHits = [...new Set(coolPointHits)].slice(0, 8);

  const coolPointDensity = wordCount > 0 ? +(coolPointHits.length / (wordCount / 1000)).toFixed(2) : 0;

  // 节奏：由平均句长推断
  const rhythm: DeconstructionMetrics['rhythm'] =
    stats.avgSentenceLength < 14 ? 'fast' : stats.avgSentenceLength > 22 ? 'slow' : 'medium';

  const head = text.slice(0, 80);
  const tail = text.slice(-60);

  return {
    wordCount,
    sentenceCount: stats.sentenceCount,
    avgSentenceLength: stats.avgSentenceLength,
    dialogueRatio: stats.dialogueRatio,
    hookCount: hookMatches.length,
    cliffhangerCount: cliffMatches.length,
    coolPointHits,
    coolPointDensity,
    hasOpeningHook: HOOK_WORDS.test(head),
    hasCliffhanger: CLIFF_WORDS.test(tail),
    rhythm,
    topTrigrams: stats.topTrigrams.slice(0, 8),
  };
}

/**
 * 由确定性指标 + 统计特征衍生可写建议（LLM 不可用时的兜底）。
 */
export function deriveSuggestions(m: DeconstructionMetrics): string[] {
  const s: string[] = [];
  if (m.wordCount < 800) {
    s.push('本章篇幅偏短，展开不足——可参照此样本补充具体冲突与转折，避免流水账。');
  }
  if (m.dialogueRatio > 0.8) {
    s.push('对话占比过高，建议参考样本增加动作与场景描写、保持张弛。');
  }
  if (!m.hasOpeningHook) {
    s.push('参考此样本的开头钩子手法——在 3 段内抛出一个悬念/冲突锁住读者。');
  }
  if (m.coolPointHits.length === 0) {
    s.push('样本爽点密度偏低，可在关键节点安排打脸/反转/扬名等具象 payoff 提升追读。');
  }
  if (!m.hasCliffhanger) {
    s.push('章末缺少悬念断章，借鉴样本如何在收尾处留钩子。');
  }
  if (s.length === 0) {
    s.push('整体结构均衡，可重点模仿其节奏铺陈与冲突密度。');
  }
  return s;
}

const SYSTEM_PROMPT = `你是一位网文拆书教练。用户会粘贴一本参考小说/片段的节选，请你从「可迁移」角度提炼灵感与建议，严格只输出 JSON（不要解释/前后缀/markdown），字段如下：
{
  "suggestions": ["针对本章可直接借用的 2-4 条写作建议"],
  "cards": [
    { "kind": "golden-three|hook|coolpoint|pacing|character|structure|other", "title": "灵感卡标题", "content": "可复用的具体手法/设定灵感（1-3 句）" }
  ]
}
要求：cards 2-6 张，务求具体可执行（能给句式/结构/人物关系就直接给），不要空话。`;

interface RawResult {
  suggestions?: string[];
  cards?: Array<{ kind?: string; title?: string; content?: string }>;
}

function sanitizeStrArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, max);
}

const CARD_KINDS: InspirationCard['kind'][] = [
  'golden-three', 'hook', 'coolpoint', 'pacing', 'character', 'structure', 'other',
];

/**
 * 完整拆文：确定性指标 + LLM 建议与灵感卡（失败降级为指标衍生建议、无灵感卡）。
 */
export async function generateDeconstruction(
  projectId: string,
  sourceTitle: string,
  text: string
): Promise<{ deconstruction: Deconstruction; cards: InspirationCard[] }> {
  const metrics = analyzeDeconstruction(text);
  const baseSuggestions = deriveSuggestions(metrics);
  const id = generateId('decon');

  // 样本过短不调 LLM
  const minText = metrics.wordCount >= 200;
  let fromLLM = false;
  let suggestions = baseSuggestions;
  let cards: InspirationCard[] = [];

  if (minText) {
    const maxLen = 6000;
    const userPrompt = [
      `【参考片段：${sourceTitle || '未命名'}】`,
      `【约 ${metrics.wordCount} 字｜平均句长 ${metrics.avgSentenceLength} 字｜节奏 ${metrics.rhythm}】`,
      '【全文】',
      text.slice(0, maxLen),
      '',
      '请基于以上，给出可迁移的写作建议与灵感卡（严格 JSON）。',
    ].join('\n');

    try {
      const result = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        { responseFormat: 'json', temperature: 0.4, maxTokens: 700 }
      ).catch(() => null);

      if (result) {
        const parsed = safeParseJSON<RawResult>(result.content ?? '', {});
        const llmSuggestions = sanitizeStrArray(parsed.suggestions, 4);
        const rawCards = Array.isArray(parsed.cards) ? parsed.cards.slice(0, 6) : [];
        if (llmSuggestions.length > 0) {
          suggestions = llmSuggestions;
          fromLLM = true;
        }
        if (rawCards.length > 0) {
          cards = rawCards
            .map((c, i) => ({
              id: `card_${Date.now()}_${i}`,
              projectId,
              kind: (CARD_KINDS as string[]).includes(c.kind ?? '')
                ? (c.kind as InspirationCard['kind'])
                : 'other',
              title: (c.title ?? '拆书灵感').trim().slice(0, 40),
              content: (c.content ?? '').trim(),
              sourceDeconstructionId: id,
              createdAt: Date.now(),
            }))
            .filter((c) => c.content.length > 0);
        }
      }
    } catch {
      // 静默降级
    }
  }

  const deconstruction: Deconstruction = {
    id,
    projectId,
    sourceTitle: sourceTitle || '未命名参考片段',
    samplePreview: text.replace(/\s+/g, ' ').trim().slice(0, 200),
    metrics,
    suggestions,
    fromLLM,
    createdAt: Date.now(),
  };

  return { deconstruction, cards };
}