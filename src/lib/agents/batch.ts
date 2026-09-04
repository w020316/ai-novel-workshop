// ============================================================================
// 大纲驱动批量续写（Batch Generation）
// 依据：交付报告 §5.7 #3 —— 大纲驱动批量续写 / 一键连写多章，摆脱逐章点击。
// 设计：
//   - 对起始章节起的连续 N 章，依序调用「single」生成器（默认为编排器 generateChapter）
//   - 每章使用传入的分章剧情要点（或留白由剧情设计 Agent 自动拟定），保留记忆续写连续性
//   - 通过 onProgress 上报「第 X 章 / 总 N 章 · 当前阶段」；支持 AbortSignal 中止
//   - single 支持依赖注入，便于单元测试（不改动编排器主路径）
//   - 提供 computeResumeCount / computeDoneCount 供「断点续写」规划剩余章数。
// ============================================================================
import { generateChapter } from './orchestrator';
import type { GenerationContext, GenerationResult, GenerationStage } from '@/types';

/** 批量进度：逐章队列快照的一章状态（供 UI 队列可视化渲染） */
export interface QueueChapterState {
  chapterNo: number;
  status: 'pending' | 'running' | 'done' | 'failed';
  /** 进行中章当前阶段（仅 status=running 有意义） */
  stage: GenerationStage | null;
}

export interface BatchQueueSnapshot {
  /** 每章状态，长度 = count，序号 0..count-1 对应 startChapterNo.. */
  chapters: QueueChapterState[];
  doneCount: number;
  runningIndex: number | null;
  /** 是否全部完成 */
  allDone: boolean;
}

/**
 * 由批量进度（当前章序号）推导逐章队列状态。
 * 纯函数、确定性，便于单测；UI 据此渲染格子网格：
 *   - runningIndex=null → 全部 pending（未开始）
 *   - 序号 < runningIndex → done；== runningIndex → running；> → pending
 *   - 序号 ∈ failedIndexes → failed（红格，重试失败后展示）
 * @param startChapterNo 本批次起始章号
 * @param count 本批章数
 * @param runningIndex 进行中的章序号（0-based，null=未开始）
 * @param stage 进行中章当前阶段
 * @param failedIndexes 重试耗尽仍失败的章序号（0-based，相对本批）
 */
export function computeBatchQueue(
  startChapterNo: number,
  count: number,
  runningIndex: number | null,
  stage?: GenerationStage | null,
  failedIndexes: number[] = []
): BatchQueueSnapshot {
  const failedSet = new Set(failedIndexes);
  const chapters: QueueChapterState[] = [];
  let doneCount = 0;
  for (let i = 0; i < count; i++) {
    let status: QueueChapterState['status'];
    let s: GenerationStage | null = null;
    if (failedSet.has(i)) {
      status = 'failed';
    } else if (runningIndex === null || i > runningIndex) {
      status = 'pending';
    } else if (i === runningIndex) {
      status = 'running';
      s = stage ?? null;
    } else {
      status = 'done';
      doneCount++;
    }
    chapters.push({ chapterNo: startChapterNo + i, status, stage: s });
  }
  return {
    chapters,
    doneCount,
    runningIndex,
    allDone: runningIndex !== null && runningIndex >= count - 1,
  };
}

