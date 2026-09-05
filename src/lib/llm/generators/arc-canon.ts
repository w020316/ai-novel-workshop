// ============================================================================
// 剧情纲要（ArcCanon）压缩器
// 依据：开源补研 v2 P1-2（对标「随写随更的全书真值锚点」）——
//       每 N 章把「旧纲要 + 新章摘要」增量压缩为更新版纲要，
//       生成时注入 prompt，防止百万字中段剧情跑偏 / 前后矛盾。
// 降级：LLM 不可用或产出不合规时回落确定性拼接（摘要串联 + 超长裁剪），
//       保证纲要始终可用且可测。
// ============================================================================
import { chat } from '@/lib/llm/client';

/** 纲要更新间隔：每积累 10 章摘要压缩一次 */
export const CANON_UPDATE_INTERVAL = 10;

/** 纲要文本上限（字符）：防止纲要无限膨胀侵占生成 token 预算 */
export const CANON_MAX_CHARS = 1500;

/** 单条摘要进纲要去前的最大长度 */
const SUMMARY_SLICE = 120;

export interface CanonSummaryInput {
  chapterNo: number;
  summary: string;
}

/**
 * 是否触发纲要更新（纯函数，确定性可测）
 * 无纲要时从第 CANON_UPDATE_INTERVAL 章起建立；有纲要时按覆盖差值判断。
 */
export function shouldUpdateCanon(
  canon: { upToDateChapterNo: number } | null | undefined,
  chapterNo: number
): boolean {
  const covered = canon?.upToDateChapterNo ?? 0;
  return chapterNo - covered >= CANON_UPDATE_INTERVAL;
}

/**
 * 确定性降级：旧纲要 + 新摘要按章号顺序拼接，超长时裁掉最旧的摘要行
 * （保留纲要开头的主线锚定句）。纯函数，结果确定。
 */
export function deterministicCanonText(
  oldCanonText: string,
  newSummaries: CanonSummaryInput[]
): string {
  // 旧纲要去掉降级标记行后作为头部（保留主线锚定）
  const head = oldCanonText
    .split('\n')
    .filter((line) => !line.startsWith('[覆盖至'))
    .join('\n')
    .trim();

  const lines: string[] = [];
  if (head) lines.push(head);

  const sorted = [...newSummaries].sort((a, b) => a.chapterNo - b.chapterNo);
  for (const s of sorted) {
    const text = (s.summary || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_SLICE);
    if (text) lines.push(`第${s.chapterNo}章：${text}`);
  }

  // 超长裁剪：从头保住主线锚定，从最旧的摘要行开始丢弃
  let text = lines.join('\n');
  while (text.length > CANON_MAX_CHARS) {
    const dropIdx = lines.findIndex((l) => l.startsWith('第') && l.includes('：'));
    if (dropIdx === -1) break;
    lines.splice(dropIdx, 1);
    text = lines.join('\n');
  }
  return text.slice(0, CANON_MAX_CHARS);
}

const SYSTEM_PROMPT = `你是长篇小说的剧情纲要维护者。你会收到「旧剧情纲要」和一批新章节摘要，请把二者融合为一份更新后的全书剧情纲要，严格只输出纯文本（不要 JSON/markdown/解释），要求：
1. 按时间顺序概括已发生的主线进展、人物关系变化、未解决的悬念与伏笔；
2. 保留旧纲要中仍然成立的关键设定（人物状态、重要承诺、世界规则）；
3. 删除已被推翻或完成的内容，合并重复信息；
4. 总长控制在 800 字内，用短句/条目式书写，供后续章节生成时当作全书真值锚点。`;

/**
 * LLM 压缩：旧纲要 + 新摘要 → 更新版纲要文本。
 * 失败或产出为空时返回 null（由调用方回落确定性拼接）。
 */
export async function compressCanonViaLLM(
  oldCanonText: string,
  newSummaries: CanonSummaryInput[]
): Promise<string | null> {
  if (newSummaries.length === 0) return null;

  const sorted = [...newSummaries].sort((a, b) => a.chapterNo - b.chapterNo);
  const summaryBlock = sorted
    .map((s) => `第${s.chapterNo}章：${(s.summary || '').slice(0, SUMMARY_SLICE)}`)
    .join('\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `【旧剧情纲要】\n${oldCanonText || '（暂无，这是首次建立纲要）'}\n\n【新章节摘要】\n${summaryBlock}\n\n请输出更新后的全书剧情纲要（纯文本）。`,
        },
      ],
      { temperature: 0.3, maxTokens: 900 }
    );
    const text = (result.content ?? '').trim();
    if (!text) return null;
    return text.slice(0, CANON_MAX_CHARS);
  } catch {
    return null;
  }
}
