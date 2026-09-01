// ============================================================================
// 去AI味（Humanizer）
// 依据：调研结论——短视频生态（G先生/阿序AI/DeterminFlow）高频强调
//       「去AI味、提高过审概率」是 AI 写小说能否商业化签约的关键一环。
// 组成：
//   - detect.ts  确定性 AI 痕迹扫描（无 LLM 依赖，稳定可测）
//   - 本文件     LLM 依据检测结果做「点对点改写」，保留剧情与人设
// 降级：LLM 不可用 / 结果为空或未改动时，安全返回原稿。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { detectAITraces, summarizeTraces } from '@/lib/humanize/detect';
import type { AiTraceReport } from '@/lib/humanize/detect';

export { detectAITraces, summarizeTraces };
export type { AiTraceReport, AiTraceCategory } from '@/lib/humanize/detect';

export interface HumanizeInput {
  content: string;
  title?: string;
  chapterNo?: number;
  /** 文风样本（可空），用于约束改后风格 */
  styleSample?: string;
}

export interface HumanizeResult {
  /** 重写后的正文（可能与原稿一致，即无需改动或降级） */
  content: string;
  /** 是否发生了改写 */
  changed: boolean;
  /** 改写前的检测报告 */
  report: AiTraceReport;
}

const SYSTEM_PROMPT = `你是一位深谙网文市场的资深编辑，擅长把 AI 生成味浓的文本改得像真人作者写的。

要求：
1.【点对点改写】只针对给出的 AI 痕迹，替换为更有镜头感、更口语、更利落的网文表达；不要重写整章剧情
2. 保留原有剧情推进、人设与分镜节奏
3. 删除无效空动作与灌水套话，戒掉总结式旁白，减少生硬转折词
4. 用短句、具体描写、有信息量的动作与对话推进，增强沉浸感
5. 直接输出改写后的完整正文，不要任何解释或前后缀`;

/**
 * 依据 AI 痕迹检测结果对章节正文做「去AI味」点对点改写。
 * 任何失败或未改动都安全返回原稿，绝不破坏正文。
 */
export async function humanizeChapter(input: HumanizeInput): Promise<HumanizeResult> {
  const { content, title, chapterNo, styleSample } = input;
  const trimmed = content.trim();
  const report = detectAITraces(trimmed);

  // 无痕迹则无需改写
  if (report.totalCount === 0) {
    return { content: trimmed, changed: false, report };
  }

  const traceText = report.categories
    .map(
      (c) =>
        `- ${c.label} ×${c.count}：${c.examples.join('、')}（建议：${c.hint}）`
    )
    .join('\n');

  const userPrompt = [
    title || chapterNo ? `【第 ${chapterNo ?? '-'} 章 - ${title ?? '本章'}】` : '',
    '',
    '【检测到的 AI 痕迹】',
    traceText,
    '',
    styleSample ? `【文风样本】\n${styleSample}` : '',
    '',
    '【原文（请去AI味改写后输出完整正文）】',
    trimmed,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'text', temperature: 0.7, maxTokens: 4096 }
    );

    const rewritten = result.content?.trim();
    // 结果为空 / 未被改动 → 视为无需处理，返回原稿
    if (!rewritten || rewritten === trimmed) {
      return { content: trimmed, changed: false, report };
    }
    return { content: rewritten, changed: true, report };
  } catch {
    // LLM 不可用等任何异常 → 安全返回原稿
    return { content: trimmed, changed: false, report };
  }
}