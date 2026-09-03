// ============================================================================
// 去AI味（Humanizer）
// 依据：调研结论——短视频生态（G先生/阿序AI/DeterminFlow）高频强调
//       「去AI味、提高过审概率」是 AI 写小说能否商业化签约的关键一环；
//       v2 吸收 InkOS「spot-fix 定点修复」思路：只改写命中句，非整章重写，
//       防止整章重写引入更多 AI 味（整章重写仅作为兜底保留）。
// 组成：
//   - detect.ts  确定性 AI 痕迹扫描（无 LLM 依赖，稳定可测）
//   - 本文件     LLM 依据检测结果做「点对点改写」，保留剧情与人设
// 降级：LLM 不可用 / 结果为空或未改动时，安全返回原稿。
// ============================================================================
import { chat } from '@/lib/llm/client';
import {
  detectAITraces,
  summarizeTraces,
  expandToSentence,
} from '@/lib/humanize/detect';
import type { AiTraceReport } from '@/lib/humanize/detect';
import { safeParseJSON } from '@/lib/utils';

export { detectAITraces, summarizeTraces };
export type { AiTraceReport, AiTraceCategory, AiTraceMatch } from '@/lib/humanize/detect';

/** 定点修复的句子数量上限（防止超长 Prompt 与失控成本） */
const MAX_SPOT_SENTENCES = 40;

export interface HumanizeInput {
  content: string;
  title?: string;
  chapterNo?: number;
  /** 文风样本（可空），用于约束改后风格 */
  styleSample?: string;
  /** 修复模式：spot=定点修复命中句（默认）；full=整章重写（兜底/可选手动指定） */
  mode?: 'spot' | 'full';
}

export interface HumanizeSpotFix {
  /** 原句（含命中痕迹的完整句子） */
  original: string;
  /** 改写后的句子 */
  rewritten: string;
}

export interface HumanizeResult {
  /** 重写后的正文（可能与原稿一致，即无需改动或降级） */
  content: string;
  /** 是否发生了改写 */
  changed: boolean;
  /** 改写前的检测报告 */
  report: AiTraceReport;
  /** 实际采用的模式（spot 失败降级为 full） */
  mode: 'spot' | 'full';
  /** 定点修复明细（spot 模式下实际被替换的句子） */
  spots: HumanizeSpotFix[];
}

const SYSTEM_PROMPT = `你是一位深谙网文市场的资深编辑，擅长把 AI 生成味浓的文本改得像真人作者写的。

要求：
1.【点对点改写】只针对给出的 AI 痕迹，替换为更有镜头感、更口语、更利落的网文表达；不要重写整章剧情
2. 保留原有剧情推进、人设与分镜节奏
3. 删除无效空动作与灌水套话，戒掉总结式旁白，减少生硬转折词
4. 用短句、具体描写、有信息量的动作与对话推进，增强沉浸感
5. 直接输出改写后的完整正文，不要任何解释或前后缀`;

/** 定点修复专用 System Prompt */
const SPOT_SYSTEM_PROMPT = `你是一位深谙网文市场的资深编辑，正在对正文做「定点去AI味」。

要求：
1. 只改写列出的句子，未列出的句子一律不要动
2. 替换为更有镜头感、更口语、更利落的网文表达，删除无效空动作、套话与书面腔
3. 保持与上下文的剧情、人设、时态、人称完全一致，严禁改变事实与剧情走向
4. 输出严格的 JSON 对象：键为句子编号字符串，值为改写后的完整句子，如 {"1":"改写后的句子","3":"..."}
5. 不需要改写的句子可省略；不要输出任何解释、注释或代码块标记`;

/**
 * 依据 AI 痕迹检测结果对章节正文做「去AI味」改写。
 * 默认采用「定点修复」：仅把命中句交给 LLM 改写后拼回原文，最大限度
 * 保留整章原貌（InkOS spot-fix 思路，防止整章重写引入更多 AI 味）；
 * 定点修复失败时自动降级为整章重写。任何失败或未改动都安全返回原稿，
 * 绝不破坏正文。
 */
export async function humanizeChapter(input: HumanizeInput): Promise<HumanizeResult> {
  const { content, title, chapterNo, styleSample, mode = 'spot' } = input;
  const trimmed = content.trim();
  const report = detectAITraces(trimmed);

  // 无痕迹则无需改写
  if (report.totalCount === 0) {
    return { content: trimmed, changed: false, report, mode, spots: [] };
  }

  // 1) 定点修复（spot）：只改命中句
  if (mode === 'spot') {
    const spotResult = await spotFix(trimmed, report, { title, chapterNo, styleSample });
    if (spotResult) {
      return {
        content: spotResult.content,
        changed: true,
        report,
        mode: 'spot',
        spots: spotResult.spots,
      };
    }
    // 定点修复失败 → 降级整章重写
  }

  // 2) 整章重写（full）：兜底或显式指定
  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildFullPrompt(trimmed, report, { title, chapterNo, styleSample }) },
      ],
      { responseFormat: 'text', temperature: 0.7, maxTokens: 4096, task: 'humanize' }
    );

    const rewritten = result.content?.trim();
    // 结果为空 / 未被改动 → 视为无需处理，返回原稿
    if (!rewritten || rewritten === trimmed) {
      return { content: trimmed, changed: false, report, mode: 'full', spots: [] };
    }
    return { content: rewritten, changed: true, report, mode: 'full', spots: [] };
  } catch {
    // LLM 不可用等任何异常 → 安全返回原稿
    return { content: trimmed, changed: false, report, mode, spots: [] };
  }
}

