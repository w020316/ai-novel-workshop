import { describe, it, expect } from 'vitest';
import {
  RANK_SOURCES,
  GENRE_TRENDS,
  getTrend,
  deriveTrendHints,
} from './trends';

describe('lib/trend/trends', () => {
  it('内置 5 个平台渠道', () => {
    expect(RANK_SOURCES.length).toBeGreaterThanOrEqual(5);
    expect(RANK_SOURCES.some((s) => s.id === 'qidian')).toBe(true);
  });

  it('每个题材画像字段完整', () => {
    for (const t of GENRE_TRENDS) {
      expect(t.genre).toBeTruthy();
      expect(t.hotspot.length).toBeGreaterThan(3);
      expect(t.tropes.length).toBeGreaterThanOrEqual(1);
      expect(t.contrast.length).toBeGreaterThanOrEqual(1);
      expect(t.words.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('getTrend 渠道×题材返回正确分析', () => {
    const t = getTrend('qidian', '玄幻');
    expect(t).not.toBeNull();
    expect(t!.sourceName).toBe('起点中文网');
    expect(t!.genre).toBe('玄幻');
  });

  it('未知渠道返回 null', () => {
    expect(getTrend('no-such', '玄幻')).toBeNull();
  });

  it('未知题材回退到「其他」', () => {
    const t = getTrend('fanqie', '火星文');
    expect(t).not.toBeNull();
    expect(t!.genre).toBe('其他');
  });

  it('deriveTrendHints 派生可读建议', () => {
    const t = getTrend('jinjiang', '言情')!;
    const hints = deriveTrendHints(t);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.join('')).toContain('晋江文学城');
  });
});