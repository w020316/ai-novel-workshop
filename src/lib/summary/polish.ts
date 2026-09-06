// ============================================================================
// 简介 AI 润色（需求 6 前半）
// 职责：以网文编辑口吻调用 LLM，把项目简介润色为更抓人的一句话/两句话简介。
// 降级：LLM 失败或返回非法时，本地确定性清理（压缩空白、截断 200 字）兜底。
// 参考：lib/trend/trends.ts 的调用与降级模式。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';
import { isRewritten } from '@/lib/llm/polish-guard';

export interface PolishSummaryInput {
  genre: string;
  title: string;
  summary: string;
}

export interface PolishSummaryResult {
  summary: string;
  /** 是否来自 LLM（false 表示本地降级清理或守卫拦截后保留原文） */
  fromLLM: boolean;
  /** true 表示两次生成均被判定为整体改写，已保留原简介未做修改 */
  keptOriginal?: boolean;
}

const MAX_SUMMARY_LENGTH = 200;

const SYSTEM_PROMPT = `你是一位资深网络小说编辑。请把用户提供的小说简介在原文基础上扩写润色：
- 【最重要】原文是底稿，不是参考：逐句保留原文的用语、语序与句式，原文的每一句话都必须在结果中原样或近似原样出现；严禁整体改写、重新组织叙述、更换措辞、合并拆分句子结构；
- 在原文的句子之间或之后插入扩写内容：补充钩子细节、氛围渲染、悬念递进，让篇幅比原文更长（原文已超 200 字时可精炼到 200 字以内）；
- 只做少量修饰（病句、错别字、标点），不得改变原文的任何设定、事实与叙述顺序；
- 总长度不超过 200 字；
- 严格只输出 JSON：{"summary":"润色后的简介"}，不要输出解释或 markdown。`;

const REWRITE_REWORK_NOTE = `【返工要求·务必遵守】你上一轮的输出是整体改写，几乎丢弃了原文的所有原句，这不符合要求。
请重新生成：以原文为底稿逐句保留，只在原句之间或之后插入扩写内容，原文的用语与语序必须最大程度原样保留。`;

/**
 * 本地确定性清理：压缩多余空白并截断到 200 字（LLM 不可用时的兜底）。
 */
export function cleanupSummary(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH);
}

/**
 * AI 润色项目简介（扩写守卫版）：
 * 1. LLM 结果先过改写侦测守卫——保留覆盖率过低（整体改写）则带返工要求重试一次；
 * 2. 返工结果仍被判定改写 → 放弃 AI 结果，保留原简介（keptOriginal=true）；
 * 3. LLM 失败或返回非法时，降级为本地确定性清理。
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

  const baseUserPrompt = `【题材】${input.genre || '未指定'}
【书名】${input.title || '（未命名）'}
【原简介（底稿，必须最大程度保留）】${original}

请按系统提示要求在上述底稿基础上扩写润色，严格输出 JSON。`;

  /** 调一次 LLM 并解析；reworkNote 非空时追加返工要求 */
  const requestOnce = async (reworkNote = ''): Promise<string | null> => {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [baseUserPrompt, reworkNote].filter(Boolean).join('\n\n') },
      ],
      { responseFormat: 'json', temperature: reworkNote ? 0.4 : 0.6, maxTokens: 400 }
    );
    const parsed = safeParseJSON<{ summary?: string }>(result.content ?? '', {});
    const polished = parsed?.summary?.trim();
    return polished ? polished.slice(0, MAX_SUMMARY_LENGTH) : null;
  };

  try {
    const first = await requestOnce();
    if (first && !isRewritten(original, first)) {
      return { summary: first, fromLLM: true };
    }
    // 首轮被判定整体改写（或无效）→ 带返工要求重试一次
    const second = await requestOnce(first ? REWRITE_REWORK_NOTE : '');
    if (second && !isRewritten(original, second)) {
      return { summary: second, fromLLM: true };
    }
    // 两次均整体改写 → 宁可不润色，保留原简介
    if (first || second) {
      return { summary: original, fromLLM: false, keptOriginal: true };
    }
    // 两次均未返回有效内容 → 本地清理兜底
    return { summary: cleanupSummary(original), fromLLM: false };
  } catch {
    // LLM 失败或非法返回：本地确定性清理兜底
    return { summary: cleanupSummary(original), fromLLM: false };
  }
}
