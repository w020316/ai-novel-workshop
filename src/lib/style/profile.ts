// ============================================================================
// 文风 Profile 解析器
// 依据：spec 4.3 节 · 文风配置
// 说明：从用户上传的样本章节文本中提取词汇特征（平均句长、常用词组、对话比例等），
//       用于生成自定义文风预设。P3 完成后可补充更复杂的统计。
// ============================================================================
import type { StylePreset, NarrativePerspective, Pacing, DescriptionDensity, VocabularyProfile } from '@/types';
import { generateId } from '@/lib/utils';

// ============ 句子切分 ============
const SENTENCE_DELIMITERS = /([。！？…!?]+)/;

export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  // 按句末标点切分，保留标点
  const parts = text.split(SENTENCE_DELIMITERS);
  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? '';
    const delim = parts[i + 1] ?? '';
    const sentence = (body + delim).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
  }
  return sentences;
}

// ============ 对话提取 ============
// 成对引号匹配（修复：原单一正则的开/闭类只含直引号 U+0022，
// 中文小说通用的弯引号 “ ” 与直角引号 「」『』全部漏检，对话比恒为 0）
const DIALOGUE_PATTERNS: RegExp[] = [
  /["“”]([^"“”]+)["“”]/g, // 直引号与中文弯引号
  /[「『]([^」』]+)[」』]/g, // 直角引号
  /[（(]([^（）()]+)[）)]/g, // 括号补语（保留原有行为）
];

export function extractDialogues(text: string): string[] {
  const result: string[] = [];
  for (const pattern of DIALOGUE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const m of matches) {
      if (m[1] && m[1].trim().length > 0) {
        result.push(m[1].trim());
      }
    }
  }
  return result;
}

// ============ 中文 n-gram 提取 ============
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '他', '她', '你', '们', '这', '那', '一', '不',
  '都', '也', '就', '只', '还', '又', '可', '要', '能', '会', '着', '过', '到',
  '上', '下', '里', '中', '为', '与', '和', '或', '及', '把', '被', '让', '使',
  '它', '其', '之', '于', '以', '而', '则', '即', '便', '才', '再', '已', '正',
]);

export function extractNGrams(text: string, n = 2, minFreq = 2): string[] {
  if (!text) return [];
  // 仅保留中文字符
  const chineseOnly = text.replace(/[^\u4e00-\u9fa5]/g, '');
  if (chineseOnly.length < n) return [];

  const counter = new Map<string, number>();
  for (let i = 0; i <= chineseOnly.length - n; i++) {
    const gram = chineseOnly.slice(i, i + n);
    // 跳过全停用词的 gram
    if ([...gram].every((c) => STOP_WORDS.has(c))) continue;
    counter.set(gram, (counter.get(gram) ?? 0) + 1);
  }

  return [...counter.entries()]
    .filter(([, freq]) => freq >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([gram]) => gram);
}

// ============ 统计 ============
export interface StyleStats {
  sentenceCount: number;
  avgSentenceLength: number; // 中文字符
  dialogueCount: number;
  dialogueRatio: number; // 0-1
  totalChineseChars: number;
  topBigrams: string[];
  topTrigrams: string[];
}

export function analyzeTextStyle(text: string): StyleStats {
  const sentences = splitSentences(text);
  const dialogues = extractDialogues(text);
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const dialogueChars = dialogues.reduce((sum, d) => sum + (d.match(/[\u4e00-\u9fa5]/g) || []).length, 0);

  return {
    sentenceCount: sentences.length,
    avgSentenceLength: sentences.length > 0 ? Math.round(chineseChars / sentences.length) : 0,
    dialogueCount: dialogues.length,
    dialogueRatio: chineseChars > 0 ? Math.min(1, Math.round((dialogueChars / chineseChars) * 100) / 100) : 0,
    totalChineseChars: chineseChars,
    topBigrams: extractNGrams(text, 2, 2),
    topTrigrams: extractNGrams(text, 3, 2),
  };
}

// ============ 样本 -> StylePreset ============
export interface SampleToPresetInput {
  projectId: string;
  sampleText: string;
  name?: string;
  narrativePerspective?: NarrativePerspective;
  pacing?: Pacing;
  descriptionDensity?: DescriptionDensity;
}

/**
 * 基于样本文本生成项目专属文风预设。
 * 自动推断叙事视角、节奏与描写密度。
 */
export function sampleToPreset(input: SampleToPresetInput): StylePreset {
  const stats = analyzeTextStyle(input.sampleText);
  const vocabularyProfile: VocabularyProfile = {
    avgSentenceLength: stats.avgSentenceLength,
    commonPhrases: [...new Set([...stats.topTrigrams, ...stats.topBigrams])].slice(0, 8),
  };

  // 推断叙事视角：检测"我"的频率
  const firstPersonMarker = (input.sampleText.match(/(?:^|[^他她它])我(?![们是])/g) || []).length;
  const narrativePerspective: NarrativePerspective =
    firstPersonMarker > stats.sentenceCount * 0.15 ? 'first' : 'third-limited';

  // 推断节奏：句长越短节奏越快
  const pacing: Pacing =
    stats.avgSentenceLength < 14 ? 'fast' : stats.avgSentenceLength > 22 ? 'slow' : 'medium';

  // 推断描写密度：对话比例越低描写越多
  const descriptionDensity: DescriptionDensity =
    stats.dialogueRatio > 0.5 ? 'sparse' : stats.dialogueRatio < 0.25 ? 'detailed' : 'medium';

  return {
    id: `style-proj-${input.projectId}`,
    name: input.name ?? '基于样本的自定义文风',
    narrativePerspective,
    pacing,
    descriptionDensity,
    dialogueRatio: stats.dialogueRatio,
    sampleText: input.sampleText,
    vocabularyProfile,
  };
}

/**
 * 校验样本文本是否足够（建议至少 500 字以保证统计有效）
 */
export function validateSampleText(text: string): { ok: boolean; message?: string; chineseChars: number } {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (chineseChars < 100) {
    return { ok: false, message: '样本至少 100 个中文字符', chineseChars };
  }
  if (chineseChars < 500) {
    return {
      ok: true,
      message: '样本字数偏少（建议 500 字以上以保证统计准确）',
      chineseChars,
    };
  }
  return { ok: true, chineseChars };
}

/**
 * 内部使用：测试用工厂
 */
export function _testGenerateId(): string {
  return generateId('style');
}
