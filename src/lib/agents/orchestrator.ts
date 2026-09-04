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
import { assembleMemory, estimateMemoryTokens } from '@/lib/memory/assembler';
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
import { localReaderReview } from '@/lib/review/reader-review';
import type { StylePreset, ConsistencyReport, GenerationStage, Genre } from '@/types';

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
    const { stylePreset, genre } = await loadStylePreset(context.projectId);

    // ===== Stage 2: 剧情设计 =====
    context.onProgress('plot_designing');
    const sceneDesign = await designPlotWithRetry(context, memory);

    // ===== 章节标题（LLM 生成，失败回退「第 N 章」）=====
    const title = await resolveChapterTitle(context, sceneDesign);

    // ===== Stage 3: 文笔创作 =====
    context.onProgress('writing');
    const candidateCount = Math.min(3, Math.max(1, context.candidateCount ?? 1));
    const content =
      candidateCount > 1
        ? await writeChapterCandidates(
            sceneDesign,
            memory,
            context,
            stylePreset,
            title,
            candidateCount,
            genre
          )
        : await writeChapterWithRetry(sceneDesign, memory, context, stylePreset, title, genre);

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

    // ===== 中断保护 =====
    // 用户生成中被中止：writeChapter 会返回已生成的部分正文（而非抛错），若照常往下跑
    // 一致性闭环并落库，会把「残缺稿」以 completed 状态入库。这里检测到中止即提早返回，
    // 跳过 updateMemory 与 saveChapter —— 由调用方决定手动保存或重试。
    if (context.signal?.aborted) {
      const partial = result.content ?? '';
      context.onProgress('failed');
      return {
        content: partial,
        sceneDesign,
        consistencyReport,
        wordCount: (partial.match(/[\u4e00-\u9fff]/g) ?? []).length,
        interrupted: true,
      };
    }

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
): Promise<{ stylePreset: StylePreset | null; genre?: Genre }> {
  const project = await getProject(projectId);
  const stylePresetId = project?.stylePresetId;
  let stylePreset: StylePreset | null = null;
  if (stylePresetId) {
    try {
      stylePreset = (await getStylePreset(stylePresetId)) ?? null;
    } catch {
      stylePreset = null;
    }
  }
  return { stylePreset, genre: project?.genre };
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
  let rewriteInterrupted = false;
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
            skillIds: context.skillIds,
          }),
        { maxRetries: 1, baseDelayMs: 1000 }
      );
      current = revised;
      chapter = await buildChapter(context, sceneDesign, current, title);
      report = await checkConsistencyWithRetry(chapter, memory);
    } catch (err) {
      console.warn(`[Orchestrator] 一致性修正重写 #${attempts} 失败，沿用当前稿:`, err);
      rewriteInterrupted = true;
      break;
    }
  }

  // 修正中断且最终报告仍有 error → 附加提示，避免用户误判"系统未尝试修正"
  if (rewriteInterrupted && hasBlockingIssues(report)) {
    report = {
      ...report,
      issues: [
        ...report.issues,
        {
          type: 'plot',
          severity: 'warning',
          description: '自动修正未完成（重写失败或中断），以上 error 级问题保留原样',
          suggestion: '请人工复核本章，或重新生成本章',
        },
      ],
    };
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
    // 降级：使用空记忆（token 估算沿用统一口径，含剧情要点，而非错误的 0）
    const emptyMemory = {
      worldview: null,
      characters: [],
      outline: null,
      pendingForeshadowings: [],
      stylePreset: null,
    };
    const fallbackMemory: AssembledMemory = {
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
    fallbackMemory.tokenEstimate = estimateMemoryTokens(fallbackMemory);
    return fallbackMemory;
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
  title: string,
  genre?: string
): Promise<string> {
  return withRetry(
    () => writeChapter(sceneDesign, memory, context, stylePreset, title, genre),
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
 * Q3 抽卡模式：并行生成 candidateCount 个候选正文，用确定性读者评分（localReaderReview，
 * 不消耗额外 LLM 配额）自动评选最优，再把最优稿一次性回放到流。
 * 生成期间候选稿不注入 onStream，仅把最终选中稿推送前端。
 */
async function writeChapterCandidates(
  sceneDesign: SceneDesign,
  memory: AssembledMemory,
  context: GenerationContext,
  stylePreset: StylePreset | null,
  title: string,
  candidateCount: number,
  genre?: string
): Promise<string> {
  // 每个候选用独立的 onStream/onProgress 空实现，避免候选 token 串流到 UI
  const silentContext: GenerationContext = {
    ...context,
    onStream: () => {},
    onProgress: () => {},
  };

  const settled = await Promise.allSettled(
    Array.from({ length: candidateCount }, () =>
      writeChapter(sceneDesign, memory, silentContext, stylePreset, title, genre)
    )
  );

  const drafts = settled
    .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
    .map((s) => s.value)
    .filter((c) => c && c.trim().length > 0);
  if (drafts.length === 0) {
    throw new Error('抽卡模式：所有候选均生成失败');
  }

  // 读者评分择优
  const best = pickBestCandidate(drafts);

  // 把选中稿一次性回放给前端（居中评分仅作内部证据，不展示给用户）
  context.onStream(best);
  return best;
}

/**
 * 抽卡择优：用确定性读者评分（localReaderReview，不消耗 LLM）选出得分最高的候选稿。
 * 纯函数，便于单测。
 */
export function pickBestCandidate(drafts: string[]): string {
  let best = drafts[0];
  let bestScore = -1;
  for (const draft of drafts) {
    const score = localReaderReview(draft).score;
    if (score > bestScore) {
      bestScore = score;
      best = draft;
    }
  }
  return best;
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