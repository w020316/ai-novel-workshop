// ============================================================================
// 多平台视角审稿（4 视角多平台审稿）
// 对标番茄小说/起点中文网/知乎/冷读复核四个视角，帮助作者从不同平台
// 读者群体视角审视章节质量，找到「这个平台读者为什么弃书」的根因。
// 组成：
//   - localPlatformReview  确定性启发式评分（各平台独立指标）
//   - multiPlatformReview  LLM 提供定性批评，失败/不合规则回退本地评分
// 降级：任何异常都返回可用的本地审读结果，绝不阻塞。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { localReaderReview } from './reader-review';
import type { ReviewInput } from './reader-review';

// ============ 平台定义 ============

export type PlatformId = 'fanqie' | 'qidian' | 'zhihu' | 'coldread';

export interface PlatformMeta {
  id: PlatformId;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  /** 平台读者画像 */
  readerProfile: string;
  /** 平台核心关注点 */
  focusAreas: string[];
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: 'fanqie',
    label: '番茄小说',
    shortLabel: '番茄',
    icon: '🍅',
    description: '快节奏爽文，前3章决定生死，爽点密集、钩子不断、断章悬疑',
    readerProfile: '碎片化阅读，追求即时爽感，没有耐心看大段铺垫，3章内不燃就弃书',
    focusAreas: ['开头钩子', '爽点密度', '节奏快慢', '断章悬念', '前3章吸引力'],
  },
  {
    id: 'qidian',
    label: '起点中文网',
    shortLabel: '起点',
    icon: '📖',
    description: '传统网文重设定、人物与伏笔，世界观扎实、人物有成长弧光',
    readerProfile: '重度网文读者，对设定一致性、人物塑造、伏笔回收有较高要求',
    focusAreas: ['世界观一致性', '人物塑造', '伏笔设置', '情节逻辑', '设定合理性'],
  },
  {
    id: 'zhihu',
    label: '知乎',
    shortLabel: '知乎',
    icon: '💡',
    description: '理性读者视角，关注逻辑自洽、文笔质量、内容深度与真实感',
    readerProfile: '高知读者，对逻辑漏洞零容忍，追求文笔与思想深度，反感降智桥段',
    focusAreas: ['逻辑严谨性', '文笔质量', '内容深度', '真实感', '角色行为合理性'],
  },
  {
    id: 'coldread',
    label: '冷读复核',
    shortLabel: '冷读',
    icon: '👁️',
    description: '读者视角冷读复核，评估章节整体吸引力与留存率',
    readerProfile: '普通读者，凭直觉判断章节是否抓人、是否想继续追读',
    focusAreas: ['整体节奏', '阅读流畅度', '情感共鸣', '追更欲望'],
  },
];

// ============ 平台评分接口 ============

export interface PlatformScore {
  /** 0-100 该平台读者吸引力评分 */
  score: number;
  /** 结论 */
  verdict: 'strong' | 'ok' | 'weak';
  /** 该平台读者可能喜欢的点 */
  strengths: string[];
  /** 该平台读者可能弃书的点 */
  weaknesses: string[];
  /** 针对该平台的改进建议 */
  suggestions: string[];
  /** 是否来自 LLM 定性批评 */
  fromLLM: boolean;
}

export interface MultiPlatformReview {
  /** 各平台打分 */
  platforms: Record<PlatformId, PlatformScore>;
  /** 综合分（各平台加权平均，番茄权重最高） */
  overallScore: number;
  /** 最大风险平台（分数最低的） */
  riskiestPlatform: PlatformId;
  /** 跨平台通病（出现在多个平台 weaknesses 中的问题） */
  commonIssues: string[];
}

/** 本地确定性评分的基础指标 */
interface LocalMetrics {
  hookDensity: number; // 钩子密度/千字
  coolPointDensity: number; // 爽点密度/千字
  cliffhangerRatio: number; // 断章悬念比率
  avgSentenceLength: number;
  dialogueRatio: number;
  wordCount: number;
  hasOpeningHook: boolean;
  hasCliffhanger: boolean;
  complexVocabRatio: number; // 复杂词汇比例（>2字词）
  logicClueCount: number; // 逻辑线索词数量（因为/所以/因此/然而等）
}

