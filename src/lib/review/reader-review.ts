// ============================================================================
// 读者视角「冷读」复核（Reader Cool-Read Review）
// 依据：调研结论 —— 阿序AI（两本签约）亲述：AI 写长篇真正的难点
//       「让人物、剧情、伏笔对得上」，且每章写完要让 AI 切到「读者视角
//       冷读复核」——本模块即该能力。
// 组成：
//   - localReaderReview  确定性启发式读者评分（字数/对话占比/段落节奏/
//                         开篇钩子/悬念断章），无 LLM 依赖，稳定可测
//   - reviewChapter      LLM 提供定性批评，失败或不合规则回退本地评分
// 降级：任何异常都返回可用的本地审读结果，绝不阻塞。
// ============================================================================
import { chat } from '@/lib/llm/client';

export interface ReaderMetrics {
  wordCount: number;
  dialogueRatio: number;
  avgParaLength: number;
  hasOpeningHook: boolean;
  hasCliffhanger: boolean;
}

export interface ReaderReview {
  /** 0-100 读者吸引力评分 */
  score: number;
  /** 结论：gripping｜ok ｜ dull */
  verdict: 'gripping' | 'ok' | 'dull';
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  metrics: ReaderMetrics;
  /** 是否来自 LLM 定性批评（false 表示仅本地启发式，可能 LLM 不可用） */
  fromLLM: boolean;
}

export interface ReviewInput {
  content: string;
  title?: string;
  chapterNo?: number;
}

/** 理想字数区间（网文单章） */
const IDEAL_WORDS = [1500, 4500] as const;
/** 对话占比理想区间 */
const IDEAL_DIALOGUE = [0.22, 0.55] as const;
/** 开篇钩子关键词 */
const HOOK_WORDS =
  /(突然|竟|却|杀|死|血|刀|危险|秘密|阴谋|契约|跪|不可能|失踪|屠|灭|劫|贿|背叛|惊变|阴谋|巨响|嘶吼)/;
/** 断章悬念特征（章末悬而未决） */
const CLIFF_WORDS = /(…|\.\.\.|？|战战兢兢|却又|就在这时|难道|难道说|随即|只见)/;

/** 统计纯中文与标点字数 */
function countHan(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

/**
 * 确定性启发式读者评分：从字数、对话占比、段落节奏、开篇钩子、悬念断章
 * 五个维度给出 0-100 分与结论，完全不依赖 LLM。
 */
export function localReaderReview(content: string): ReaderReview {
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const flat = lines.join('\n');

  const wordCount = countHan(flat);
  // 对话占比：按「行」判断，含引号开头或语句（说/道/问/答 等）视为对话行，
  // 统计其汉字占比，更贴近真实对话体量
  let dialogueChars = 0;
  for (const line of lines) {
    if (/^[““"「]|[””"」]|(说|道|问|答|喊|叫)([:：又，])?|说(完|着|道)|道[:：]/.test(line)) {
      dialogueChars += countHan(line);
    }
  }
  const dialogueRatio = wordCount > 0 ? Math.min(1, dialogueChars / wordCount) : 0;
  const avgParaLength = lines.length ? wordCount / lines.length : 0;

  const head = flat.slice(0, 80);
  const tail = flat.slice(-60);
  const hasOpeningHook = HOOK_WORDS.test(head);
  const hasCliffhanger = CLIFF_WORDS.test(tail);

  // 评分
  let score = 60;
  if (wordCount >= IDEAL_WORDS[0] && wordCount <= IDEAL_WORDS[1]) score += 10;
  else if (wordCount < 200) score -= 25;
  else if (wordCount < 800) score -= 12;
  if (dialogueRatio >= IDEAL_DIALOGUE[0] && dialogueRatio <= IDEAL_DIALOGUE[1]) score += 10;
  else if (dialogueRatio > 0.8) score -= 8;
  if (avgParaLength > 0 && avgParaLength < 180) score += 8; // 短段落更有节奏
  if (hasOpeningHook) score += 6;
  if (hasCliffhanger) score += 6;
  score = Math.max(0, Math.min(100, score));

  const verdict: ReaderReview['verdict'] =
    score >= 80 ? 'gripping' : score >= 60 ? 'ok' : 'dull';

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  if (wordCount < 800) {
    weaknesses.push('本章篇幅过短，展开不足');
    suggestions.push('适当充实剧情与冲突，避免流水账式收束');
  }
  if (dialogueRatio > 0.8) {
    weaknesses.push('对话占比过高');
    suggestions.push('增加动作与场景描写，避免通篇对话');
  }
  if (!hasOpeningHook) {
    weaknesses.push('开篇缺乏钩子');
    suggestions.push('在开头抛出一个悬念/冲突/反常细节，立刻抓住读者');
  }
  if (!hasCliffhanger) {
    suggestions.push('章末可留一个悬念或反转作断章，提升追更欲');
  }
  if (strengths.length === 0 && weaknesses.length === 0) {
    strengths.push('整体节奏与篇幅均衡');
  }
  if (hasOpeningHook) strengths.push('开篇有钩子');
  if (hasCliffhanger) strengths.push('结尾留有悬念');

  return {
    score,
    verdict,
    strengths,
    weaknesses,
    suggestions,
    metrics: { wordCount, dialogueRatio: +dialogueRatio.toFixed(2), avgParaLength: +avgParaLength.toFixed(1), hasOpeningHook, hasCliffhanger },
    fromLLM: false,
  };
}

const SYSTEM_PROMPT = `你是一位满身经验、嘴又毒又准的网文主编，负责给每章做「读者视角冷读复核」。在读者眼中，这章到底抓不抓人？

请你从读者留存角度评估本章，严格只输出 JSON（不要任何解释、前后缀、markdown），字段如下：
{
  "score": 0到100的整数（读者吸引力总分，越抓人越高，通常紧扣钩子/节奏/爽点/悬念"),
  "strengths": ["优势1","优势2"],
  "weaknesses": ["槽点1","槽点2"],
  "suggestions": ["改法1","改法2"]
}`;

/** 从 LLM 文本中尽力解出 JSON 对象，失败返回 null */
function tryParseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
}

