'use client';

// ============================================================================
// 实体图谱卡片（对标 Webnovel Writer 实体图谱 Dashboard）
// 纯 SVG 人物关系网络（确定性环形布局）+ 剧情线清单 + 情节债务（伏笔超期追踪）。
// 无第三方图表库、无 LLM 依赖，数据由 src/lib/entity/graph.ts 确定性聚合。
// ============================================================================
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  buildRelationGraph,
  layoutCircular,
  buildPlotDebt,
  threadStatusLabel,
  type GraphNode,
} from '@/lib/entity/graph';
import type { Character, Foreshadowing, PlotThread } from '@/types';

/** 角色节点配色（砚斋·墨印：主角=brand 墨绿 / 反派=朱砂 / 配角=烟墨 / 路人=浅灰） */
const ROLE_STYLE: Record<GraphNode['role'], { fill: string; text: string; label: string }> = {
  protagonist: { fill: 'fill-brand-500', text: 'text-brand-700', label: '主角' },
  antagonist: { fill: 'fill-[#c0332c]', text: 'text-[#c0332c]', label: '反派' },
  supporting: { fill: 'fill-stone-500', text: 'text-stone-600', label: '配角' },
  minor: { fill: 'fill-stone-300', text: 'text-stone-400', label: '路人' },
};

const THREAD_DOT: Record<PlotThread['status'], string> = {
  active: 'bg-brand-500',
  resolved: 'bg-stone-400',
  abandoned: 'bg-stone-300',
};

interface EntityGraphCardProps {
  characters: Character[];
  plotThreads: PlotThread[];
  foreshadowings: Foreshadowing[];
  currentChapterNo: number;
}

const W = 640;
const H = 340;

export function EntityGraphCard({ characters, plotThreads, foreshadowings, currentChapterNo }: EntityGraphCardProps) {
  const graph = useMemo(() => buildRelationGraph(characters), [characters]);
  const positions = useMemo(() => layoutCircular(graph.nodes, W, H), [graph.nodes]);
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const debt = useMemo(() => buildPlotDebt(foreshadowings, currentChapterNo), [foreshadowings, currentChapterNo]);

  if (characters.length === 0 && plotThreads.length === 0 && foreshadowings.length === 0) return null;

  const hasGraph = positions.length > 0;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">实体图谱</CardTitle>
        <CardDescription>
          人物关系网络 · 剧情线 · 情节债务（伏笔追踪），随章节推进自动对照
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 人物关系网络 */}
        {hasGraph && (
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
              {(Object.keys(ROLE_STYLE) as GraphNode['role'][]).map((r) => (
                <span key={r} className="flex items-center gap-1">
                  <i className={`h-2.5 w-2.5 rounded-full ${ROLE_STYLE[r].fill}`} />
                  {ROLE_STYLE[r].label}
                </span>
              ))}
              <span className="text-stone-400">连线 = 人物关系</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="人物关系图谱">
              {/* 关系边 + 标签 */}
              {graph.edges.map((e, i) => {
                const s = posById.get(e.sourceId);
                const t = posById.get(e.targetId);
                if (!s || !t) return null;
                const mx = (s.x + t.x) / 2;
                const my = (s.y + t.y) / 2;
                return (
                  <g key={`${e.sourceId}-${e.targetId}-${e.label}-${i}`}>
                    <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} className="stroke-stone-300" strokeWidth={1.2} />
                    <rect x={mx - e.label.length * 5 - 3} y={my - 8} width={e.label.length * 10 + 6} height={14} rx={3} className="fill-paper" />
                    <text x={mx} y={my + 3} textAnchor="middle" className="fill-stone-500" fontSize={10}>
                      {e.label}
                    </text>
                  </g>
                );
              })}
              {/* 人物节点 */}
              {positions.map((p) => {
                const st = ROLE_STYLE[p.role];
                return (
                  <g key={p.id}>
                    <title>{`${p.name}（${st.label}）`}</title>
                    <circle cx={p.x} cy={p.y} r={p.role === 'protagonist' ? 16 : 12} className={`${st.fill} opacity-90`} />
                    <text x={p.x} y={p.y + 26} textAnchor="middle" fontSize={11} className={`${st.text} font-medium`}>
                      {p.name}
                    </text>
                  </g>
                );
              })}
            </svg>
            {graph.isolatedIds.length > 0 && (
              <p className="mt-1 text-[10px] text-stone-400">
                尚未建立关系的角色 {graph.isolatedIds.length} 位，可在设定工坊补充人物关系
              </p>
            )}
          </div>
        )}

        {/* 剧情线 */}
        {plotThreads.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-stone-600">剧情线（{plotThreads.filter((t) => t.status === 'active').length} 条进行中）</p>
            <div className="flex flex-wrap gap-1.5">
              {plotThreads.map((t) => (
                <span
                  key={t.id}
                  title={`${t.type === 'main' ? '主线' : '支线'} · ${threadStatusLabel[t.status]} · 涉及第 ${(t.relatedChapters ?? []).join('、') || '-'} 章`}
                  className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] text-stone-600"
                >
                  <i className={`h-1.5 w-1.5 rounded-full ${THREAD_DOT[t.status]}`} />
                  {t.name}
                  <span className="text-stone-400">{threadStatusLabel[t.status]}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 情节债务（伏笔追踪） */}
        {foreshadowings.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-stone-600">
              情节债务
              <span className="ml-1.5 font-normal text-stone-400">
                未回收 {debt.openCount} 条 · 已回收 {debt.resolvedCount} 条
                {debt.abandonedCount > 0 && ` · 已放弃 ${debt.abandonedCount} 条`}
              </span>
            </p>
            {debt.overdue.length > 0 ? (
              <ul className="space-y-1">
                {debt.overdue.slice(0, 8).map((f) => (
                  <li key={f.id} className="flex items-start gap-1.5 text-xs text-[#c0332c]">
                    <span className="mt-0.5 shrink-0 rounded bg-[#c0332c]/10 px-1 text-[10px]">
                      超 {f.overdueBy} 章
                    </span>
                    <span className="min-w-0">
                      第 {f.setupChapter} 章铺设：{f.description}
                      <span className="text-stone-400">（计划第 {f.plannedRecoveryChapter} 章回收）</span>
                    </span>
                  </li>
                ))}
                {debt.overdue.length > 8 && (
                  <li className="text-[10px] text-stone-400">…另有 {debt.overdue.length - 8} 条超期伏笔</li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-emerald-600">✓ 无超期伏笔，情节债务健康</p>
            )}
            {debt.upcoming.length > 0 && (
              <p className="mt-1 text-[10px] text-stone-400">
                近期待回收：{debt.upcoming.slice(0, 3).map((f) => `第 ${f.plannedRecoveryChapter} 章「${f.description.slice(0, 12)}…」`).join('、')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
