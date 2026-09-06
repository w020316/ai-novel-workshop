// ============================================================================
// 三线并行卷级规划 单元测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { threeLinesDesign, formatThreeLines } from './three-lines';
import { planVolumes } from './volume-plan';

describe('lib/outline/three-lines（三线并行卷级规划）', () => {
  it('首卷埋暗线种子并开设支线，末卷三线合流并收束支线', () => {
    const first = threeLinesDesign(0, 7);
    expect(first.hidden).toContain('暗线第一颗种子');
    expect(first.subplot).toContain('开设 1 条配角支线');

    const last = threeLinesDesign(6, 7);
    expect(last.hidden).toContain('合流引爆');
    expect(last.hidden).toContain('回收全部伏笔');
    expect(last.subplot).toContain('收束');
  });

  it('倒数第二卷：支线反哺主线，暗线与主线首次交汇', () => {
    for (const n of [4, 7, 12]) {
      const a = threeLinesDesign(n - 2, n);
      expect(a.subplot).toContain('反哺主线');
      expect(a.hidden).toContain('首次正面交汇');
      expect(a.mainline).toContain('真相揭露或巨大危机');
    }
  });

  it('中间各卷：主线压抑释放交替、支线节奏交错、暗线递增碎片', () => {
    const vs = planVolumes(1_000_000); // 7 卷
    for (let i = 1; i < vs.length - 2; i++) {
      const a = threeLinesDesign(i, vs.length);
      expect(a.mainline).toContain('压抑与释放');
      expect(a.subplot).toContain('节奏交错');
      expect(a.hidden).toContain('碎片线索');
    }
  });

  it('每卷均给出三线篇幅比例参考', () => {
    for (const n of [4, 7, 12]) {
      for (let i = 0; i < n; i++) {
        const a = threeLinesDesign(i, n);
        expect(a.mainline.length).toBeGreaterThan(6);
        expect(a.subplot.length).toBeGreaterThan(6);
        expect(a.hidden.length).toBeGreaterThan(6);
      }
    }
    expect(threeLinesDesign(1, 4).mainline).toContain('50-60%');
    expect(threeLinesDesign(0, 4).subplot).toContain('40%');
  });

  it('formatThreeLines 输出包含三线要素的结构化文本', () => {
    const text = formatThreeLines(threeLinesDesign(0, 4));
    expect(text).toContain('三线安排');
    expect(text).toContain('主线——');
    expect(text).toContain('支线——');
    expect(text).toContain('暗线——');
  });

  it('接入 planVolumes：每卷摘要自动携带三线安排（不破坏原有语句）', () => {
    const vs = planVolumes(1_000_000, '玄幻');
    for (const v of vs) {
      expect(v.summary).toContain('三线安排');
      expect(v.summary).toContain('主线——');
    }
    // 期待感设计与原有语句保留
    expect(vs[0].summary).toContain('期待感设计');
    expect(vs[vs.length - 1].summary).toContain('呼应开头伏笔');
  });
});