// ============ 本地指标提取 ============

const HOOK_PATTERN = /(突然|竟|却|杀|死|血|刀|危险|秘密|阴谋|契约|跪|不可能|失踪|屠|灭|劫|背叛|惊变|巨响|嘶吼|猛地|骤然|一把|狠狠)/g;
const COOL_POINT_PATTERN = /(碾压|秒杀|打脸|震惊|逆袭|突破|觉醒|暴怒|横扫|无敌|一拳|一剑|一招|秒了|吊打|反杀|复仇|踏平|横扫|碾压|碾压)/g;
const CLIFF_PATTERN = /(…|\.\.\.|？|战战兢兢|却又|就在这时|难道|难道说|随即|只见|忽然|正在这时|猛然)/g;
const LOGIC_CLUE_PATTERN = /(因为|所以|因此|然而|但是|虽然|尽管|却|于是|从而|导致|使得|基于|由此|据此|这意味着)/g;
const COMPLEX_WORD_PATTERN = /[\u4e00-\u9fff]{3,}/g;

function countHan(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

function extractLocalMetrics(content: string): LocalMetrics {
  const han = countHan(content);
  const sentences = content.split(/[。！？\n]+/).filter(Boolean);
  const avgSentenceLength = sentences.length > 0 ? han / sentences.length : 0;

  const hooks = content.match(HOOK_PATTERN) ?? [];
  const coolPoints = content.match(COOL_POINT_PATTERN) ?? [];
  const cliffs = content.match(CLIFF_PATTERN) ?? [];
  const logicClues = content.match(LOGIC_CLUE_PATTERN) ?? [];

  const hookDensity = han > 0 ? (hooks.length / han) * 1000 : 0;
  const coolPointDensity = han > 0 ? (coolPoints.length / han) * 1000 : 0;

  // 对话占比
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let dialogueChars = 0;
  for (const line of lines) {
    if (/^[""「]|[」""]|(说|道|问|答|喊|叫)([:：又，])?/.test(line)) {
      dialogueChars += countHan(line);
    }
  }
  const dialogueRatio = han > 0 ? Math.min(1, dialogueChars / han) : 0;

  // 复杂词汇比例
  const complexWords = content.match(COMPLEX_WORD_PATTERN) ?? [];
  const allWords = content.match(/[\u4e00-\u9fff]+/g) ?? [];
  const complexVocabRatio = allWords.length > 0 ? complexWords.length / allWords.length : 0;

  const head = content.slice(0, 80);
  const tail = content.slice(-60);
  const hasOpeningHook = /(突然|竟|却|杀|死|血|刀|危险|秘密|阴谋|契约|跪|不可能|失踪|屠|灭|劫|背叛|惊变|巨响|嘶吼|猛地|骤然|一把|狠狠)/.test(head);
  const hasCliffhanger = CLIFF_PATTERN.test(tail);

  return {
    hookDensity: +hookDensity.toFixed(2),
    coolPointDensity: +coolPointDensity.toFixed(2),
    cliffhangerRatio: +((cliffs.length / Math.max(1, sentences.length)).toFixed(2)),
    avgSentenceLength: +avgSentenceLength.toFixed(1),
    dialogueRatio: +dialogueRatio.toFixed(2),
    wordCount: han,
    hasOpeningHook,
    hasCliffhanger,
    complexVocabRatio: +complexVocabRatio.toFixed(3),
    logicClueCount: logicClues.length,
  };
}

// ============ 各平台本地评分 ============

function scoreFanqie(metrics: LocalMetrics): Omit<PlatformScore, 'fromLLM'> {
  let score = 55;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  // 钩子密度
  if (metrics.hookDensity >= 3) { score += 15; strengths.push('钩子密集，能持续抓住读者'); }
  else if (metrics.hookDensity >= 1.5) { score += 8; }
  else { score -= 10; weaknesses.push('钩子不足，前3章可能流失读者'); suggestions.push('在每章开头或关键转折处埋入钩子词（突然/竟/却/猛地），至少每千字2-3个'); }

  // 爽点密度
  if (metrics.coolPointDensity >= 2) { score += 15; strengths.push('爽点密集，符合番茄读者期待'); }
  else if (metrics.coolPointDensity >= 1) { score += 5; }
  else { score -= 8; weaknesses.push('爽点稀疏，快节奏读者可能弃书'); suggestions.push('增加打脸/逆袭/碾压类爽点，每千字至少1-2个爽点'); }

  // 开篇钩子
  if (metrics.hasOpeningHook) { score += 8; strengths.push('开篇有钩子，能快速吸引读者'); }
  else { score -= 8; weaknesses.push('开篇缺乏钩子，番茄读者可能直接划走'); suggestions.push('开头第一段就要抛出冲突或悬念，不要让读者等'); }

  // 断章悬念
  if (metrics.hasCliffhanger) { score += 8; strengths.push('章末留有悬念，追更意愿强'); }
  else { score -= 5; weaknesses.push('章末无悬念，读者可能不追更'); suggestions.push('章末留一个悬念或反转，确保读者想点下一章'); }

  // 句长（短句 = 快节奏）
  if (metrics.avgSentenceLength < 25) { score += 8; strengths.push('句子短促有力，节奏快'); }
  else if (metrics.avgSentenceLength > 40) { score -= 5; weaknesses.push('句子偏长，节奏偏慢'); suggestions.push('适当拆分长句，用短句制造紧张感'); }

  // 对话
  if (metrics.dialogueRatio >= 0.25 && metrics.dialogueRatio <= 0.6) { score += 6; strengths.push('对话比例适中，读起来不枯燥'); }
  else if (metrics.dialogueRatio > 0.7) { score -= 5; weaknesses.push('对话占比过高，缺乏动作与场景描写'); suggestions.push('在对话间穿插动作与场景描写，避免「全是嘴」'); }

  return {
    score: Math.max(0, Math.min(100, score)),
    verdict: score >= 75 ? 'strong' : score >= 55 ? 'ok' : 'weak',
    strengths,
    weaknesses,
    suggestions,
  };
}

function scoreQidian(metrics: LocalMetrics): Omit<PlatformScore, 'fromLLM'> {
  let score = 55;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  // 逻辑线索（体现设定/伏笔/情节推进）
  if (metrics.logicClueCount >= 5) { score += 10; strengths.push('逻辑线索丰富，情节推进有章法'); }
  else if (metrics.logicClueCount >= 2) { score += 5; }
  else { score -= 8; weaknesses.push('逻辑关联词偏少，情节推进可能缺乏因果链条'); suggestions.push('增加因果/转折关联词，让情节发展更有层次'); }

  // 复杂词汇（体现文笔与设定深度）
  if (metrics.complexVocabRatio >= 0.15) { score += 10; strengths.push('词汇丰富，文笔有厚度'); }
  else if (metrics.complexVocabRatio >= 0.08) { score += 5; }
  else { score -= 5; weaknesses.push('词汇偏简单，起点读者可能觉得文笔不够'); suggestions.push('适当增加多字词语与专业术语，提升文本质感'); }

  // 篇幅（起点读者不排斥长章节）
  if (metrics.wordCount >= 2000 && metrics.wordCount <= 5000) { score += 8; strengths.push('章节篇幅适中，信息量充足'); }
  else if (metrics.wordCount < 1000) { score -= 10; weaknesses.push('章节篇幅过短，信息量不足'); suggestions.push('适当展开描写，增加细节与层次，单章建议2000-5000字'); }
  else if (metrics.wordCount > 8000) { score -= 3; weaknesses.push('章节偏长，可能导致阅读疲劳'); suggestions.push('考虑拆分章节，或在小高潮处做断章'); }

  // 对话比例（起点读者偏好适中描写）
  if (metrics.dialogueRatio >= 0.2 && metrics.dialogueRatio <= 0.5) { score += 5; }
  else if (metrics.dialogueRatio > 0.65) { score -= 5; weaknesses.push('对话占比偏高，描写偏少'); suggestions.push('增加环境与动作描写，让对话有场景支撑'); }

  // 开篇
  if (metrics.hasOpeningHook) { score += 5; strengths.push('开篇有悬念/冲突'); }
  else { score -= 5; weaknesses.push('开篇平淡，缺乏吸引力'); suggestions.push('在开头铺垫一个悬念或冲突，让读者有继续读的动力'); }

  // 断章
  if (metrics.hasCliffhanger) { score += 7; strengths.push('章末留有悬念，追读意愿强'); }
  else { score -= 3; }

  return {
    score: Math.max(0, Math.min(100, score)),
    verdict: score >= 75 ? 'strong' : score >= 55 ? 'ok' : 'weak',
    strengths,
    weaknesses,
    suggestions,
  };
}

function scoreZhihu(metrics: LocalMetrics): Omit<PlatformScore, 'fromLLM'> {
  let score = 55;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  // 逻辑严谨性
  if (metrics.logicClueCount >= 8) { score += 12; strengths.push('逻辑链条完整，经得起推敲'); }
  else if (metrics.logicClueCount >= 4) { score += 6; }
  else { score -= 8; weaknesses.push('逻辑关联词不足，可能缺乏因果推导'); suggestions.push('强化情节的因果逻辑，让每个事件都有前因后果'); }

  // 文笔质量（复杂词汇比例高 + 句长适中 = 文笔好）
  if (metrics.complexVocabRatio >= 0.2) { score += 12; strengths.push('词汇丰富，文笔有质感'); }
  else if (metrics.complexVocabRatio >= 0.1) { score += 5; }
  else { score -= 5; weaknesses.push('词汇偏简单，文笔略显单薄'); suggestions.push('丰富词汇表达，避免重复使用相同句式与词语'); }

  // 句长（知乎读者偏好适中句长，太短像口水文，太长像翻译体）
  if (metrics.avgSentenceLength >= 20 && metrics.avgSentenceLength <= 35) { score += 8; strengths.push('句长适中，阅读体验好'); }
  else if (metrics.avgSentenceLength > 45) { score -= 5; weaknesses.push('句子偏长，阅读费力'); suggestions.push('拆分长句，适当使用短句调节节奏'); }
  else if (metrics.avgSentenceLength < 15) { score -= 5; weaknesses.push('句子偏短，像碎片化表达'); suggestions.push('适当增加复合句，提升文本层次感'); }

  // 对话占比
  if (metrics.dialogueRatio >= 0.15 && metrics.dialogueRatio <= 0.45) { score += 5; }
  else if (metrics.dialogueRatio > 0.6) { score -= 5; weaknesses.push('对话偏多，缺乏深度描写'); suggestions.push('在对话间隙增加心理描写与环境烘托'); }

  // 篇幅（知乎读者接受深度内容）
  if (metrics.wordCount >= 1500 && metrics.wordCount <= 4000) { score += 5; }
  else if (metrics.wordCount < 800) { score -= 5; weaknesses.push('篇幅过短，深度不足'); suggestions.push('适当展开，增加细节与深度分析'); }

  // 开篇与断章
  if (metrics.hasOpeningHook) { score += 3; }
  if (metrics.hasCliffhanger) { score += 3; }

  return {
    score: Math.max(0, Math.min(100, score)),
    verdict: score >= 75 ? 'strong' : score >= 55 ? 'ok' : 'weak',
    strengths,
    weaknesses,
    suggestions,
  };
}

function scoreColdRead(metrics: LocalMetrics): Omit<PlatformScore, 'fromLLM'> {
  // 复用冷读复核的逻辑，但只取本地部分
  let score = 60;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];

  if (metrics.wordCount >= 1500 && metrics.wordCount <= 4500) score += 10;
  else if (metrics.wordCount < 200) score -= 25;
  else if (metrics.wordCount < 800) score -= 12;

  if (metrics.dialogueRatio >= 0.22 && metrics.dialogueRatio <= 0.55) score += 10;
  else if (metrics.dialogueRatio > 0.8) score -= 8;

  if (metrics.avgSentenceLength > 0 && metrics.avgSentenceLength < 25) score += 8;

  if (metrics.hasOpeningHook) { score += 6; strengths.push('开篇有钩子'); }
  else { weaknesses.push('开篇缺乏钩子'); suggestions.push('在开头抛出一个悬念/冲突/反常细节'); }

  if (metrics.hasCliffhanger) { score += 6; strengths.push('结尾留有悬念'); }
  else { suggestions.push('章末可留一个悬念或反转作断章'); }

  score = Math.max(0, Math.min(100, score));

  const verdict: PlatformScore['verdict'] = score >= 80 ? 'strong' : score >= 60 ? 'ok' : 'weak';

  if (score < 80 && strengths.length === 0 && weaknesses.length === 0) {
    strengths.push('整体节奏与篇幅均衡');
  }

  return { score, verdict, strengths, weaknesses, suggestions };
}

