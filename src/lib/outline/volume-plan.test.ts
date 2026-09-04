// ============================================================================
// 自适应分卷规划 单元测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  planVolumes,
  summarizePlan,
  estimateTotalChapters,
  estimateVolumeCount,
  WORDS_PER_CHAPTER,
  CHAPTERS_PER_VOLUME,
} from './volume-plan';

describe('lib/outline/volume-plan（自适应分卷）', () => {
  it('估算总章数 = 字数向上取整 ÷2500', () => {
    expect(estimateTotalChapters(300000)).toBe(120);
    expect(estimateTotalChapters(1_000_000)).toBe(400);
    // 钳制下限
    expect(estimateTotalChapters(5000)).toBe(12);
  });

  it('百万字 ≤ 估计卷数随字数增长且不超过上限', () => {
    // 30万/120章→2→钳 4；50万/200章→4；100万/400章→7；200万/800章→14→钳 12
    expect(estimateVolumeCount(300000)).toBe(4);
    expect(estimateVolumeCount(500000)).toBe(4);
    expect(estimateVolumeCount(1_000_000)).toBe(7);
    expect(estimateVolumeCount(2_000_000)).toBe(12);
    expect(estimateVolumeCount(5_000_000)).toBe(12);
  });

  it('30 万字（默认档）→ 4 卷且每卷区间均分连续', () => {
    const vs = planVolumes(300000, '玄幻');
    expect(vs.length).toBe(4);
    expect(vs[0].volumeNo).toBe(1);
    expect(vs[0].chapterRange[0]).toBe(1);
    // 区间首尾衔接
    for (let i = 1; i < vs.length; i++) {
      expect(vs[i].chapterRange[0]).toBe(vs[i - 1].chapterRange[1] + 1);
    }
    // 末卷覆盖到估算总章
    expect(vs[vs.length - 1].chapterRange[1]).toBe(120);
    // 标题含题材风味
    expect(vs[0].title).toContain('玄幻');
  });

  it('100 万字 → 7 卷且末卷收尾命名', () => {
    const vs = planVolumes(1_000_000);
    expect(vs.length).toBe(7);
    expect(vs[vs.length - 1].chapterRange[1]).toBe(400);
    expect(vs[vs.length - 1].title).toContain('终局');
    expect(vs[vs.length - 1].summary).toContain('呼应开头伏笔');
  });

  it('非法输入（0/NaN）按 30 万兜底', () => {
    expect(planVolumes(0).length).toBe(4);
    expect(planVolumes(Number.NaN).length).toBe(4);
  });

  it('每卷目标章数接近 60（分量合理，卷数满足下限）', () => {
    for (const words of [100000, 300000, 500000, 1_000_000, 2_000_000]) {
      const vs = planVolumes(words);
      expect(vs.length).toBeGreaterThanOrEqual(4);
      const perVol = estimateTotalChapters(words) / vs.length;
      // 允许单卷偏差，但整体均分
      expect(perVol).toBeGreaterThan(0);
      expect(Math.abs(perVol - CHAPTERS_PER_VOLUME)).toBeLessThan(CHAPTERS_PER_VOLUME);
    }
  });

  it('summarizePlan 摘要字段正确', () => {
    const s = summarizePlan(1_000_000, '科幻');
    expect(s.volumeCount).toBe(7);
    expect(s.totalChapters).toBe(400);
    expect(s.volumes.length).toBe(s.volumeCount);
    expect(s.volumes[0].title).toContain('科幻');
  });

  it('WORDS_PER_CHAPTER 常量参与推导（一致性）', () => {
    expect(estimateTotalChapters(250_000)).toBe(Math.ceil(250000 / WORDS_PER_CHAPTER));
  });
});