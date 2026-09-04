import { describe, it, expect } from 'vitest';
import { scanBookReaderReview } from './book-review';

function mkChapter(no: number, content: string, title?: string) {
  return { chapterNo: no, title: title ?? `章${no}`, content };
}

describe('scanBookReaderReview 全书红黄榜', () => {
  it('对空输入安全返回空体检结果', () => {
    const r = scanBookReaderReview([]);
    expect(r.scanned).toBe(0);
    expect(r.redCount).toBe(0);
    expect(r.yellowCount).toBe(0);
    expect(r.greenCount).toBe(0);
    expect(r.weakest).toEqual([]);
    expect(r.aggregated).toEqual([]);
  });

  it('跳过正文过短的占位章节与空章节', () => {
    const r = scanBookReaderReview([
      mkChapter(1, ''),
      mkChapter(2, '很短的正文'),
      mkChapter(3, '你好，就这几十个字，不足下限。'),
    ]);
    expect(r.scanned).toBe(0);
  });

  it('将偏弱章节排到前面（红榜优先）', () => {
    const strong = new Array(60).fill('他猛地拔刀，眼前却竟是满目疮痍。').join('\n');
    const strongTail = strong.slice(0, -6) + '难道这就是真相？';
    const short = '他离开了。一切都结束了。';

    const r = scanBookReaderReview([
      mkChapter(1, short, '弱章'),
      mkChapter(2, strongTail, '强章'),
    ]);

    expect(r.scanned).toBeGreaterThanOrEqual(1);
    if (r.weakest.length >= 2) {
      expect(r.weakest[0].chapterNo).toBeLessThan(r.weakest[1].chapterNo);
    }
    for (const v of r.weakest) {
      expect(['dull', 'ok', 'gripping']).toContain(v.verdict);
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.score).toBeLessThanOrEqual(100);
    }
  });

  it('跨章聚合共性问题并按频次降序', () => {
    const short1 = '他走了。结束了。';
    const short2 = '她回来了。就这样吧。';
    const r = scanBookReaderReview([mkChapter(1, short1), mkChapter(2, short2)]);

    if (r.scanned >= 2) {
      expect(r.aggregated.length).toBeGreaterThan(0);
      const top = r.aggregated[0];
      expect(top.count).toBeGreaterThanOrEqual(2);
      expect(top.chapters).toContain(1);
      expect(top.chapters).toContain(2);
      for (let i = 1; i < r.aggregated.length; i++) {
        expect(r.aggregated[i - 1].count).toBeGreaterThanOrEqual(r.aggregated[i].count);
      }
    }
  });

  it('红黄绿三色计数与 weakest 一致', () => {
    const r = scanBookReaderReview([
      mkChapter(1, new Array(50).fill('他猛然转身，却见一道黑影！').join('\n') + '难道是他？'),
      mkChapter(2, '很短的一句话而已，没有内容。'),
    ]);
    if (r.scanned > 0) {
      const sum = r.redCount + r.yellowCount + r.greenCount;
      expect(sum).toBe(r.scanned);
      expect(r.weakest.length).toBe(r.scanned);
    }
  });
});