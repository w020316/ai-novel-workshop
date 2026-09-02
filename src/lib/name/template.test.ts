import { describe, it, expect } from 'vitest';
import { generateNameTemplate, NAME_CATEGORY_LABEL } from './template';
import type { NameCategory, NameLLMInput } from '@/types';

const CATEGORIES: NameCategory[] = ['person', 'place', 'skill', 'sect', 'weapon', 'treasure'];

function makeInput(overrides: Partial<NameLLMInput> = {}): NameLLMInput {
  return {
    projectId: 'proj_1',
    category: 'person',
    topic: '冷酷剑修',
    count: 5,
    ...overrides,
  };
}

describe('generateNameTemplate', () => {
  it.each(CATEGORIES)('类别 %s 能产生非空、结构完整的名字', (category) => {
    const names = generateNameTemplate(makeInput({ category, count: 3 }));
    expect(names.length).toBe(3);
    for (const n of names) {
      expect(n.id).toMatch(/^name_/);
      expect(n.name.length).toBeGreaterThan(0);
      expect(n.meaning.length).toBeGreaterThan(0);
    }
  });

  it('count 生效：按请求数量产出', () => {
    expect(generateNameTemplate(makeInput({ count: 1 }))).toHaveLength(1);
    expect(generateNameTemplate(makeInput({ count: 7 }))).toHaveLength(7);
  });

  it('count 越界被夹取到 1-10', () => {
    expect(generateNameTemplate(makeInput({ count: 0 }))).toHaveLength(1);
    expect(generateNameTemplate(makeInput({ count: 99 }))).toHaveLength(10);
  });

  it('同一输入重复调用产出稳定（确定性）', () => {
    const a = generateNameTemplate(makeInput());
    const b = generateNameTemplate(makeInput());
    expect(a.map((x) => x.name)).toEqual(b.map((x) => x.name));
  });

  it('不同主题产出不同组合', () => {
    const a = generateNameTemplate(makeInput({ topic: '火系' }));
    const b = generateNameTemplate(makeInput({ topic: '冰系' }));
    // 仅在首字样可能与主题无关时也可能偶同，但整体组合应存在差异（至少一条不同）
    const aNames = a.map((x) => x.name).join(',');
    const bNames = b.map((x) => x.name).join(',');
    expect(aNames).not.toBe(bNames);
  });

  it('含义会带上类别标签与主题上下文', () => {
    const names = generateNameTemplate(makeInput({ category: 'sect', topic: '剑宗', count: 1 }));
    expect(names[0].meaning).toContain(NAME_CATEGORY_LABEL['sect']);
    expect(names[0].meaning).toContain('剑宗');
  });
});