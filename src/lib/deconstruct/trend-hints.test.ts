// ============================================================================
// 拆书 · 平台相似风向参考测试（纯本地确定性逻辑，无 LLM 依赖）
// 说明：mock 掉 '@/lib/trend/trends'（平台风向数据属另一模块，单测只验证
//       题材匹配 → hints 组装的纯逻辑；mock 结构与真实 TrendAnalysis 对齐）。
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getTrendMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/trend/trends', () => ({ getTrend: getTrendMock }));

import { buildSimilarTrendHints } from './trend-hints';

/** 与真实 RANK_SOURCES 对齐的平台名 */
const FAKE_SOURCE_NAMES: Record<string, string> = {
  qidian: '起点中文网',
  fanqie: '番茄小说',
  jinjiang: '晋江文学城',
};

/** 与真实 TrendAnalysis 结构对齐的确定性风向数据 */
function fakeTrend(sourceId: string, genre: string) {
  return {
    sourceName: FAKE_SOURCE_NAMES[sourceId] ?? sourceId,
    sourceFocus: '测试口径',
    genre,
    hotspot: `${genre}高热方向`,
    tropes: [`${genre}桥段甲`, `${genre}桥段乙`, `${genre}桥段丙`, `${genre}桥段丁`],
    contrast: ['反差一', '反差二'],
    rhythm: 'fast' as const,
    hookPattern: '开篇即钩子',
    words: ['热词一', '热词二', '热词三', '热词四', '热词五'],
  };
}

describe('buildSimilarTrendHints（题材匹配 → 平台风向）', () => {
  beforeEach(() => {
    getTrendMock.mockReset();
    getTrendMock.mockImplementation(fakeTrend);
  });

  it('命中题材关键词时返回对应题材，hints 非空且含平台风向与差异化建议', () => {
    const r = buildSimilarTrendHints('人人都当他是上门赘婿，今日岳母当众把茶水泼在他脸上。');
    expect(r.genre).toBe('都市');
    expect(r.hints.length).toBe(4); // 3 个平台 + 1 条差异化建议
    expect(r.hints[0]).toContain('起点中文网');
    expect(r.hints[0]).toContain('都市');
    expect(r.hints[1]).toContain('番茄小说');
    // 高频桥段只取前 3 个
    expect(r.hints[0]).toContain('都市桥段丙');
    expect(r.hints[0]).not.toContain('都市桥段丁');
    expect(r.hints[r.hints.length - 1]).toContain('差异化建议');
  });

  it('命中末世关键词时返回末世题材风向', () => {
    const r = buildSimilarTrendHints('末世第三天，丧尸围城，他背着妹妹在废墟间求生。');
    expect(r.genre).toBe('末世');
    expect(r.hints.length).toBeGreaterThan(0);
    expect(getTrendMock).toHaveBeenCalledWith('qidian', '末世');
  });

  it('未命中任何关键词时回落「其他」，仍按「其他」取风向', () => {
    const r = buildSimilarTrendHints('天色渐晚，他坐在窗边看完了半本书，随后合上笔记出门散步。');
    expect(r.genre).toBe('其他');
    expect(r.hints.length).toBe(4);
    expect(getTrendMock).toHaveBeenCalledWith('qidian', '其他');
    expect(r.hints[r.hints.length - 1]).toContain('差异化建议');
  });

  it('空文本同样回落「其他」且不抛错', () => {
    const r = buildSimilarTrendHints('');
    expect(r.genre).toBe('其他');
    expect(r.hints.length).toBe(4);
  });

  it('某平台无风向数据（getTrend 返回 null）时跳过，仍保留差异化建议', () => {
    getTrendMock.mockReturnValue(null);
    const r = buildSimilarTrendHints('系统面板亮起，他接到了今日签到任务。');
    expect(r.hints.length).toBe(1);
    expect(r.hints[0]).toContain('差异化建议');
  });
});
