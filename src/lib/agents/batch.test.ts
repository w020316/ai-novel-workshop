// ============================================================================
// 批量续写 单元测试（注入 mock single，不消耗真实 LLM）
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { generateChaptersBatch, computeResumeCount, computeDoneCount, computeBatchQueue } from './batch';
import type { GenerationResult } from '@/types';

function mockSingle() {
  return vi.fn(async (ctx: { chapterNo: number; plotPoints: string[] }) => {
    const result: GenerationResult = {
      content: `第${ctx.chapterNo}章正文`,
      sceneDesign: {
        setting: `场景${ctx.chapterNo}`,
        conflict: '冲突',
        highlight: '爽点',
        foreshadowingToPlant: [],
        foreshadowingToRecover: [],
        characterAppearances: [],
      },
      consistencyReport: { chapterId: `ch-${ctx.chapterNo}`, passed: true, issues: [], checkedAt: Date.now() },
      wordCount: 100,
    };
    return result;
  });
}

describe('generateChaptersBatch（依赖注入）', () => {
  it('依序生成 startChapterNo 起 count 章', async () => {
    const single = mockSingle();
    const res = await generateChaptersBatch({
      projectId: 'p1',
      startChapterNo: 5,
      count: 3,
      single: single as never,
    });

    expect(res.aborted).toBe(false);
    expect(res.results).toHaveLength(3);
    expect(res.chapterPLots.map((c) => c.chapterNo)).toEqual([5, 6, 7]);
    // 传参校验：章号连续
    expect(single).toHaveBeenCalledTimes(3);
    expect(single.mock.calls[0][0].chapterNo).toBe(5);
    expect(single.mock.calls[2][0].chapterNo).toBe(7);
  });

  it('plotPointsPerChapter 为每章提供剧情要点并透传', async () => {
    const single = mockSingle();
    await generateChaptersBatch({
      projectId: 'p1',
      startChapterNo: 1,
      count: 2,
      plotPointsPerChapter: (n) => [`第${n}章要点`],
      single: single as never,
    });
    expect(single.mock.calls[0][0].plotPoints).toEqual(['第1章要点']);
    expect(single.mock.calls[1][0].plotPoints).toEqual(['第2章要点']);
  });

  it('onProgress 逐章上报章号/总章/阶段', async () => {
    const stages: { chapterNo: number; total: number; stage: string; index: number }[] = [];
    // 模拟编排器内部会回调 onProgress（memory_assembling / 完成）
    const single = vi.fn(async (ctx: {
      chapterNo: number;
      onProgress: (s: string) => void;
    }) => {
      ctx.onProgress('memory_assembling');
      ctx.onProgress('completed');
      const r: GenerationResult = {
        content: `x${ctx.chapterNo}`,
        sceneDesign: { setting: 's', conflict: '', highlight: '', foreshadowingToPlant: [], foreshadowingToRecover: [], characterAppearances: [] },
        consistencyReport: { chapterId: `c${ctx.chapterNo}`, passed: true, issues: [], checkedAt: 0 },
        wordCount: 1,
      };
      return r;
    });
    await generateChaptersBatch({
      projectId: 'p1',
      startChapterNo: 2,
      count: 2,
      single: single as never,
      onProgress: (info) => stages.push({ ...info, stage: info.stage }),
    });
    // 每章触发一次 memory_assembling 与 completed
    expect(stages.some((s) => s.chapterNo === 2 && s.total === 2 && s.index === 0 && s.stage === 'memory_assembling')).toBe(true);
    expect(stages.some((s) => s.chapterNo === 3 && s.total === 2 && s.index === 1 && s.stage === 'completed')).toBe(true);
  });

  it('signal 中止后停止后续生成并标记 aborted', async () => {
    const controller = new AbortController();
    const single = vi.fn(async () => {
      // 模拟前 2 章正常，第 3 章前触发中止
      controller.abort();
      const r: GenerationResult = {
        content: 'x',
        sceneDesign: { setting: 's', conflict: '', highlight: '', foreshadowingToPlant: [], foreshadowingToRecover: [], characterAppearances: [] },
        consistencyReport: { chapterId: 'c', passed: true, issues: [], checkedAt: 0 },
        wordCount: 1,
      };
      return r;
    });
    await generateChaptersBatch({
      projectId: 'p1',
      startChapterNo: 1,
      count: 5,
      signal: controller.signal,
      single: single as never,
      plotPointsPerChapter: async (n) => {
        if (n === 4) controller.abort();
        return [];
      },
    });
    // 循环在第 3 章（index2→n4）前检测到 aborted 而停止
    expect(single.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('被中断的章节不进入 results 且整批标记 aborted（残缺稿不落成 completed）', async () => {
    const single = vi.fn(async () => {
      const r: GenerationResult = {
        content: '残缺稿',
        sceneDesign: { setting: 's', conflict: '', highlight: '', foreshadowingToPlant: [], foreshadowingToRecover: [], characterAppearances: [] },
        consistencyReport: { chapterId: 'c', passed: true, issues: [], checkedAt: 0 },
        wordCount: 3,
        interrupted: true,
      };
      return r;
    });
    const res = await generateChaptersBatch({
      projectId: 'p1',
      startChapterNo: 1,
      count: 3,
      single: single as never,
    });
    expect(res.aborted).toBe(true);
    expect(res.results).toHaveLength(0); // 残缺章不入结果，后续也不再生成
    expect(single).toHaveBeenCalledTimes(1);
  });

  it('中断落在中间阶段（AbortError 冒泡）时应统一转为 aborted 而非抛错', async () => {
    // 模拟 abort 发生在剧情设计/记忆装配等中间 await：底层 fetch reject AbortError
    const controller = new AbortController();
    const single = vi.fn(async () => {
      controller.abort();
      const e = new Error('This operation was aborted');
      e.name = 'AbortError';
      throw e;
    });
    const res = await generateChaptersBatch({
      projectId: 'p1',
      startChapterNo: 1,
      count: 3,
      signal: controller.signal,
      single: single as never,
    });
    expect(res.aborted).toBe(true);
    expect(res.results).toHaveLength(0);
  });

  it('非中止类错误应原样上抛（由调用方提示失败）', async () => {
    const single = vi.fn(async () => {
      throw new Error('上游 LLM 500');
    });
    await expect(
      generateChaptersBatch({ projectId: 'p1', startChapterNo: 1, count: 2, single: single as never })
    ).rejects.toThrow('上游 LLM 500');
  });
});
describe('computeBatchQueue（队列可视化快照）', () => {
  it('未开始：全部 pending，doneCount=0', () => {
    const q = computeBatchQueue(3, 4, null);
    expect(q.chapters.map((c) => c.status)).toEqual(['pending', 'pending', 'pending', 'pending']);
    expect(q.chapters[0].chapterNo).toBe(3);
    expect(q.doneCount).toBe(0);
    expect(q.allDone).toBe(false);
  });

  it('进行中：<index 已 done、==index running、>index pending，且含阶段', () => {
    const q = computeBatchQueue(1, 5, 2, 'writing');
    expect(q.chapters.map((c) => c.status)).toEqual(['done', 'done', 'running', 'pending', 'pending']);
    expect(q.doneCount).toBe(2);
    expect(q.chapters[2].chapterNo).toBe(3); // 1+2
    expect(q.chapters[2].stage).toBe('writing');
    expect(q.allDone).toBe(false);
  });

  it('最后一章进行中：allDone 应标记整批临近完成', () => {
    const q = computeBatchQueue(1, 3, 2, 'completed');
    expect(q.chapters.map((c) => c.status)).toEqual(['done', 'done', 'running']);
    expect(q.allDone).toBe(true);
  });

  it('begin 章号非 1 时章号正确对齐', () => {
    const q = computeBatchQueue(10, 3, 0, 'writing');
    expect(q.chapters.map((c) => c.chapterNo)).toEqual([10, 11, 12]);
    expect(q.chapters[0].status).toBe('running');
  });
});

describe('computeResumeCount / computeDoneCount（断点续写规划）', () => {
  it('未开始：无需跳过，剩余=总章数', () => {
    // 原批从第 1 章起、当前 0 章
    expect(computeResumeCount(50, 1, 0)).toBe(50);
    expect(computeDoneCount(50, 1, 0)).toBe(0);
  });

  it('已完成若干章：剩余=总数-已做，已完成=已做', () => {
    // 原批 50 章起于第 1 章，当前已有 12 章
    expect(computeResumeCount(50, 1, 12)).toBe(38);
    expect(computeDoneCount(50, 1, 12)).toBe(12);
  });

  it('中断后从后部续写：起始章>1 时按偏移计算', () => {
    // 原批起于第 3 章、总数 5（即第3~7章），当前已有 6 章 → 本批已做 3-6 共 4 章，剩第7章
    expect(computeResumeCount(5, 3, 6)).toBe(1);
    expect(computeDoneCount(5, 3, 6)).toBe(4);
  });

  it('已全部生成：剩余为 0', () => {
    expect(computeResumeCount(5, 1, 5)).toBe(0);
    expect(computeDoneCount(5, 1, 5)).toBe(5);
  });

  it('章数异常：非法入参安全返回 0', () => {
    expect(computeResumeCount(-1, 1, 0)).toBe(0);
    expect(computeDoneCount(0, 1, 5)).toBe(0);
  });
});