// ============================================================================
// 灵感卡 → 大纲 / 设定 消费（让收藏灵感真正进入创作流程）
// 依据：调研 P5/拆书 —— 灵感卡应「并入大纲与设定」反哺创作。
// 实现：
//  - mergeCardIntoOutline：追加为项目大纲的一条「剧情/高潮想法」（climaxNodes）。
//  - mergeCardIntoWorldview：追加为项目世界观的一条「核心规则」（rules），
//    服务「灵感尚不能并入世界观规则」的缺口（交付报告 §5.4 痛点③）。
// ============================================================================
import { db } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { getWorldview, saveWorldview } from '@/lib/db/queries';
import type { Outline, Worldview, InspirationCard } from '@/types';

const KIND_LABEL: Record<InspirationCard['kind'], string> = {
  'golden-three': '黄金三章',
  hook: '钩子',
  coolpoint: '爽点',
  pacing: '节奏',
  character: '人物',
  structure: '结构',
  other: '其他',
};

/** 防止单条灵感被无限并入导致的列表无限增长 */
const MAX_OUTLINE_NODES = 200;
const MAX_WORLDVIEW_RULES = 60;

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
    outline.climaxNodes = [...outline.climaxNodes, node].slice(-MAX_OUTLINE_NODES);
  }
  outline.updatedAt = Date.now();
  await db.outlines.put(outline);
  return outline;
}

/**
 * 把一张灵感卡并入项目世界观（追加为一条核心规则，去重、防无限增长）。
 * 若该项目尚无世界观，则新建一个仅含该规则的世界观，保证灵感不被丢弃。
 * 返回更新后的世界观。
 */
export async function mergeCardIntoWorldview(
  projectId: string,
  card: InspirationCard
): Promise<Worldview> {
  let wv = await getWorldview(projectId);
  if (!wv) {
    wv = {
      id: generateId('wv'),
      projectId,
      worldStructure: '',
      powerSystem: '',
      geography: '',
      era: '',
      factions: '',
      rules: [],
      locked: false,
      updatedAt: Date.now(),
    };
  }
  const rule = card.content.trim() || card.title.trim();
  if (rule && !wv.rules.includes(rule)) {
    wv.rules = [...wv.rules, rule].slice(-MAX_WORLDVIEW_RULES);
  }
  wv.updatedAt = Date.now();
  await saveWorldview(wv);
  return wv;
}