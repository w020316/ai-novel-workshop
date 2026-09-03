import { describe, it, expect } from 'vitest';
import { generateOutlineTemplate } from './template';

describe('lib/outline/template', () => {
  it('已知题材返回 4 卷骨架、主线与结局', () => {
    const t = generateOutlineTemplate('玄幻');
    expect(t.volumes).toHaveLength(4);
    expect(t.mainPlotline.length).toBeGreaterThan(10);
    expect(t.ending.length).toBeGreaterThan(0);
    expect(t.volumes[0].title).toContain('玄幻');
  });

  it('分卷 volumeNo 与章节范围连续递增', () => {
    const t = generateOutlineTemplate('悬疑');
    const nos = t.volumes.map((v) => v.volumeNo);
    expect(nos).toEqual([1, 2, 3, 4]);
    for (const v of t.volumes) {
      expect(v.chapterRange[1]).toBeGreaterThan(v.chapterRange[0]);
      expect(Number.isInteger(v.chapterRange[0])).toBe(true);
    }
  });

  it('未收录题材回退通用模板（仍返回 4 卷）', () => {
    const t = generateOutlineTemplate('奇怪题材');
    expect(t.volumes).toHaveLength(4);
    expect(t.mainPlotline.length).toBeGreaterThan(10);
  });

  it('各卷均有摘要与核心冲突文本', () => {
    const t = generateOutlineTemplate('都市');
    for (const v of t.volumes) {
      expect(v.summary.trim().length).toBeGreaterThan(0);
      expect(v.coreConflict.trim().length).toBeGreaterThan(0);
    }
  });

  it('每次返回的分卷数组互相独立（可安全编辑）', () => {
    const a = generateOutlineTemplate('历史');
    const b = generateOutlineTemplate('历史');
    a.volumes[0].title = '被我改掉了';
    expect(b.volumes[0].title).not.toBe('被我改掉了');
  });
});