// ============ 本地四平台评分 ============

function localPlatformReview(content: string): Record<PlatformId, Omit<PlatformScore, 'fromLLM'>> {
  const metrics = extractLocalMetrics(content);
  return {
    fanqie: scoreFanqie(metrics),
    qidian: scoreQidian(metrics),
    zhihu: scoreZhihu(metrics),
    coldread: scoreColdRead(metrics),
  };
}

// ============ LLM 系统提示词 ============

const SYSTEM_PROMPT_FANQIE = `你是一位在番茄小说上有过爆款经验的资深主编。请从「番茄小说读者」视角评估本章的留存潜力。

番茄读者特点：碎片化阅读、追求即时爽感、没有耐心看大段铺垫、前3章不燃就弃书。

评估维度：开头钩子、爽点密度、节奏快慢、断章悬念、前3章吸引力。

严格只输出JSON（不要任何解释、前后缀、markdown），字段如下：
{
  "score": 0到100的整数,
  "strengths": ["优势1","优势2"],
  "weaknesses": ["槽点1","槽点2"],
  "suggestions": ["改法1","改法2"]
}`;

const SYSTEM_PROMPT_QIDIAN = `你是一位在起点中文网上有多年经验的资深编辑。请从「起点中文网读者」视角评估本章质量。

起点读者特点：重度网文读者、对设定一致性要求高、关注人物成长与伏笔回收、能接受较慢的节奏但要求有深度。

评估维度：世界观一致性、人物塑造、伏笔设置、情节逻辑、设定合理性。

严格只输出JSON（不要任何解释、前后缀、markdown），字段如下：
{
  "score": 0到100的整数,
  "strengths": ["优势1","优势2"],
  "weaknesses": ["槽点1","槽点2"],
  "suggestions": ["改法1","改法2"]
}`;

