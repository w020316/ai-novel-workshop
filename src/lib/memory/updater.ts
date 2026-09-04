// ============================================================================
// 记忆更新器
// 依据：spec 5.5 节 / 计划 P4.6
// 职责：章节完成后更新三级记忆库
// 1. 生成章节摘要并计算 Embedding
// 2. 更新伏笔状态（铺设/回收）
// 3. 更新支线（关联章节）
// 4. 设定修改同步（标记需重校验）
// ============================================================================
import type { Chapter, ChapterSummary, Foreshadowing } from '@/types';
import {
  saveChapterSummary,
  saveForeshadowing,
  markForeshadowingRecovered,
  markChapterNeedsRecheck,
  listForeshadowings,
  listPlotThreads,
  savePlotThread,
} from '@/lib/db/queries';
import { getDefaultEmbedder } from './embedding';
import { truncateAtSentence } from '@/lib/utils';

/** 章节摘要最大字符数（防止 AI 生成的超长摘要耗尽后续 token 预算） */
const SUMMARY_MAX_CHARS = 300;

/**
 * 章节完成后更新记忆库
 * 自动执行：摘要生成、Embedding 计算、伏笔状态更新、支线更新
 *
 * @param projectId - 项目 ID
 * @param chapter - 刚完成的章节
 * @param summaryText - 人工或 AI 生成的章节摘要（可选，默认截取前 200 字）
 * @returns 更新后的 ChapterSummary
 */
export async function updateMemoryAfterChapter(
  projectId: string,
  chapter: Chapter,
  summaryText?: string
): Promise<ChapterSummary> {
  // 1. 生成章节摘要
  const summary = await generateChapterSummary(projectId, chapter, summaryText);

  // 2. 更新伏笔状态
  await updateForeshadowings(projectId, chapter);

  // 3. 更新支线关联
  await updatePlotThreads(projectId, chapter);

  return summary;
}

/**
 * 生成章节摘要并计算 Embedding
 * 如果提供了 summaryText 则使用，否则自动从章节正文截取前 200 字
 */
export async function generateChapterSummary(
  projectId: string,
  chapter: Chapter,
  summaryText?: string
): Promise<ChapterSummary> {
  const rawSummary = summaryText ?? chapter.content.slice(0, SUMMARY_MAX_CHARS);
  // 压缩：超出上限时在句子边界截断，避免超长摘要侵占后续记忆预算
  const summary = truncateAtSentence(rawSummary, SUMMARY_MAX_CHARS);

  // 尝试计算 Embedding
  let embedding: Float32Array;
  try {
    const embedder = getDefaultEmbedder();
    embedding = await embedder.embed(summary);
  } catch {
    // Embedding 计算失败时使用空向量
    embedding = new Float32Array(384);
  }

  const chapterSummary: ChapterSummary = {
    id: `summary_${chapter.id}`,
    projectId,
    chapterId: chapter.id,
    chapterNo: chapter.chapterNo,
    volumeNo: chapter.volumeNo,
    summary,
    keyEvents: chapter.plotPoints,
    characterStates: extractCharacterStatesFromChapter(chapter),
    embedding,
    createdAt: Date.now(),
  };

  await saveChapterSummary(chapterSummary);
  return chapterSummary;
}

/**
 * 从章节中提取人物状态快照
 * 简化版：根据人物 ID 列表和章节内容推断状态。
 * 已知局限：无人物级 NER，关键词命中的状态会标注给全部出场人物；
 * 同一角色多状态按要点顺序合并（顿号连接），不再后者覆盖前者。
 */
function extractCharacterStatesFromChapter(
  chapter: Chapter
): Record<string, string> {
  const states: Record<string, string> = {};

  if (chapter.sceneDesign?.characterAppearances) {
    for (const charId of chapter.sceneDesign.characterAppearances) {
      states[charId] = '出场';
    }
  }

  // 从剧情要点中提取关键状态（按要点顺序演进，合并而非覆盖）
  const stateKeywords: Record<string, string> = {
    '受伤': '重伤',
    '突破': '突破',
    '昏迷': '昏迷',
    '觉醒': '觉醒',
    '死亡': '死亡',
    '失踪': '失踪',
    '被俘': '被俘',
    '获救': '获救',
  };

  const appearances = chapter.sceneDesign?.characterAppearances ?? [];
  for (const point of chapter.plotPoints) {
    for (const [keyword, state] of Object.entries(stateKeywords)) {
      if (point.includes(keyword)) {
        for (const charId of appearances) {
          const prev = states[charId] ?? '';
          if (!prev.split('、').includes(state)) {
            states[charId] = prev ? `${prev}、${state}` : state;
          }
        }
      }
    }
  }

  return states;
}

