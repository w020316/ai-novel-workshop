// ============================================================================
// 全书生产流水线（P3 · 对标 ai-story-builder 节点图 pipeline）
// 纯确定性聚合函数：把「章节记录 + 大纲卷规划 + 批量任务失败现场」
// 聚合为按卷分组的逐章节点网格数据，供工作台流水线面板渲染。
// 无 LLM / 网络依赖，结果确定可测。
// ============================================================================
import type { Chapter, Volume, BatchJob } from '@/types';

/** 流水线节点状态 */
export type PipelineNodeStatus =
  | 'done' // 已完成
  | 'recheck' // 已完成但待复查（一致性 / 原创性标记）
  | 'active' // 生成中（designing/drafting/reviewing/rewriting 等中间态）
  | 'pending' // 已建壳未动笔
  | 'failed' // 批量续写重试耗尽仍失败
  | 'planned'; // 大纲规划了该章号但尚无章节记录

export interface PipelineNode {
  chapterNo: number;
  /** 章节标题（无记录时为 null） */
  title: string | null;
  status: PipelineNodeStatus;
  wordCount: number;
  needsRecheck: boolean;
  /** 与 BatchJob.failedChapterNo 匹配 */
  failed: boolean;
  /** 失败原因（仅 failed 节点） */
  lastError?: string;
  /** 是否存在章节记录 */
  exists: boolean;
}

export interface PipelineGroup {
  volumeNo: number;
  /** 大纲卷标题，无大纲时回退「第 N 卷」 */
  title: string;
  chapters: PipelineNode[];
}

export interface PipelineStats {
  total: number;
  done: number;
  recheck: number;
  active: number;
  pending: number;
  failed: number;
  planned: number;
}

export interface PipelineBoard {
  groups: PipelineGroup[];
  stats: PipelineStats;
}

function toNode(c: Chapter | undefined, chapterNo: number, batchJob: BatchJob | null): PipelineNode {
  const failed = batchJob?.failedChapterNo === chapterNo;
  if (!c) {
    return {
      chapterNo,
      title: null,
      // 失败章即使无章节记录（重试耗尽未落库）也要红格定位
      status: failed ? 'failed' : 'planned',
      wordCount: 0,
      needsRecheck: false,
      failed,
      lastError: failed ? batchJob?.lastError : undefined,
      exists: false,
    };
  }
  let status: PipelineNodeStatus;
  if (failed) {
    status = 'failed';
  } else if (c.status === 'completed') {
    status = c.needsRecheck ? 'recheck' : 'done';
  } else if (c.status === 'pending') {
    status = 'pending';
  } else {
    status = 'active';
  }
  return {
    chapterNo,
    title: c.title,
    status,
    wordCount: c.wordCount,
    needsRecheck: !!c.needsRecheck,
    failed,
    lastError: failed ? batchJob?.lastError : undefined,
    exists: true,
  };
}

function emptyStats(): PipelineStats {
  return { total: 0, done: 0, recheck: 0, active: 0, pending: 0, failed: 0, planned: 0 };
}

function bump(stats: PipelineStats, status: PipelineNodeStatus): void {
  stats.total++;
  if (status === 'done') stats.done++;
  else if (status === 'recheck') stats.recheck++;
  else if (status === 'active') stats.active++;
  else if (status === 'pending') stats.pending++;
  else if (status === 'failed') stats.failed++;
  else stats.planned++;
}

/**
 * 聚合全书生产流水线。
 * 分组规则：
 *   - 章节记录按自身 volumeNo 分卷，卷标题取大纲同名卷（无则「第 N 卷」）
 *   - 大纲各卷 chapterRange 内尚无记录的章号 → planned 节点（虚线灰格，规划占位）
 *   - 有记录但 volumeNo 不在任何大纲卷范围的章 → 照常按 volumeNo 成组（不丢弃）
 * 节点状态规则（优先级从高到低）：
 *   failed（批量失败章号）> completed（needsRecheck → recheck / 否则 done）
 *   > pending > 中间态 active；无记录 → planned
 * @param chapters 全部章节记录（任意顺序）
 * @param volumes 大纲卷规划（可为空）
 * @param batchJob 最近一次批量任务现场（失败章号定位），可为 null
 */
export function buildPipeline(
  chapters: Chapter[],
  volumes: Volume[],
  batchJob: BatchJob | null
): PipelineBoard {
  const chapterMap = new Map<number, Chapter>();
  for (const c of chapters) {
    if (!chapterMap.has(c.chapterNo)) chapterMap.set(c.chapterNo, c);
  }

  // 卷号 → 标题（大纲同名卷）
  const volumeTitle = new Map<number, string>();
  for (const v of volumes) {
    if (!volumeTitle.has(v.volumeNo)) volumeTitle.set(v.volumeNo, v.title);
  }

  // 大纲规划到的章号集合（用于 planned 节点归属）
  const plannedByVolume = new Map<number, number[]>();
  for (const v of volumes) {
    const [start, end] = v.chapterRange;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    for (let n = start; n <= end; n++) {
      if (!chapterMap.has(n)) {
        const list = plannedByVolume.get(v.volumeNo) ?? [];
        list.push(n);
        plannedByVolume.set(v.volumeNo, list);
      }
    }
  }

  // 实际章节按卷号分组
  const chaptersByVolume = new Map<number, Chapter[]>();
  for (const c of chapterMap.values()) {
    const list = chaptersByVolume.get(c.volumeNo) ?? [];
    list.push(c);
    chaptersByVolume.set(c.volumeNo, list);
  }

  // 合并所有出现过的卷号（章节分组 ∪ 大纲规划卷），升序排列
  const volumeNos = new Set<number>([...chaptersByVolume.keys(), ...plannedByVolume.keys()]);
  const groups: PipelineGroup[] = [];
  const stats = emptyStats();

  for (const volumeNo of [...volumeNos].sort((a, b) => a - b)) {
    const list = chaptersByVolume.get(volumeNo) ?? [];
    const planned = plannedByVolume.get(volumeNo) ?? [];
    // 已存在章按章号升序；planned 章号补充到既有章号空位后再按章号合并排序
    const nodes: PipelineNode[] = [];
    for (const c of list.sort((a, b) => a.chapterNo - b.chapterNo)) {
      const node = toNode(c, c.chapterNo, batchJob);
      nodes.push(node);
      bump(stats, node.status);
    }
    for (const n of planned) {
      const node = toNode(undefined, n, batchJob);
      nodes.push(node);
      bump(stats, node.status);
    }
    nodes.sort((a, b) => a.chapterNo - b.chapterNo);
    groups.push({
      volumeNo,
      title: volumeTitle.get(volumeNo) ?? `第 ${volumeNo} 卷`,
      chapters: nodes,
    });
  }

  return { groups, stats };
}
