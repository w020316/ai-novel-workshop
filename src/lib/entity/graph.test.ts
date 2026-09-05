import { describe, it, expect } from 'vitest';
import {
  buildRelationGraph,
  layoutCircular,
  buildPlotDebt,
} from './graph';
import type { Character, Foreshadowing, PlotThread } from '@/types';

function makeCharacter(overrides: Partial<Character> & { id: string; name: string }): Character {
  return {
    projectId: 'p1',
    role: 'supporting',
    appearance: '',
    personality: '',
    catchphrase: '',
    background: '',
    motivation: '',
    weakness: '',
    growthArc: '',
    relationships: [],
    speechStyle: '',
    behaviorPattern: '',
    locked: false,
    updatedAt: 0,
    ...overrides,
  } as Character;
}

function makeForeshadowing(overrides: Partial<Foreshadowing> & { id: string }): Foreshadowing {
  return {
    projectId: 'p1',
    description: '伏笔',
    setupChapter: 1,
    importance: 'medium',
    status: 'planted',
    relatedCharacters: [],
    createdAt: 0,
    ...overrides,
  } as Foreshadowing;
}

describe('buildRelationGraph', () => {
  it('按 targetId 解析关系边，孤立人物计入 isolatedIds', () => {
    const a = makeCharacter({ id: 'a', name: '林川', relationships: [{ targetId: 'b', targetName: '苏晚', relation: '恋人' }] });
    const b = makeCharacter({ id: 'b', name: '苏晚' });
    const c = makeCharacter({ id: 'c', name: '路人甲' });
    const g = buildRelationGraph([a, b, c]);
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toEqual([
      { sourceId: 'a', targetId: 'b', sourceName: '林川', targetName: '苏晚', label: '恋人' },
    ]);
    expect(g.isolatedIds).toEqual(['c']);
  });

  it('targetId 失效时回退姓名匹配', () => {
    const a = makeCharacter({ id: 'a', name: '林川', relationships: [{ targetId: 'ghost', targetName: '老魔', relation: '仇敌' }] });
    const b = makeCharacter({ id: 'b', name: '老魔' });
    const g = buildRelationGraph([a, b]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].targetId).toBe('b');
    expect(g.isolatedIds).toEqual([]);
  });

  it('双向重复关系与同名关系去重；自环丢弃', () => {
    const a = makeCharacter({
      id: 'a',
      name: '甲',
      relationships: [
        { targetId: 'b', targetName: '乙', relation: '师徒' },
        { targetId: 'a', targetName: '甲', relation: '自己' },
      ],
    });
    const b = makeCharacter({ id: 'b', name: '乙', relationships: [{ targetId: 'a', targetName: '甲', relation: '师徒' }] });
    const g = buildRelationGraph([a, b]);
    expect(g.edges).toHaveLength(1);
  });

  it('指向不存在人物的关系被丢弃（不指向幽灵实体）', () => {
    const a = makeCharacter({ id: 'a', name: '甲', relationships: [{ targetId: 'x', targetName: '不存在', relation: '仇敌' }] });
    const g = buildRelationGraph([a]);
    expect(g.edges).toEqual([]);
    expect(g.isolatedIds).toEqual(['a']);
  });
});

describe('layoutCircular', () => {
  it('确定性：主角排最前且从顶部开始，同输入恒同输出', () => {
    const nodes = [
      { id: 'm', name: '路人', role: 'minor' as const },
      { id: 'p', name: '主角', role: 'protagonist' as const },
      { id: 's', name: '配角', role: 'supporting' as const },
    ];
    const pos = layoutCircular(nodes, 640, 360);
    expect(pos[0].id).toBe('p');
    // 第一个节点在顶部（x 居中，y = cy - r）
    expect(pos[0].x).toBeCloseTo(320, 0);
    expect(pos[0].y).toBeLessThan(180);
    expect(layoutCircular(nodes, 640, 360)).toEqual(pos);
  });

  it('单节点不除零，落在圆心正上方', () => {
    const pos = layoutCircular([{ id: 'p', name: '主角', role: 'protagonist' }], 400, 400);
    expect(pos[0].x).toBeCloseTo(200, 0);
    expect(pos[0].y).toBeCloseTo(200 - 400 * 0.36, 0);
  });
});

describe('buildPlotDebt', () => {
  it('计划回收章已过 → overdue（含超期章数），未到期 → upcoming，无排期 → unscheduled', () => {
    const list = [
      makeForeshadowing({ id: 'f1', description: '身世玉佩', setupChapter: 1, plannedRecoveryChapter: 5, status: 'planted' }),
      makeForeshadowing({ id: 'f2', description: '神秘信件', setupChapter: 3, plannedRecoveryChapter: 12, status: 'planted' }),
      makeForeshadowing({ id: 'f3', description: '无名尸骨', setupChapter: 4, status: 'pending' }),
      makeForeshadowing({ id: 'f4', description: '已回收', setupChapter: 1, plannedRecoveryChapter: 3, status: 'recovered', actualRecoveryChapter: 3 }),
      makeForeshadowing({ id: 'f5', description: '已放弃', setupChapter: 2, status: 'abandoned' }),
    ];
    const debt = buildPlotDebt(list, 10);
    expect(debt.overdue.map((x) => x.id)).toEqual(['f1']);
    expect(debt.overdue[0].overdueBy).toBe(5);
    expect(debt.upcoming.map((x) => x.id)).toEqual(['f2']);
    expect(debt.unscheduled.map((x) => x.id)).toEqual(['f3']);
    expect(debt.resolvedCount).toBe(1);
    expect(debt.abandonedCount).toBe(1);
    expect(debt.openCount).toBe(3);
  });

  it('upcoming 按计划回收章升序', () => {
    const list = [
      makeForeshadowing({ id: 'b', description: '晚回收', setupChapter: 1, plannedRecoveryChapter: 20 }),
      makeForeshadowing({ id: 'a', description: '早回收', setupChapter: 1, plannedRecoveryChapter: 11 }),
    ];
    const debt = buildPlotDebt(list, 10);
    expect(debt.upcoming.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('空输入 → 全零统计', () => {
    const debt = buildPlotDebt([], 5);
    expect(debt.openCount).toBe(0);
    expect(debt.resolvedCount).toBe(0);
  });
});

// 类型引用冒烟：确保 threadStatusLabel 导出可用
describe('threadStatusLabel', () => {
  it('覆盖三种剧情线状态', async () => {
    const { threadStatusLabel } = await import('./graph');
    const s: PlotThread['status'] = 'active';
    expect(threadStatusLabel[s]).toBe('进行中');
  });
});