/**
 * 更新伏笔状态
 * 1. 将本章铺设的伏笔标记为 'planted'（已铺设）
 * 2. 将本章回收的伏笔标记为 'recovered'（已回收）
 */
export async function updateForeshadowings(
  projectId: string,
  chapter: Chapter
): Promise<void> {
  if (!chapter.sceneDesign) return;

  const allForeshadowings = await listForeshadowings(projectId);
  const foreshadowingMap = new Map(
    allForeshadowings.map((f) => [f.id, f])
  );

  // 1. 铺设伏笔：标记为 planted
  for (const fId of chapter.sceneDesign.foreshadowingToPlant) {
    const f = foreshadowingMap.get(fId);
    if (f && f.status === 'pending') {
      await saveForeshadowing({
        ...f,
        status: 'planted',
        setupChapter: chapter.chapterNo,
      });
    }
  }

  // 2. 回收伏笔：标记为 recovered
  for (const fId of chapter.sceneDesign.foreshadowingToRecover) {
    const f = foreshadowingMap.get(fId);
    if (f && (f.status === 'planted' || f.status === 'pending')) {
      await markForeshadowingRecovered(fId, chapter.chapterNo);
    }
  }
}

/**
 * 更新支线关联：将当前章节关联到其所属的支线剧情。
 * 性能：thread 关键词预构建为 Set（O(1) 命中判断），替代此前
 * 「要点关键词 × 数组 includes」的 O(P×K×M) 嵌套扫描——
 * 百万字规模下 plotPoints×keywords 可达数万次比较，Set 化后线性。
 */
export async function updatePlotThreads(
  projectId: string,
  chapter: Chapter
): Promise<void> {
  const threads = await listPlotThreads(projectId);

  // 本章全部要点关键词合并为一个 Set（一次提取，避免逐 thread 重复计算）
  const pointKeywords = new Set<string>();
  for (const point of chapter.plotPoints) {
    for (const kw of extractKeywords(point)) {
      pointKeywords.add(kw);
    }
  }

  for (const thread of threads) {
    // 检查章节剧情要点与支线描述是否有共同关键词（取前 2-4 字滑窗双向匹配）
    const threadKeywords = extractKeywords(thread.description);
    const isRelated = threadKeywords.some((kw) => pointKeywords.has(kw));

    if (isRelated && !thread.relatedChapters.includes(chapter.chapterNo)) {
      await savePlotThread({
        ...thread,
        relatedChapters: [...thread.relatedChapters, chapter.chapterNo],
        updatedAt: Date.now(),
      });
    }
  }
}

/**
 * 提取文本中的关键词（用于支线匹配）
 * 提取 2-4 字的中文关键词
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const chars = text.match(/[\u4e00-\u9fff]/g) ?? [];

  // 提取 2 字词
  for (let i = 0; i < chars.length - 1; i++) {
    keywords.push(chars[i] + chars[i + 1]);
  }
  // 提取 3 字词
  for (let i = 0; i < chars.length - 2; i++) {
    keywords.push(chars[i] + chars[i + 1] + chars[i + 2]);
  }
  // 提取 4 字词
  for (let i = 0; i < chars.length - 3; i++) {
    keywords.push(chars[i] + chars[i + 1] + chars[i + 2] + chars[i + 3]);
  }

  return [...new Set(keywords)]; // 去重
}

/**
 * 设定修改后的同步操作
 * 标记所有已完成章节为 needsRecheck，同时更新长期记忆
 *
 * @param projectId - 项目 ID
 * @returns 被标记的章节数量
 */
export async function syncSettingsChanged(projectId: string): Promise<number> {
  return markChapterNeedsRecheck(projectId);
}

/**
 * 批量更新伏笔
 * 用于手动调整伏笔状态
 */
export async function batchUpdateForeshadowings(
  updates: Array<{
    id: string;
    status: Foreshadowing['status'];
    actualRecoveryChapter?: number;
  }>
): Promise<void> {
  for (const update of updates) {
    if (update.status === 'recovered' && update.actualRecoveryChapter !== undefined) {
      await markForeshadowingRecovered(update.id, update.actualRecoveryChapter);
    } else {
      await dbPatchForeshadowing(update.id, { status: update.status });
    }
  }
}

/**
 * 内部辅助：局部更新伏笔字段
 */
import { db } from '@/lib/db/schema';

async function dbPatchForeshadowing(
  id: string,
  patch: Partial<Foreshadowing>
): Promise<void> {
  await db.foreshadowings.update(id, patch);
}