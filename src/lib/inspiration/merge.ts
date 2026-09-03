// ============================================================================
// 灵感卡 → 大纲 消费（让收藏灵感真正进入创作流程）
// 依据：调研 P5/拆书 —— 灵感卡应「并入大纲与设定」反哺创作。
// 实现：把一张灵感卡追加为项目大纲的一条「剧情/高潮想法」（climaxNodes）。
// ============================================================================
import { db } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import type { Outline, InspirationCard } from '@/types';

const KIND_LABEL: Record<InspirationCard['kind'], string> = {
  'golden-three': '黄金三章',
  hook: '钩子',
  coolpoint: '爽点',
  pacing: '节奏',
  character: '人物',
  structure: '结构',
  other: '其他',
};

/**
 * 把一张灵感卡并入项目大纲（追加为一条剧情/高潮想法，去重、防无限增长）。
 * 返回更新后的大纲。
 */
export async function mergeCardIntoOutline(
  projectId: string,
  card: InspirationCard
): Promise<Outline> {
  let outline = await db.outlines.where('projectId').equals(projectId).first();
  if (!outline) {
    outline = {
      id: generateId('outline'),
      projectId,
      volumes: [],
      mainPlotline: '',
      climaxNodes: [],
      ending: '',
      updatedAt: Date.now(),
    };
  }
  const label = KIND_LABEL[card.kind] ?? '灵感';
  const node = `【${label}】${card.title}：${card.content}`;
  if (!outline.climaxNodes.includes(node)) {
    outline.climaxNodes = [...outline.climaxNodes, node].slice(-200);
  }
  outline.updatedAt = Date.now();
  await db.outlines.put(outline);
  return outline;
}