const SYSTEM_PROMPT_ZHIHU = `你是一位在知乎上活跃的高知读者和文学评论者。请从「知乎读者」视角评估本章。

知乎读者特点：高知读者、对逻辑漏洞零容忍、追求文笔与思想深度、反感降智桥段和套路化表达。

评估维度：逻辑严谨性、文笔质量、内容深度、真实感、角色行为合理性。

严格只输出JSON（不要任何解释、前后缀、markdown），字段如下：
{
  "score": 0到100的整数,
  "strengths": ["优势1","优势2"],
  "weaknesses": ["槽点1","槽点2"],
  "suggestions": ["改法1","改法2"]
}`;

// ============ 工具函数 ============

const PROMPT_MAP: Record<Exclude<PlatformId, 'coldread'>, string> = {
  fanqie: SYSTEM_PROMPT_FANQIE,
  qidian: SYSTEM_PROMPT_QIDIAN,
  zhihu: SYSTEM_PROMPT_ZHIHU,
};

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

function resolveVerdict(score: number): PlatformScore['verdict'] {
  return score >= 75 ? 'strong' : score >= 55 ? 'ok' : 'weak';
}

// ============ 单平台 LLM 审读 ============

async function reviewPlatform(
  platform: Exclude<PlatformId, 'coldread'>,
  input: ReviewInput,
  local: Omit<PlatformScore, 'fromLLM'>
): Promise<PlatformScore> {
  const han = input.content.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
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
      `请从${platform === 'fanqie' ? '番茄小说' : platform === 'qidian' ? '起点中文网' : '知乎'}读者视角评估，严格 JSON。`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await chat(
      [
        { role: 'system', content: PROMPT_MAP[platform] },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'text', temperature: 0.4, maxTokens: 500 }
    ).catch(() => null);

    if (!result) return { score, verdict: resolveVerdict(score), strengths, weaknesses, suggestions, fromLLM };

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
        if (s.length) strengths = s;
        if (w.length) weaknesses = w;
        if (g.length) suggestions = g;
        if (!fromLLM) fromLLM = true;
      }
    }
  } catch {
    // LLM 不可用 → 保持本地评分
  }

  return { score, verdict: resolveVerdict(score), strengths, weaknesses, suggestions, fromLLM };
}

