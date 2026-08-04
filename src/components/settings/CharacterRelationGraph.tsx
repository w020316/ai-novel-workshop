'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getRoleLabel } from '@/lib/character/template';
import type { Character } from '@/types';
import { Users } from 'lucide-react';

interface CharacterRelationGraphProps {
  characters: Character[];
  onSelect?: (id: string) => void;
}

interface GraphNode {
  id: string;
  name: string;
  role: Character['role'];
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
  // 来源方向（关系是 from 的视角描述）
  direction: 'out' | 'in';
}

const ROLE_RADII: Record<Character['role'], number> = {
  protagonist: 32,
  supporting: 26,
  antagonist: 30,
  minor: 22,
};

const ROLE_FILL: Record<Character['role'], string> = {
  protagonist: '#d97706', // brand-600
  supporting: '#0284c7', // sky-600
  antagonist: '#dc2626', // accent-600
  minor: '#78716c', // stone-500
};

export function CharacterRelationGraph({ characters, onSelect }: CharacterRelationGraphProps) {
  const { nodes, edges } = useMemo(() => {
    if (characters.length === 0) {
      return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    }

    // 圆形布局：主角居中，其他按角色等级环绕
    const protagonist = characters.find((c) => c.role === 'protagonist');
    const others = characters.filter((c) => c.role !== 'protagonist');

    const nodes: GraphNode[] = [];
    const radiusStep = 100;
    const centerX = 300;
    const centerY = 220;

    if (protagonist) {
      nodes.push({
        id: protagonist.id,
        name: protagonist.name,
        role: protagonist.role,
        x: centerX,
        y: centerY,
      });
    }

    // 反派在外圈，配角在中圈，次要角色最外圈
    const roleRadii: Record<Character['role'], number> = {
      protagonist: 0,
      antagonist: radiusStep,
      supporting: radiusStep * 1.8,
      minor: radiusStep * 2.6,
    };

    // 按角色分组
    const groups: Record<Character['role'], Character[]> = {
      protagonist: [],
      antagonist: [],
      supporting: [],
      minor: [],
    };
    for (const c of others) {
      groups[c.role].push(c);
    }

    for (const role of ['antagonist', 'supporting', 'minor'] as Character['role'][]) {
      const list = groups[role];
      const r = roleRadii[role];
      list.forEach((c, i) => {
        // 角度按列表均匀分布，从顶部开始
        const angle = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
        nodes.push({
          id: c.id,
          name: c.name,
          role: c.role,
          x: centerX + r * Math.cos(angle),
          y: centerY + r * Math.sin(angle),
        });
      });
    }

    // 收集所有边（双向，去重）
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const c of characters) {
      for (const rel of c.relationships) {
        const key = [c.id, rel.targetId].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from: c.id,
          to: rel.targetId,
          label: rel.relation,
          direction: 'out',
        });
      }
    }

    return { nodes, edges };
  }, [characters]);

  if (characters.length === 0) {
    return null;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-brand-600" />
              关系图
            </CardTitle>
            <CardDescription>
              主角居中 · 反派/配角/次要按外圈排布 · 点击节点查看详情
            </CardDescription>
          </div>
          <span className="text-xs text-stone-500">
            {nodes.length} 节点 · {edges.length} 关系
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            width="600"
            height="440"
            viewBox="0 0 600 440"
            className="mx-auto block"
            role="img"
            aria-label="人物关系图"
          >
            {/* 边 */}
            <g>
              {edges.map((e, i) => {
                const from = nodeById.get(e.from);
                const to = nodeById.get(e.to);
                if (!from || !to) return null;
                // 计算线段中点（用于标签）
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;
                return (
                  <g key={`edge-${i}`}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#d6d3d1"
                      strokeWidth={1.5}
                    />
                    <rect
                      x={midX - (e.label.length * 6 + 4) / 2}
                      y={midY - 9}
                      width={e.label.length * 6 + 8}
                      height={18}
                      rx={4}
                      fill="white"
                      stroke="#e7e5e4"
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#57534e"
                    >
                      {e.label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* 节点 */}
            <g>
              {nodes.map((n) => {
                const r = ROLE_RADII[n.role];
                const fill = ROLE_FILL[n.role];
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className={onSelect ? 'cursor-pointer' : ''}
                    onClick={() => onSelect?.(n.id)}
                  >
                    <circle r={r} fill={fill} fillOpacity={0.18} stroke={fill} strokeWidth={2} />
                    <text
                      y={-r - 6}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill="#292524"
                    >
                      {n.name}
                    </text>
                    <text
                      y={4}
                      textAnchor="middle"
                      fontSize={10}
                      fill={fill}
                      fontWeight={500}
                    >
                      {getRoleLabel(n.role)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* 图例 */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] text-stone-600">
          {(['protagonist', 'supporting', 'antagonist', 'minor'] as Character['role'][]).map((r) => (
            <span key={r} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: ROLE_FILL[r] }}
              />
              {getRoleLabel(r)}
            </span>
          ))}
        </div>

        {edges.length === 0 && nodes.length > 0 && (
          <p className="mt-2 text-center text-xs text-stone-400">
            暂无关系连线 · 在人物编辑表单中可添加
          </p>
        )}
      </CardContent>
    </Card>
  );
}
