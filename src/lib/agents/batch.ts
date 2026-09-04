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
  /** 中止信号（贯通到各章上游请求） */
  signal?: AbortSignal;
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
    signal,
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
      signal,
    };

    const result = await single(context);
    results.push(result);
    chapterPLots.push({ chapterNo, index, plotPoints });
  }

  return { results, chapterPLots, aborted: false };
}

/**
 * 计算断点续写时"还需续写的章数"。
 * @param originalTotal 原请求总章数
 * @param originalStart 原起始章号（如 1）
 * @param currentChapterCount 当前已生成的章节数（含之前完成的本批章节）
 * @returns 仍需要生成的章节数（>=0）；已全部生成为 0
 */
export function computeResumeCount(
  originalTotal: number,
  originalStart: number,
  currentChapterCount: number
): number {
  if (originalTotal <= 0) return 0;
  const made = Math.max(0, currentChapterCount - originalStart + 1);
  return Math.max(0, originalTotal - made);
}

/**
 * 计算"已完成本批的章数（用于进度展示，最多到 total）"。
 */
export function computeDoneCount(
  originalTotal: number,
  originalStart: number,
  currentChapterCount: number
): number {
  if (originalTotal <= 0) return 0;
  const made = Math.max(0, currentChapterCount - originalStart + 1);
  return Math.min(originalTotal, made);
}
