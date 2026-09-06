// ============================================================================
// 期待感卷级规划 单元测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { anticipationDesign, formatAnticipation } from './anticipation';
import { planVolumes } from './volume-plan';

describe('lib/outline/anticipation（期待感卷级规划）', () => {
  it('首卷埋天坑并抛出第一块碎片，末卷揭晓全貌', () => {
    const first = anticipationDesign(0, 7);
    expect(first.pitFragment).toContain('埋下终极天坑');
    expect(first.pitFragment).toContain('第一块');

    const last = anticipationDesign(6, 7);
    expect(last.pitFragment).toContain('揭晓终极天坑全貌');
  });

  it('中间各卷给出递增编号的碎片线索', () => {
    const vs = planVolumes(1_000_000); // 7 卷
    vs.forEach((v, i) => {
      if (i === 0 || i === vs.length - 1) return;
      expect(anticipationDesign(i, vs.length).pitFragment).toContain(`第 ${i + 1} 块天坑碎片`);
    });
  });

  it('每卷均有阶段性大奖与压抑→释放节奏，且末卷为至暗→终极释放', () => {
    for (const n of [4, 7, 12]) {
      for (let i = 0; i < n; i++) {
        const a = anticipationDesign(i, n);
        expect(a.grandPrize.length).toBeGreaterThan(6);
        expect(a.rhythm).toContain('→');
      }
    }
    expect(anticipationDesign(3, 4).rhythm).toContain('至暗时刻');
  });

  it('formatAnticipation 输出包含三要素的结构化文本', () => {
    const text = formatAnticipation(anticipationDesign(0, 4));
    expect(text).toContain('期待感设计');
    expect(text).toContain('本卷大奖');
    expect(text).toContain('节奏');
    expect(text).toContain('天坑线索');
  });

  it('接入 planVolumes：每卷摘要自动携带期待感设计（不破坏原有语句）', () => {
    const vs = planVolumes(1_000_000, '玄幻');
    for (const v of vs) {
      expect(v.summary).toContain('期待感设计');
      expect(v.summary).toContain('本卷大奖');
    }
    // 原有末卷语句保留
    expect(vs[vs.length - 1].summary).toContain('呼应开头伏笔');
    // 首卷设计在前段描述之后
    expect(vs[0].summary).toContain('第一重悬念');
  });
});