/** 单章重试耗尽仍失败：携带章号与尝试次数，供调用方精确定位并持久化失败现场 */
export class BatchChapterError extends Error {
  readonly chapterNo: number;
  /** 实际尝试次数（首跑 + 重试） */
  readonly attempts: number;
  constructor(chapterNo: number, attempts: number, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`第 ${chapterNo} 章 ${attempts} 次尝试均失败：${msg}`);
    this.name = 'BatchChapterError';
    this.chapterNo = chapterNo;
    this.attempts = attempts;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 批量续写的分章剧情要点：给第 indexT 章（0 起）提供的要点数组 */
export interface BatchPlanItem {
  chapterNo: number;
  plotPoints: string[];
}

export interface GenerateBatchOptions {
  projectId: string;
  /** 起始章节号 */
  startChapterNo: number;
  /** 连写章数 */
  count: number;
  /** 每章的剧情要点模板；缺省则各章给空（由剧情设计自动拟定） */
  plotPointsPerChapter?: (chapterNo: number) => string[] | Promise<string[]>;
  /** 本轮批量续写选用的技能 ID（贯通到各章；为空沿用全部启用技能） */
  skillIds?: string[];
  /** 中止信号（贯通到各章上游请求） */
  signal?: AbortSignal;
  /** 单章生成失败时的最大重试次数（默认 2，指数退避；AbortError 不重试直接中止） */
  maxRetriesPerChapter?: number;
  /** 首次重试等待毫秒数（默认 1500，逐次翻倍；测试可注入 0 加速） */
  retryDelayMs?: number;
  /** 进度上报：章节号 / 总章 / 阶段 */
  onProgress?: (info: {
    chapterNo: number;
    total: number;
    stage: GenerationStage;
    index: number;
  }) => void;
  /** 生成器注入（默认编排器；测试可 mock） */
  single?: (ctx: GenerationContext) => Promise<GenerationResult>;
}

export interface GenerateBatchResult {
  /** 已成功生成的各章结果 */
  results: GenerationResult[];
  /** 各章剧情要点（报 0 起 index，便于 UI 对照） */
  chapterPLots: { chapterNo: number; index: number; plotPoints: string[] }[];
  /** 中途被中止时返回 true */
  aborted: boolean;
}

/**
 * 批量续写主入口：依次生成 startChapterNo .. startChapterNo+count-1 各章。
 * 任一章抛错即中断并原样上抛（由调用方 toast），已完成章保留落库。
 * signal 触发后停止后续章节。
 */
export async function generateChaptersBatch(
  options: GenerateBatchOptions
): Promise<GenerateBatchResult> {
  const {
    projectId,
    startChapterNo,
    count,
    plotPointsPerChapter,
    skillIds,
    signal,
    maxRetriesPerChapter = 2,
    retryDelayMs = 1500,
    onProgress,
    single = generateChapter,
  } = options;

  const results: GenerateBatchResult['results'] = [];
  const chapterPLots: GenerateBatchResult['chapterPLots'] = [];

  for (let index = 0; index < count; index++) {
    if (signal?.aborted) {
      return { results, chapterPLots, aborted: true };
    }
    const chapterNo = startChapterNo + index;
    const plotPoints = (await plotPointsPerChapter?.(chapterNo)) ?? [];

    const context: GenerationContext = {
      projectId,
      chapterNo,
      plotPoints,
      // 批量模式回放流式内容合并到 results（前端逐章展示用）
      onStream: () => {},
      onProgress: (stage) => onProgress?.({ chapterNo, total: count, stage, index }),
      candidateCount: 1,
      skillIds,
      signal,
    };

    let result: GenerationResult | undefined;
    // 单章重试：网络抖动 / LLM 瞬时 429、5xx 常见，指数退避重试；
    // 重试耗尽仍失败才抛 BatchChapterError（由调用方暂停任务并持久化失败章号）
    const maxAttempts = Math.max(1, maxRetriesPerChapter + 1);
    let lastErr: unknown;
    let attempt = 0;
    for (; attempt < maxAttempts; attempt++) {
      try {
        result = await single(context);
        break;
      } catch (err) {
        // 中断落在中间阶段（剧情设计/记忆装配等）时底层 fetch 会以 AbortError 冒泡：
        // 统一转为 aborted 语义，与「写章阶段中断」一致走暂停续写路径，而非误报失败（不重试）
        if ((err instanceof Error && err.name === 'AbortError') || signal?.aborted) {
          return { results, chapterPLots, aborted: true };
        }
        lastErr = err;
        if (attempt < maxAttempts - 1) {
          await sleep(retryDelayMs * 2 ** attempt);
          if (signal?.aborted) {
            return { results, chapterPLots, aborted: true };
          }
        }
      }
    }
    if (!result) {
      // 循环耗尽仍未成功：抛章级错误（携带章号），调用方据此标记失败章并停止整批
      // —— 不跳章续写：后续章依赖前章记忆，跳过会产生记忆断层
      throw new BatchChapterError(chapterNo, maxAttempts, lastErr);
    }
    // 本章生成被中断：残缺稿不进入结果（未落成 completed），stop 并标记 aborted，
    // 供「断点续写」从该章重新生成。
    if (result.interrupted) {
      return { results, chapterPLots, aborted: true };
    }
    results.push(result);
    chapterPLots.push({ chapterNo, index, plotPoints });
  }

  return { results, chapterPLots, aborted: false };
}

/**
 * 计算断点续写时"还需续写的章数"。
 * @param originalTotal 原请求总章数
 * @param originalStart 原起始章号（如 1）
 * @param currentLatestChapterNo 当前项目最新章号（max(chapterNo)）。
 *        注意：不要传 chapters.length——章节被删除/章号有空洞时二者不等，
 *        用数量反推会重复生成已有章号并把人工修改的章覆盖掉。
 * @returns 仍需要生成的章节数（>=0）；已全部生成为 0
 */
export function computeResumeCount(
  originalTotal: number,
  originalStart: number,
  currentLatestChapterNo: number
): number {
  if (originalTotal <= 0) return 0;
  const made = Math.max(0, currentLatestChapterNo - originalStart + 1);
  return Math.max(0, originalTotal - made);
}

/**
 * 计算"已完成本批的章数（用于进度展示，最多到 total）"。
 * @param currentLatestChapterNo 当前项目最新章号（max(chapterNo)），同上勿传数量
 */
export function computeDoneCount(
  originalTotal: number,
  originalStart: number,
  currentLatestChapterNo: number
): number {
  if (originalTotal <= 0) return 0;
  const made = Math.max(0, currentLatestChapterNo - originalStart + 1);
  return Math.min(originalTotal, made);
}
