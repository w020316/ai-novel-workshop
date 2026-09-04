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

/** 启动/更新批量任务（status running）；覆盖同一项目的旧任务 */
export async function startBatchJob(input: {
  projectId: string;
  total: number;
  startChapterNo: number;
  plotTemplate: string;
}): Promise<BatchJob> {
  const job: BatchJob = {
    id: batchJobId(input.projectId),
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
