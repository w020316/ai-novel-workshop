// ============================================================================
// 编排器（Orchestrator）
// 依据：spec 4.3 节 / 计划 P5.4
// 职责：
// 1. 编排多 Agent 协作流程
// 2. 重试控制与降级切换
// 3. 返回完整生成结果
// 流程：记忆装配 → 剧情设计 → 文笔创作 → 一致性校验 → 记忆更新
// ============================================================================
import type {
  GenerationContext,
  GenerationResult,
  AssembledMemory,
  SceneDesign,
  Chapter,
} from '@/types';
import { assembleMemory } from '@/lib/memory/assembler';
import { loadLongTermMemory } from '@/lib/memory/long-term';
import { loadMidTermMemory } from '@/lib/memory/mid-term';
import { useShortTermMemory } from '@/lib/store/short-term-memory';
import { designPlot } from './plot-design';
import { writeChapter } from './writing';
import { checkConsistency, quickCheck } from './consistency';
import { updateMemoryAfterChapter } from '@/lib/memory/updater';
import { saveChapter, getProject } from '@/lib/db/queries';
import { withRetry } from '@/lib/llm/retry';
import { generateId } from '@/lib/utils';

/**
 * 生成章节的完整流程
 *
 * @param context - 生成上下文
 * @returns 生成结果
 */
export async function generateChapter(
  context: GenerationContext
): Promise<GenerationResult> {
  try {
    // ===== Stage 1: 记忆装配 =====
    context.onProgress('memory_assembling');
    const memory = await assembleMemoryWithFallback(context);

    // ===== Stage 2: 剧情设计 =====
    context.onProgress('plot_designing');
    const sceneDesign = await designPlotWithRetry(context, memory);

    // ===== Stage 3: 文笔创作 =====
    context.onProgress('writing');
    const content = await writeChapterWithRetry(sceneDesign, memory, context);

    // ===== Stage 4: 一致性校验 =====
    context.onProgress('consistency_checking');
    const chapter = await buildChapter(context, sceneDesign, content);
    const consistencyReport = await checkConsistencyWithRetry(chapter, memory);

    // ===== Stage 5: 记忆更新 =====
    context.onProgress('memory_updating');
    await updateMemoryAfterChapter(context.projectId, chapter);

    // ===== 保存章节 =====
    await saveChapter(chapter);

    context.onProgress('completed');

    return {
      content,
      sceneDesign,
      consistencyReport,
      wordCount: chapter.wordCount,
    };
  } catch (error) {
    context.onProgress('failed');
    throw error;
  }
}

/**
 * 记忆装配（带降级）
 */
async function assembleMemoryWithFallback(
  context: GenerationContext
): Promise<AssembledMemory> {
  try {
    const [longTerm, midTerm] = await Promise.all([
      loadLongTermMemory(context.projectId),
      loadMidTermMemory(
        context.projectId,
        context.chapterNo,
        context.plotPoints.join(' ')
      ),
    ]);

    const shortTermState = useShortTermMemory.getState();
    const shortTerm = {
      prevChapters: shortTermState.prevChapters,
      currentPlotPoints: context.plotPoints,
    };

    return assembleMemory(longTerm, midTerm, shortTerm);
  } catch (err) {
    console.warn('[Orchestrator] 记忆装配失败，尝试降级:', err);
    // 降级：使用空记忆
    const emptyMemory = {
      worldview: null,
      characters: [],
      outline: null,
      pendingForeshadowings: [],
      stylePreset: null,
    };
    return {
      longTerm: emptyMemory,
      midTerm: {
        relevantSummaries: [],
        activePlotThreads: [],
        foreshadowingsToRecover: [],
        characterStates: {},
      },
      shortTerm: {
        prevChapters: [],
        currentPlotPoints: context.plotPoints,
      },
      tokenEstimate: 0,
    };
  }
}

/**
 * 剧情设计（带重试）
 */
async function designPlotWithRetry(
  context: GenerationContext,
  memory: AssembledMemory
): Promise<SceneDesign> {
  return withRetry(
    () => designPlot(context, memory),
    {
      maxRetries: 2,
      baseDelayMs: 1000,
      onRetry: (attempt, error) => {
        console.warn(`[Orchestrator] 剧情设计重试 #${attempt}:`, error);
      },
    }
  );
}

/**
 * 文笔创作（带重试和降级）
 */
async function writeChapterWithRetry(
  sceneDesign: SceneDesign,
  memory: AssembledMemory,
  context: GenerationContext
): Promise<string> {
  const project = await getProject(context.projectId);
  const stylePresetId = project?.stylePresetId;

  let stylePreset = null;
  if (stylePresetId) {
    const { getStylePreset } = await import('@/lib/db/queries');
    stylePreset = await getStylePreset(stylePresetId);
  }

  return withRetry(
    () => writeChapter(sceneDesign, memory, context, stylePreset),
    {
      maxRetries: 1,
      baseDelayMs: 2000,
      onRetry: (attempt, error) => {
        console.warn(`[Orchestrator] 文笔创作重试 #${attempt}:`, error);
      },
    }
  );
}

/**
 * 一致性校验（带重试和降级）
 */
async function checkConsistencyWithRetry(
  chapter: Chapter,
  memory: AssembledMemory
) {
  try {
    return await withRetry(
      () => checkConsistency(chapter, memory),
      {
        maxRetries: 1,
        baseDelayMs: 1000,
      }
    );
  } catch (err) {
    console.warn('[Orchestrator] 一致性校验失败，使用快速校验:', err);
    // 降级：使用快速校验
    const issues = quickCheck(chapter, memory);
    return {
      chapterId: chapter.id,
      passed: issues.length === 0,
      issues,
      checkedAt: Date.now(),
    };
  }
}

/**
 * 构建章节对象
 */
async function buildChapter(
  context: GenerationContext,
  sceneDesign: SceneDesign,
  content: string
): Promise<Chapter> {
  // 中文计数
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;

  return {
    id: generateId('ch'),
    projectId: context.projectId,
    volumeNo: 1, // 默认第一卷
    chapterNo: context.chapterNo,
    title: `第${context.chapterNo}章`,
    plotPoints: context.plotPoints,
    sceneDesign,
    content,
    wordCount: chineseChars,
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}