function resolveVerdict(score: number): ReaderReview['verdict'] {
  return score >= 80 ? 'gripping' : score >= 60 ? 'ok' : 'dull';
}

/**
 * 读者冷读复核：本地评分先行，LLM 注入主观定性批评。
 * LLM 失败 / 返回非法数据 / 无评分时安全回退到本地评分。
 */
export async function reviewChapter(input: ReviewInput): Promise<ReaderReview> {
  const local = localReaderReview(input.content);
  const han = local.metrics.wordCount;

  let fromLLM = false;
  let strengths = local.strengths;
  let weaknesses = local.weaknesses;
  let suggestions = local.suggestions;
  let score = local.score;

  try {
    const userPrompt = [
      input.chapterNo || input.title ? `【第 ${input.chapterNo ?? '-'} 章 - ${input.title ?? '本章'}】` : '',
      `【本章约 ${han} 字】`,
      `【正文】`,
      input.content,
      '',
      '请基于以上，给出 0-100 的读者吸引力评分与批评意见（严格 JSON）。',
    ]
      .filter(Boolean)
      .join('\n');

    // 用 .catch 守卫 LLM 调用：任何失败都回落到本地评分，绝不外抛
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'text', temperature: 0.4, maxTokens: 500 }
    ).catch(() => null);
    if (!result) return { score, verdict: resolveVerdict(score), strengths, weaknesses, suggestions, metrics: local.metrics, fromLLM };

    const parsed = tryParseJson(result.content ?? '');
    if (parsed) {
      const llmScore = Number(parsed.score);
      if (Number.isFinite(llmScore) && llmScore >= 0 && llmScore <= 100) {
        score = Math.round(llmScore);
        fromLLM = true;
      }
      const s = strArray(parsed.strengths);
      const w = strArray(parsed.weaknesses);
      const g = strArray(parsed.suggestions);
      if (s.length + w.length + g.length > 0) {
        // 既有结构化建议优先展示 LLM 结论
        if (s.length) strengths = s;
        if (w.length) weaknesses = w;
        if (g.length) suggestions = g;
        if (!fromLLM) fromLLM = true;
      }
    }
  } catch {
    // LLM 不可用 → 保持本地评分
  }

  const verdict = resolveVerdict(score);

  return { score, verdict, strengths, weaknesses, suggestions, metrics: local.metrics, fromLLM };
}

export const readerReviewVerdictLabel: Record<ReaderReview['verdict'], string> = {
  gripping: '很抓人',
  ok: '中规中矩',
  dull: '偏弱，需加强',
};