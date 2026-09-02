// ============================================================================
// 文风仿写（风格克隆，P3）
// 依据：调研结论 —— InkOS `style analyze/import` 思路：
//        统计指纹（style_profile.json）+ LLM 定性风格指南（style_guide.md）双轨注入写作提示词。
// 组成：
//   - deriveStyleGuideFromStats  确定性降级：仅凭统计指纹生成可用的风格指南
//   - generateStyleGuide         LLM 从样本凝练四维定性指南（summary/rhythm/tone/
//                                 wordPreferences/taboos），失败或非法回落指纹派生
// 降级：任何异常都返回指纹派生指南，绝不阻塞，保证与「去AI味」天然互补。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { analyzeTextStyle, extractDialogues } from '@/lib/style/profile';
import type { StyleGuide, StylePreset } from '@/types';

/** 样本过短时不值得调用 LLM 的阈值（中文字符） */
const MIN_CHARS_FOR_LLM = 300;

/** 从对话框文本提取一条最能代表表达习惯的示例 */
function sampleDialogue(dialogues: string[]): string {
  const sorted = [...dialogues].sort((a, b) => b.length - a.length);
  const pick = sorted[0] ?? '';
  return pick.length > 40 ? pick.slice(0, 40) + '…' : pick;
}

function promptHintFor(stats: ReturnType<typeof analyzeTextStyle>): string {
  const lines: string[] = [];
  lines.push(`- 平均句长 ${stats.avgSentenceLength} 字（${stats.avgSentenceLength < 14 ? '短句为主，节奏快' : stats.avgSentenceLength > 22 ? '长句铺陈，节奏慢' : '长短均衡'}）`);
  lines.push(`- 对话占比 ${Math.round(stats.dialogueRatio * 100)}%`);
  if (stats.topTrigrams.length) lines.push(`- 高频三字词组：${stats.topTrigrams.slice(0, 5).join('、')}`);
  if (stats.topBigrams.length) lines.push(`- 高频二字词组：${stats.topBigrams.slice(0, 5).join('、')}`);
  return lines.join('\n');
}

/**
 * 纯统计指纹风格的确定性指南（LLM 不可用时的兜底）。
 * 保证 StyleGuide 四维字段永远可直接注入写作提示词。
 */
export function deriveStyleGuideFromStats(
  stats: ReturnType<typeof analyzeTextStyle>
): StyleGuide {
  const pacing =
    stats.avgSentenceLength < 14 ? '短句密实、节奏明快' : stats.avgSentenceLength > 22 ? '长句铺陈、节奏沉稳' : '长短句交织、节奏张弛有度';
  const dialogue =
    stats.dialogueRatio > 0.5
      ? '对话主导，以台词推进情节与人物关系'
      : stats.dialogueRatio < 0.25
      ? '叙述主导，对话克制、点到为止'
      : '叙述与对话均衡';
  const phrases =
    stats.topTrigrams.length > 0 || stats.topBigrams.length > 0
      ? [...stats.topTrigrams, ...stats.topBigrams].slice(0, 8).join('、')
      : '（样本过短，未提取到稳定词组）';

  return {
    summary: `统计指纹风格：${pacing}，${dialogue}。`,
    rhythm: `句式：${pacing}；段内避免连续同长句，长短交替制造呼吸感。`,
    tone: `语气：${dialogue}；动作与心理描写保持在样本呈现的密度，不做戏剧化拔高。`,
    wordPreferences: `优先使用样本中的高频词组（${phrases}），保持词汇底色一致。`,
    taboos: '避免模板化抒情、总结式旁白、堆砌形容词；不引入样本里不存在的书面腔与网络流行语。',
  };
}

const SYSTEM_PROMPT = `你是资深网文编辑。请阅读用户提供的样本文本，提炼出可复用的「文风仿写指南」，严格只输出 JSON（不要任何解释、前后缀、markdown），字段如下：
{
  "summary": "一句话总括文风（如：冷峻克制的都市悬疑笔法，长句铺陈+短句收束）",
  "rhythm": "节奏与句式特征（具体可执行，如：开场长句布景、对话短句卡点、高潮段一句一段）",
  "tone": "语气与人物刻画方式（如：冷叙+内敛台词、用动作而非形容词表现情绪）",
  "wordPreferences": "高频用词/表达偏好（可直接照搬的句式与习惯词，含口语化特征）",
  "taboos": "必须避免的表达（AI 味写法 + 样本中不出现的腔调）"
}
要求：每条 1-3 句、具体到能直接执行，不要空话套话。`;

function tryParseGuide(text: string): StyleGuide | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!obj || typeof obj !== 'object') return null;
    const pick = (v: unknown): string =>
      typeof v === 'string' && v.trim() ? v.trim() : '';
    const guide: StyleGuide = {
      summary: pick(obj.summary),
      rhythm: pick(obj.rhythm),
      tone: pick(obj.tone),
      wordPreferences: pick(obj.wordPreferences),
      taboos: pick(obj.taboos),
    };
    // 至少要有 summary 才算有效
    return guide.summary ? guide : null;
  } catch {
    return null;
  }
}

/**
 * LLM 从样本凝练文风仿写指南；失败 / 非法 / 样本过短时回落统计指纹派生。
 */
export async function generateStyleGuide(sampleText: string): Promise<StyleGuide> {
  const stats = analyzeTextStyle(sampleText);
  const fallback = deriveStyleGuideFromStats(stats);
  const chineseChars = stats.totalChineseChars;

  if (chineseChars < MIN_CHARS_FOR_LLM) return fallback;

  const dialogue = sampleDialogue(extractDialogues(sampleText));
  const userPrompt = [
    `【样本约 ${chineseChars} 字】`,
    `【统计指纹】`,
    promptHintFor(stats),
    `【代表性对话示例】`,
    dialogue ? `「${dialogue}」` : '（样本中无明显对话）',
    '',
    '【样本文本】',
    sampleText.slice(0, 6000),
    '',
    '请基于以上提炼四维文风仿写指南（严格 JSON）。',
  ]
    .filter((l) => typeof l === 'string')
    .join('\n');

  // 任何异常都回落统计指纹，绝不外抛（保证上游「生成并应用」不被 LLM 失败打断）
  const result = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { responseFormat: 'json', temperature: 0.4, maxTokens: 600 }
  ).catch(() => null);
  if (!result) return fallback;

  return tryParseGuide(result.content ?? '') ?? fallback;
}

/**
 * 将风格指南转为可直接插入写作 Prompt 的文本块。
 */
export function styleGuideToPrompt(styleGuide: StyleGuide): string {
  return (
    `【文风仿写指南（严格模仿）】\n` +
    `总括：${styleGuide.summary}\n` +
    `节奏句式：${styleGuide.rhythm}\n` +
    `语气刻画：${styleGuide.tone}\n` +
    `用词偏好：${styleGuide.wordPreferences}\n` +
    `绝对避免：${styleGuide.taboos}`
  );
}

/**
 * 生成带风格指南的 StylePreset 增强：统计指纹必得，LLM 指南尽力而为。
 * @returns 原 preset 增加 styleGuide 字段（可能为统计指纹派生的降级指南）
 */
export async function enrichPresetWithStyleGuide<T extends StylePreset>(
  preset: T
): Promise<T> {
  if (preset.sampleText) {
    const guide = await generateStyleGuide(preset.sampleText);
    return { ...preset, styleGuide: guide };
  }
  return { ...preset, styleGuide: deriveStyleGuideFromStats(analyzeTextStyle('')) };
}