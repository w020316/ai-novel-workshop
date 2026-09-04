// ============================================================================
// 全书级避撞体检 单测（纯函数；分帧 yield 改 async 后用例统一 await）
// ============================================================================
import { describe, it, expect } from 'vitest';
import { scanChaptersOriginality } from './scan';

describe('scanChaptersOriginality', () => {
  const tpl = (id: string, title: string, content: string) => ({ id, title, content });

  it('空章节列表返回空结果且 passed=true', async () => {
    const r = await scanChaptersOriginality([]);
    expect(r.scanned).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.totalHits).toBe(0);
    expect(r.topWorks).toEqual([]);
  });

  it('无撞梗章节全部通过，topWorks 为空', async () => {
    const r = await scanChaptersOriginality([
      tpl('c1', '第一章', '清早小镇的雾气漫过石阶，少年背起行囊走向渡口。'),
      tpl('c2', '第二章', '江上的白帆借着夜风离岸，船上人低声交谈着入冬的收成。'),
    ]);
    expect(r.scanned).toBe(2);
    expect(r.chaptersWithHits).toBe(0);
    expect(r.totalHits).toBe(0);
    expect(r.passed).toBe(true);
  });

  it('识别与平台代表作同名/同梗并在 topWorks 汇总跨章撞次', async () => {
    const r = await scanChaptersOriginality([
      tpl('c1', '第一章', '少年喃喃：三十年河东三十年河西，莫欺少年穷。'),
      tpl('c2', '第二章', '他被染香阁退婚，见证斗之气三段的耻辱。'),
      tpl('c3', '第三章', '凡人的戏院里唱着一出无关紧要的离合。'),
    ]);
    expect(r.totalHits).toBeGreaterThan(0);
    expect(r.chaptersWithHits).toBeGreaterThanOrEqual(2);
    const hitOne = r.hits.some((h) => h.chapterId === 'c1');
    const hitTwo = r.hits.some((h) => h.chapterId === 'c2');
    expect(hitOne && hitTwo).toBe(true);
    // 跨章去重：斗破苍穹在 c1、c2 两章均撞 → count 2
    const dp = r.topWorks.find((w) => w.workTitle === '斗破苍穹');
    expect(dp).toBeTruthy();
    if (dp) {
      expect(dp.count).toBeGreaterThanOrEqual(2);
      expect(dp.chapters).toContain('c1');
      expect(dp.chapters).toContain('c2');
    }
  });

  it('实时榜单热书同名命中同样被纳入全书扫描', async () => {
    const r = await scanChaptersOriginality(
      [
        tpl('c1', '第一章', '这故事名叫《盘点万界战力等级》你得记得。'),
        tpl('c2', '第二章', '一切都寻常。'),
      ],
      { liveTitles: ['盘点万界战力等级'] }
    );
    expect(r.totalHits).toBe(1);
    expect(r.hits[0].chapterId).toBe('c1');
    expect(r.topWorks[0].workTitle).toBe('盘点万界战力等级');
  });

  it('空正文章节被跳过不计入 scanned', async () => {
    const r = await scanChaptersOriginality([
      tpl('c1', '第一章', ''),
      tpl('c2', '第二章', '   '),
      tpl('c3', '第三章', '有内容的正文。'),
    ]);
    expect(r.scanned).toBe(1);
  });

  it('topN 非法值（0/负数）安全回退为 5，不产生 slice 负数语义', async () => {
    const r = await scanChaptersOriginality([
      tpl('c1', '第一章', '少年喃喃：三十年河东三十年河西，莫欺少年穷。'),
    ], { topN: 0 });
    expect(r.totalHits).toBeGreaterThan(0);
    expect(r.topWorks.length).toBeGreaterThan(0);
  });
});
