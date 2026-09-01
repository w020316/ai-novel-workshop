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
import { rewriteForConsistency } from './rewrite';
import { generateChapterTitle } from '@/lib/llm/generators/chapter-title';
import { updateMemoryAfterChapter } from '@/lib/memory/updater';
import { saveChapter, getProject, getStylePreset } from '@/lib/db/queries';
import { withRetry } from '@/lib/llm/retry';
import { generateId } from '@/lib/utils';
import type { StylePreset, ConsistencyReport, GenerationStage } from '@/types';

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

    // 加载文风预设（剧情设计/创作/修正共用一次）
    const stylePreset = await loadStylePreset(context.projectId);

    // ===== Stage 2: 剧情设计 =====
    context.onProgress('plot_designing');
    const sceneDesign = await designPlotWithRetry(context, memory);

    // ===== 章节标题（LLM 生成，失败回退「第 N 章」）=====
    const title = await resolveChapterTitle(context, sceneDesign);

    // ===== Stage 3: 文笔创作 =====
    context.onProgress('writing');
    const content = await writeChapterWithRetry(sceneDesign, memory, context, stylePreset, title);

    // ===== Stage 4: 一致性校验 + 修正闭环 =====
    context.onProgress('consistency_checking');
    const { result, consistencyReport } = await consistencyAndRewriteLoop(
      context,
      sceneDesign,
      content,
      memory,
      stylePreset,
      title
    );

    // ===== Stage 5: 记忆更新 =====
    context.onProgress('memory_updating');
    const chapter = await buildChapter(context, sceneDesign, result.content, title);
    await updateMemoryAfterChapter(context.projectId, chapter);

    // ===== 保存章节 =====
    await saveChapter(chapter);

    context.onProgress('completed');

    return {
      content: result.content,
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
 * 加载项目文风预设（若配置）
 */
async function loadStylePreset(
  projectId: string
): Promise<StylePreset | null> {
  const project = await getProject(projectId);
  const stylePresetId = project?.stylePresetId;
  if (!stylePresetId) return null;
  try {
    return (await getStylePreset(stylePresetId)) ?? null;
  } catch {
    return null;
  }
}

/**
 * 生成章节标题（LLM 优先，失败/无效回退「第 N 章」）
 */
async function resolveChapterTitle(
  context: GenerationContext,
  sceneDesign: SceneDesign
): Promise<string> {
  try {
    const title = await generateChapterTitle({
      chapterNo: context.chapterNo,
      plotPoints: context.plotPoints,
      sceneDesign,
    });
    return title || `第${context.chapterNo}章`;
  } catch {
    return `第${context.chapterNo}章`;
  }
}

/**
 * 一致性校验 + 自动修正闭环
 * 若存在 error 级问题，触发定向重写（最多 2 次），每次重写后重新校验；
 * 重写失败或达到上限则采用当前稿与最新校验报告。
 */
async function consistencyAndRewriteLoop(
  context: GenerationContext,
  sceneDesign: SceneDesign,
  content: string,
  memory: AssembledMemory,
  stylePreset: StylePreset | null,
  title: string
): Promise<{ result: { content: string }; consistencyReport: ConsistencyReport }> {
  let current = content;
  let chapter = await buildChapter(context, sceneDesign, current, title);
  let report = await checkConsistencyWithRetry(chapter, memory);

  const hasBlockingIssues = (r: ConsistencyReport) =>
    !r.passed && r.issues.some((i) => i.severity === 'error');

  let attempts = 0;
  const MAX_REWRITES = 2;
  while (hasBlockingIssues(report) && attempts < MAX_REWRITES) {
    attempts++;
    const stage: GenerationStage = attempts === 1 ? 'rewriting_1' : 'rewriting_2';
    context.onProgress(stage);

    const blockingIssues = report.issues.filter((i) => i.severity === 'error');
    try {
      const revised = await withRetry(
        () =>
          rewriteForConsistency({
            content: current,
            memory,
            sceneDesign,
            chapterNo: context.chapterNo,
            title,
            issues: blockingIssues,
            stylePreset,
          }),
        { maxRetries: 1, baseDelayMs: 1000 }
      );
      current = revised;
      chapter = await buildChapter(context, sceneDesign, current, title);
      report = await checkConsistencyWithRetry(chapter, memory);
    } catch (err) {
      console.warn(`[Orchestrator] 一致性修正重写 #${attempts} 失败，沿用当前稿:`, err);
      break;
    }
  }

  return { result: { content: current }, consistencyReport: report };
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
  context: GenerationContext,
  stylePreset: StylePreset | null,
  title: string
): Promise<string> {
  return withRetry(
    () => writeChapter(sceneDesign, memory, context, stylePreset, title),
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
  content: string,
  title: string
): Promise<Chapter> {
  // 中文计数
  const chineseChars = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;

  return {
    id: generateId('ch'),
    projectId: context.projectId,
    volumeNo: 1, // 默认第一卷
    chapterNo: context.chapterNo,
    title: title || `第${context.chapterNo}章`,
    plotPoints: context.plotPoints,
    sceneDesign,
    content,
    wordCount: chineseChars,
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}