/** ===== 定点修复 ===== */
async function spotFix(
  content: string,
  report: AiTraceReport,
  opts: { title?: string; chapterNo?: number; styleSample?: string }
): Promise<{ content: string; spots: HumanizeSpotFix[] } | null> {
  // 收集命中句：把每处命中扩展为完整句子，按位置去重合并
  const targets = collectSpotTargets(content, report);
  if (targets.length === 0) return null;

  const numbered = targets.map((t, i) => `${i + 1}. ${t.text}`).join('\n');
  const header = buildSpotHeader(opts);
  const userPrompt = [
    header,
    '【检测说明】以下句子被确定性规则命中 AI 味痕迹，请逐句定点改写。',
    '',
    '【待改写句子】',
    numbered,
    '',
    '【完整正文（仅供理解上下文，不要改写其中未列出的句子）】',
    content,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: SPOT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.6, maxTokens: 4096 }
    );

    const map = safeParseJSON<Record<string, string>>(result.content ?? '', {});
    if (!map || typeof map !== 'object') return null;

    // 按位置从后往前替换，避免索引偏移
    const spots: HumanizeSpotFix[] = [];
    let output = content;
    for (let i = targets.length - 1; i >= 0; i--) {
      const rewritten = (map[String(i + 1)] ?? '').trim();
      const original = targets[i].text;
      if (!rewritten || rewritten === original) continue;
      output = output.slice(0, targets[i].start) + rewritten + output.slice(targets[i].end);
      spots.unshift({ original, rewritten });
    }

    if (spots.length === 0 || output === content) return null;
    return { content: output, spots };
  } catch {
    return null;
  }
}

/** 从检测报告中收集定点修复目标（句子级，去重、合并重叠、限量） */
function collectSpotTargets(
  content: string,
  report: AiTraceReport
): { text: string; start: number; end: number }[] {
  const byStart = new Map<number, { text: string; start: number; end: number }>();

  for (const cat of report.categories) {
    for (const m of cat.matches) {
      const sentence =
        cat.id === 'long_paragraph' || cat.id === 'consecutive_le'
          ? m // 段落级/句子级规则的命中本身就是完整单元
          : expandToSentence(content, m.start, m.end);
      if (!sentence.text.trim()) continue;
      const prev = byStart.get(sentence.start);
      if (!prev || sentence.end > prev.end) {
        byStart.set(sentence.start, sentence);
      }
    }
  }

  // 按起始位置排序并合并重叠区间
  const sorted = [...byStart.values()].sort((a, b) => a.start - b.start);
  const merged: { text: string; start: number; end: number }[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end;
      last.text = content.slice(last.start, last.end);
    } else {
      merged.push({ ...s });
    }
  }

  // 超限时均匀抽样保留（避免只截取开头）
  if (merged.length > MAX_SPOT_SENTENCES) {
    const step = merged.length / MAX_SPOT_SENTENCES;
    const sampled: typeof merged = [];
    for (let i = 0; i < MAX_SPOT_SENTENCES; i++) {
      sampled.push(merged[Math.floor(i * step)]);
    }
    return sampled;
  }
  return merged;
}

function buildSpotHeader(opts: { title?: string; chapterNo?: number }): string {
  return opts.title || opts.chapterNo
    ? `【第 ${opts.chapterNo ?? '-'} 章 - ${opts.title ?? '本章'}】`
    : '';
}

function buildFullPrompt(
  trimmed: string,
  report: AiTraceReport,
  opts: { title?: string; chapterNo?: number; styleSample?: string }
): string {
  const traceText = report.categories
    .map(
      (c) =>
        `- ${c.label} ×${c.count}：${c.examples.join('、')}（建议：${c.hint}）`
    )
    .join('\n');

  return [
    opts.title || opts.chapterNo
      ? `【第 ${opts.chapterNo ?? '-'} 章 - ${opts.title ?? '本章'}】`
      : '',
    '',
    '【检测到的 AI 痕迹】',
    traceText,
    '',
    opts.styleSample ? `【文风样本】\n${opts.styleSample}` : '',
    '',
    '【原文（请去AI味改写后输出完整正文）】',
    trimmed,
  ]
    .filter(Boolean)
    .join('\n');
}
