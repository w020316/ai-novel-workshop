// ============================================================================
// 原创性查重与规避测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { checkOriginality, buildAvoidance } from './check';
import { WORKS_DB, PLATFORMS, worksByPlatform, platformRankingHint, findWork } from './works-db';

describe('originality / checkOriginality', () => {
  it('原创文本：评分高且通过', () => {
    const text = '少女在雾镇的老码头打捞起一只会数数的银鱼，银鱼记得每一场涨潮的时辰与失踪船员的姓名。';
    const r = checkOriginality(text);
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.hits).toHaveLength(0);
  });

  it('命中经典代表作桥段：不通过并点名作品', () => {
    const text = '他冷冷道：“三十年河东，三十年河西，莫欺少年穷。”说完携异火转身离去。';
    const r = checkOriginality(text);
    expect(r.passed).toBe(false);
    const hit = r.hits.find((h) => h.workTitle === '斗破苍穹');
    expect(hit).toBeDefined();
    expect(hit!.matched).toContain('三十年河东');
  });

  it('直接引用作品名：按标题命中', () => {
    const r = checkOriginality('这部《诡秘之主》风格的设定我打算再改一改。');
    const hit = r.hits.find((h) => h.workTitle === '诡秘之主');
    expect(hit).toBeDefined();
  });

  it('题材过滤：跨题材桥段不误报', () => {
    // 「三十年河东」是玄幻梗，传都市题材库时不应命中玄幻作品
    const r = checkOriginality('他道：“三十年河东三十年河西。”', { genre: '都市' });
    const hit = r.hits.find((h) => h.workTitle === '斗破苍穹');
    expect(hit).toBeUndefined();
  });

  it('空文本：视为原创', () => {
    const r = checkOriginality('   ');
    expect(r.passed).toBe(true);
  });
});

describe('originality / buildAvoidance', () => {
  it('输出同题材规避负例与榜单参考', () => {
    const b = buildAvoidance({ genre: '玄幻', platformId: 'qidian' });
    expect(b.avoid.length).toBeGreaterThan(0);
    expect(b.prompt).toContain('原创性要求');
    expect(b.prompt).toContain('斗破苍穹');
    expect(b.rankingHint).toContain('起点中文网');
    expect(b.rankingHint).toContain('代表作参考');
  });

  it('premise 前置反馈，排首位', () => {
    const b = buildAvoidance({ premise: '这是我的原创设定：死海盐官在月下记账。' });
    expect(b.prompt.startsWith('这是我的原创设定：')).toBe(true);
  });

  it('无题材时退化为全库负例', () => {
    const b = buildAvoidance({});
    expect(b.avoid.length).toBeGreaterThanOrEqual(1);
  });
});

describe('originality / works-db', () => {
  it('平台与作品数量自洽', () => {
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(5);
    expect(WORKS_DB.length).toBeGreaterThanOrEqual(10);
    const allPlatformIds = new Set(PLATFORMS.map((p) => p.id));
    for (const w of WORKS_DB) {
      expect(allPlatformIds.has(w.platform)).toBe(true);
    }
  });

  it('worksByPlatform 与 findWork 可用', () => {
    expect(worksByPlatform('jinjiang').length).toBeGreaterThan(0);
    expect(findWork('斗破苍穹')?.genre).toBe('玄幻');
  });

  it('platformRankingHint 非空', () => {
    expect(platformRankingHint('fanqie')).toContain('番茄小说');
  });
});