// ============ 主入口 ============

/**
 * 多平台审读：从番茄小说/起点中文网/知乎/冷读复核四个视角评估章节质量。
 * 前三平台优先 LLM 定性批评，失败回退本地启发式评分。
 * 冷读复核复用现有 localReaderReview 逻辑（无 LLM 依赖）。
 */
export async function multiPlatformReview(input: ReviewInput): Promise<MultiPlatformReview> {
  const localScores = localPlatformReview(input.content);

  // 冷读复核直接复用本地评分
  const coldReadLocal = localReaderReview(input.content);
  const coldReadScore: PlatformScore = {
    score: coldReadLocal.score,
    verdict: coldReadLocal.score >= 80 ? 'strong' : coldReadLocal.score >= 60 ? 'ok' : 'weak',
    strengths: coldReadLocal.strengths,
    weaknesses: coldReadLocal.weaknesses,
    suggestions: coldReadLocal.suggestions,
    fromLLM: coldReadLocal.fromLLM,
  };

  // 并行执行三个 LLM 平台的审读
  const [fanqie, qidian, zhihu] = await Promise.all([
    reviewPlatform('fanqie', input, localScores.fanqie),
    reviewPlatform('qidian', input, localScores.qidian),
    reviewPlatform('zhihu', input, localScores.zhihu),
  ]);

  const platforms: Record<PlatformId, PlatformScore> = {
    fanqie,
    qidian,
    zhihu,
    coldread: coldReadScore,
  };

  // 综合分：番茄0.3, 起点0.25, 知乎0.2, 冷读0.25
  const overallScore = Math.round(
    fanqie.score * 0.3 + qidian.score * 0.25 + zhihu.score * 0.2 + coldReadScore.score * 0.25
  );

  // 风险平台
  const entries = Object.entries(platforms) as [PlatformId, PlatformScore][];
  const riskiestPlatform = entries.reduce((a, b) => (a[1].score < b[1].score ? a : b))[0];

  // 跨平台通病
  const allWeaknesses = entries.flatMap(([, p]) => p.weaknesses);
  const commonIssues = [...new Set(allWeaknesses.filter(
    (w) => allWeaknesses.filter((x) => x === w).length >= 2
  ))];

  return { platforms, overallScore, riskiestPlatform, commonIssues };
}

/** 平台 verdict 中文标签 */
export const platformVerdictLabel: Record<PlatformScore['verdict'], string> = {
  strong: '推荐',
  ok: '可接受',
  weak: '需改进',
};