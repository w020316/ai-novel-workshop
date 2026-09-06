// ============================================================================
// 简介 AI 润色（需求 6 前半）
// 职责：以网文编辑口吻调用 LLM，把项目简介润色为更抓人的一句话/两句话简介。
// 降级：LLM 失败或返回非法时，本地确定性清理（压缩空白、截断 200 字）兜底。
// 参考：lib/trend/trends.ts 的调用与降级模式。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';

export interface PolishSummaryInput {
  genre: string;
  title: string;
  summary: string;
}

export interface PolishSummaryResult {
  summary: string;
  /** 是否来自 LLM（false 表示本地降级清理） */
  fromLLM: boolean;
}

const MAX_SUMMARY_LENGTH = 200;

const SYSTEM_PROMPT = `你是一位资深网络小说编辑，擅长把平淡的简介改写得抓人眼球。
请把用户提供的小说简介润色为一句或两句话的高转化简介：
- 突出金手指/核心冲突/悬念钩子，让读者第一眼就想点开；
- 保持原意，不编造原文没有的全新设定；
- 简洁有力，总长度不超过 200 字；
- 严格只输出 JSON：{"summary":"润色后的简介"}，不要输出解释或 markdown。`;

/**
 * 本地确定性清理：压缩多余空白并截断到 200 字（LLM 不可用时的兜底）。
 */
export function cleanupSummary(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH);
}

/**
 * AI 润色项目简介：LLM 失败或非法返回时降级为本地确定性清理。
 * 简介小于 4 字时视为无需润色，直接原样返回且不调用 LLM。
 */
export async function polishSummary(
  input: PolishSummaryInput
): Promise<PolishSummaryResult> {
  const original = input.summary ?? '';

  // 过短简介不调 LLM，直接返回原样
  if (original.trim().length < 4) {
    return { summary: original, fromLLM: false };
  }

  try {
    const userPrompt = `【题材】${input.genre || '未指定'}
【书名】${input.title || '（未命名）'}
【原简介】${original}

请按系统提示要求润色该简介，严格输出 JSON。`;

    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.6, maxTokens: 400 }
    );

    const parsed = safeParseJSON<{ summary?: string }>(result.content ?? '', {});
    const polished = parsed?.summary?.trim();
    if (!polished) {
      throw new Error('LLM 未返回有效简介');
    }
    return { summary: polished.slice(0, MAX_SUMMARY_LENGTH), fromLLM: true };
  } catch {
    // LLM 失败或非法返回：本地确定性清理兜底
    return { summary: cleanupSummary(original), fromLLM: false };
  }
}
