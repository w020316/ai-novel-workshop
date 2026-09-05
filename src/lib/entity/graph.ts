// ============================================================================
// 实体图谱（对标 Webnovel Writer 实体图谱 Dashboard + 情节债务/伏笔追踪）
// 纯确定性聚合：人物关系网络（节点+关系边+环形布局）+ 剧情线清单 + 情节债务
// （计划回收章已过仍未回收的伏笔）。无 LLM / 网络依赖，结果确定可测。
// ============================================================================
import type { Character, CharacterRole, Foreshadowing, PlotThread } from '@/types';

// ============ 人物关系图 ============

export type GraphNodeKind = 'character';

export interface GraphNode {
  id: string;
  name: string;
  role: CharacterRole;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  /** 关系描述（师徒/恋人/仇敌…） */
  label: string;
}

export interface RelationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 无任何关系的孤立人物 id */
  isolatedIds: string[];
}

/** 角色在布局/排序中的优先级：主角最前，配角其次，反派再次，路人最后 */
const ROLE_ORDER: Record<CharacterRole, number> = {
  protagonist: 0,
  supporting: 1,
  antagonist: 2,
  minor: 3,
};

export function roleOrder(role: CharacterRole): number {
  return ROLE_ORDER[role];
}

/**
 * 构建人物关系图：
 *   - 节点 = 全部人物
 *   - 边 = 人物 relationships；目标解析优先 targetId，失效（无此 id）时回退
 *     targetName 精确匹配（trim 后），仍无匹配则丢弃该关系（不指向不存在的实体）
 *   - 同一对人物的同名关系去重（A→B 与 B→A 视为同一条边）
 */
export function buildRelationGraph(characters: Character[]): RelationGraph {
  const byId = new Map<string, Character>();
  const byName = new Map<string, Character>();
  for (const c of characters) {
    byId.set(c.id, c);
    byName.set(c.name.trim(), c);
  }

  const nodes: GraphNode[] = characters.map((c) => ({ id: c.id, name: c.name, role: c.role }));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>(); // 去重键：无序对 + 关系名

  for (const c of characters) {
    for (const rel of c.relationships ?? []) {
      let target = rel.targetId ? byId.get(rel.targetId) : undefined;
      if (!target) target = byName.get(rel.targetName.trim());
      // 自环或目标不存在 → 丢弃
      if (!target || target.id === c.id) continue;
      const key = [c.id, target.id].sort().join('~') + '~' + rel.relation.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        sourceId: c.id,
        targetId: target.id,
        sourceName: c.name,
        targetName: target.name,
        label: rel.relation,
      });
    }
  }

  const connected = new Set(edges.flatMap((e) => [e.sourceId, e.targetId]));
  const isolatedIds = characters.filter((c) => !connected.has(c.id)).map((c) => c.id);

  return { nodes, edges, isolatedIds };
}

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

/**
 * 确定性环形布局：按角色优先级（主角在前）+ 姓名排序后，从顶部顺时针均分圆周。
 * 纯函数、无随机，同输入恒同布局。
 */
export function layoutCircular(
  nodes: GraphNode[],
  width: number,
  height: number,
  radiusRatio = 0.36
): PositionedNode[] {
  const sorted = [...nodes].sort(
    (a, b) => roleOrder(a.role) - roleOrder(b.role) || a.name.localeCompare(b.name, 'zh')
  );
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * radiusRatio;
  return sorted.map((n, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, sorted.length);
    return {
      ...n,
      x: +(cx + r * Math.cos(angle)).toFixed(1),
      y: +(cy + r * Math.sin(angle)).toFixed(1),
    };
  });
}

// ============ 剧情线与情节债务 ============

export interface PlotDebtItem {
  id: string;
  description: string;
  setupChapter: number;
  plannedRecoveryChapter?: number;
  importance: Foreshadowing['importance'];
  status: Foreshadowing['status'];
  /** 超期章数（仅 overdue） */
  overdueBy?: number;
}

export interface PlotDebt {
  /** 已超期未回收：计划回收章 < 当前章号（欠账，红榜） */
  overdue: PlotDebtItem[];
  /** 未超期且有计划回收章（按计划章号升序） */
  upcoming: PlotDebtItem[];
  /** 未回收且未排期 */
  unscheduled: PlotDebtItem[];
  /** 已回收 / 已放弃 计数 */
  resolvedCount: number;
  abandonedCount: number;
  /** 未回收伏笔总数（overdue + upcoming + unscheduled） */
  openCount: number;
}

/**
 * 情节债务（伏笔追踪）：以当前最新章号为基准，
 * planted/pending 伏笔若计划回收章已过 → overdue（债务），
 * 未超期有排期 → upcoming，无排期 → unscheduled。
 * recovered/abandoned 计入统计不进清单。
 */
export function buildPlotDebt(foreshadowings: Foreshadowing[], currentChapterNo: number): PlotDebt {
  const overdue: PlotDebtItem[] = [];
  const upcoming: PlotDebtItem[] = [];
  const unscheduled: PlotDebtItem[] = [];
  let resolvedCount = 0;
  let abandonedCount = 0;

  for (const f of foreshadowings) {
    if (f.status === 'recovered') {
      resolvedCount++;
      continue;
    }
    if (f.status === 'abandoned') {
      abandonedCount++;
      continue;
    }
    const item: PlotDebtItem = {
      id: f.id,
      description: f.description,
      setupChapter: f.setupChapter,
      plannedRecoveryChapter: f.plannedRecoveryChapter,
      importance: f.importance,
      status: f.status,
    };
    if (
      f.plannedRecoveryChapter != null &&
      Number.isFinite(f.plannedRecoveryChapter) &&
      f.plannedRecoveryChapter < currentChapterNo
    ) {
      overdue.push({ ...item, overdueBy: currentChapterNo - f.plannedRecoveryChapter });
    } else if (f.plannedRecoveryChapter != null) {
      upcoming.push(item);
    } else {
      unscheduled.push(item);
    }
  }

  upcoming.sort((a, b) => (a.plannedRecoveryChapter ?? 0) - (b.plannedRecoveryChapter ?? 0));

  return {
    overdue,
    upcoming,
    unscheduled,
    resolvedCount,
    abandonedCount,
    openCount: overdue.length + upcoming.length + unscheduled.length,
  };
}

/** 剧情线状态中文标签 */
export const threadStatusLabel: Record<PlotThread['status'], string> = {
  active: '进行中',
  resolved: '已收束',
  abandoned: '已废弃',
};
