// ============================================================================
// 批量续写任务持久层（断点续写 / 暂停恢复）
// 把"总章数 + 起始章号 + 剧情模板"持久化到 Dexie；续写时按当前已生成的章节
// 数（跳过已完成章）计算剩余章数，从而在刷新页面/挂机中断后无痛续写。
// ============================================================================
import { db } from '@/lib/db/schema';
import type { BatchJob } from '@/types';

export function batchJobId(projectId: string): string {
  return `batch_${projectId}`;
}

/** 活跃锁窗口：running 任务心跳超过该时长视为僵尸（如页面崩溃），允许其他标签页接管 */
const RUNNING_LOCK_MS = 5 * 60 * 1000;

/** 启动/更新批量任务（status running）。
 * 并发互斥：其他标签页存在活跃 running 任务（心跳未超时）时抛错拒绝，
 * 防止两条批量流互写同一章号、相互覆盖章节与记忆库。 */
export async function startBatchJob(input: {
  projectId: string;
  total: number;
  startChapterNo: number;
  plotTemplate: string;
}): Promise<BatchJob> {
  const id = batchJobId(input.projectId);
  const existing = await db.batchJobs.get(id);
  if (
    existing &&
    existing.status === 'running' &&
    Date.now() - existing.updatedAt < RUNNING_LOCK_MS
  ) {
    throw new Error('该项目已有进行中的批量续写任务（可能在其他标签页），请先完成或放弃该任务');
  }
  const job: BatchJob = {
    id,
    projectId: input.projectId,
    total: input.total,
    startChapterNo: input.startChapterNo,
    plotTemplate: input.plotTemplate,
    status: 'running',
    updatedAt: Date.now(),
  };
  await db.batchJobs.put(job);
  return job;
}

/** 心跳：批量生成期间每章完成时刷新 updatedAt，向其他标签页证明任务仍活跃 */
export async function touchBatchJob(projectId: string): Promise<void> {
  const id = batchJobId(projectId);
  const cur = await db.batchJobs.get(id);
  if (cur && cur.status === 'running') {
    await db.batchJobs.put({ ...cur, updatedAt: Date.now() });
  }
}

/** 是否存在活跃（心跳未超时）的 running 任务，供调用方在启动/续写前做并发互斥 */
export async function hasActiveBatchJob(projectId: string): Promise<boolean> {
  const cur = await db.batchJobs.get(batchJobId(projectId));
  return !!cur && cur.status === 'running' && Date.now() - cur.updatedAt < RUNNING_LOCK_MS;
}

/** 任务暂停（保留现场，供刷新后继续） */
export async function pauseBatchJob(projectId: string): Promise<void> {
  const id = batchJobId(projectId);
  const cur = await db.batchJobs.get(id);
  if (!cur) return;
  await db.batchJobs.put({ ...cur, status: 'paused', updatedAt: Date.now() });
}

/** 完成任务（删除现场） */
export async function clearBatchJob(projectId: string): Promise<void> {
  await db.batchJobs.delete(batchJobId(projectId));
}

/** 取当前批量任务（供断点续写） */
export async function getBatchJob(projectId: string): Promise<BatchJob | null> {
  return (await db.batchJobs.get(batchJobId(projectId))) ?? null;
}
