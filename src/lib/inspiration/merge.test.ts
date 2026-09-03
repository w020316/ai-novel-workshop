import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';
import { mergeCardIntoOutline, mergeCardIntoWorldview } from './merge';
import type { InspirationCard } from '@/types';

function makeCard(kind: InspirationCard['kind'], title: string, content: string): InspirationCard {
  return {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId: 'p1',
    kind,
    title,
    content,
    sourceDeconstructionId: 's1',
    createdAt: Date.now(),
  };
}

describe('lib/inspiration/merge', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('无大纲时先创建大纲并写入灵感', async () => {
    const card = makeCard('hook', '开篇钩子', '主角是被遗弃的圣子');
    const outline = await mergeCardIntoOutline('p1', card);
    expect(outline.climaxNodes.length).toBe(1);
    expect(outline.climaxNodes[0]).toContain('【钩子】开篇钩子：主角是被遗弃的圣子');
  });

  it('相同灵感重复并入应去重', async () => {
    const card = makeCard('coolpoint', '打脸', '当众揭穿身份');
    await mergeCardIntoOutline('p1', card);
    await mergeCardIntoOutline('p1', card);
    const outline = await db.outlines.where('projectId').equals('p1').first();
    expect(outline?.climaxNodes.length).toBe(1);
  });

  it('不同灵感应追加而非覆盖', async () => {
    await mergeCardIntoOutline('p1', makeCard('structure', '结构', '三幕式'));
    await mergeCardIntoOutline('p1', makeCard('pacing', '节奏', '金三章高密度'));
    const outline = await db.outlines.where('projectId').equals('p1').first();
    expect(outline?.climaxNodes.length).toBe(2);
  });

  it('返回的项目是大纲类型对象', async () => {
    const outline = await mergeCardIntoOutline('p1', makeCard('other', '其他', 'x'));
    expect(outline.id).toBeTruthy();
    expect(outline.projectId).toBe('p1');
    expect(typeof generateId).toBe('function');
  });

  // ===== 并入世界观规则 =====
  it('无世界观时先创建世界观并写入规则', async () => {
    const card = makeCard('other', '设定', '灵脉衰微，修行者不得动用本源');
    const wv = await mergeCardIntoWorldview('p1', card);
    expect(wv.rules.length).toBe(1);
    expect(wv.rules[0]).toContain('灵脉衰微');
  });

  it('相同规则重复并入应去重', async () => {
    const card = makeCard('other', '设定', '灵气浓度随深度递减');
    await mergeCardIntoWorldview('p1', card);
    await mergeCardIntoWorldview('p1', card);
    const wv = await db.worldviews.where('projectId').equals('p1').first();
    expect(wv?.rules.length).toBe(1);
  });

  it('并入世界观不应写入大纲', async () => {
    const card = makeCard('other', '设定', '规则：飞升需渡九重雷劫');
    const wv = await mergeCardIntoWorldview('p1', card);
    expect(wv.rules).toContain('规则：飞升需渡九重雷劫');
    const outline = await db.outlines.where('projectId').equals('p1').first();
    expect(outline?.climaxNodes.length ?? 0).toBe(0);
  });
});