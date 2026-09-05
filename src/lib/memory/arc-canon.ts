// ============================================================================
// 剧情纲要（ArcCanon）编排：增量更新 + 全量重建
// 依据：开源补研 v2 P1-2
// 职责：
// 1. 章节保存后按间隔（每 10 章）触发增量压缩（LLM 优先，确定性拼接降级）
// 2. 手动全量重建（记忆页「重新生成」按钮）
// 纯编排层：不直接调 LLM，压缩逻辑在 generators/arc-canon.ts（可测）
// ============================================================================
import type { ArcCanon, Chapter, ChapterSummary } from '@/types';
import { getArcCanon, saveArcCanon, listChapterSummaries } from '@/lib/db/queries';
import {
  shouldUpdateCanon,
  deterministicCanonText,
  compressCanonViaLLM,
} from '@/lib/llm/generators/arc-canon';

/**
 * 章节保存后按需增量更新剧情纲要。
 * 未达间隔或失败时静默返回（绝不阻塞记忆更新主流程）。
 *
 * @returns 更新后的 ArcCanon（未触发/失败时返回旧纲要或 null）
 */
export async function maybeUpdateArcCanon(
  projectId: string,
  chapter: Chapter
): Promise<ArcCanon | null> {
  try {
    const existing = (await getArcCanon(projectId)) ?? null;
    if (!shouldUpdateCanon(existing, chapter.chapterNo)) return existing;

    const summaries = await listChapterSummaries(projectId);
    const canon = await buildCanon(projectId, existing, summaries, chapter.chapterNo);
    await saveArcCanon(canon);
    return canon;
  } catch (err) {
    console.warn('[ArcCanon] 增量更新失败（不影响章节保存）:', err);
    return null;
  }
}

/**
 * 全量重建：以全部章节摘要为输入重新压缩纲要（供记忆页手动触发）。
 * 没有任何摘要时返回 null（无可归纳内容）。
 */
export async function regenerateArcCanon(projectId: string): Promise<ArcCanon | null> {
  const summaries = await listChapterSummaries(projectId);
  if (summaries.length === 0) return null;

  const existing = (await getArcCanon(projectId)) ?? null;
  const upTo = Math.max(...summaries.map((s) => s.chapterNo));
  const canon = await buildCanon(projectId, existing, summaries, upTo);
  await saveArcCanon(canon);
  return canon;
}

/**
 * 组装纲要：LLM 压缩优先，失败/空产出回落确定性拼接。
 */
async function buildCanon(
  projectId: string,
  existing: ArcCanon | null,
  allSummaries: ChapterSummary[],
  upTo: number
): Promise<ArcCanon> {
  const covered = existing?.upToDateChapterNo ?? 0;
  const newSummaries = allSummaries
    .filter((s) => s.chapterNo > covered && s.chapterNo <= upTo)
    .map((s) => ({ chapterNo: s.chapterNo, summary: s.summary }));

  const llmText = await compressCanonViaLLM(existing?.canonText ?? '', newSummaries);
  const canonText =
    llmText ?? deterministicCanonText(existing?.canonText ?? '', newSummaries);

  return {
    id: existing?.id ?? `canon_${projectId}`,
    projectId,
    canonText,
    upToDateChapterNo: upTo,
    fromLLM: llmText != null,
    updatedAt: Date.now(),
  };
}
