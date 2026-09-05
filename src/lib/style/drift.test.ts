import { describe, it, expect } from 'vitest';
import {
  detectStyleDrift,
  phraseOverlap,
  RECENT_CHAPTER_WINDOW,
  MIN_BASELINE_CHAPTERS,
  type DriftChapterInput,
} from './drift';

/** 生成指定句长的中文正文（每句 `len` 个中文字符，共 `sentences` 句，句间无对话） */
function makeContent(len: number, sentences: number): string {
  const chars = '江湖夜雨十年灯孤舟蓑笠翁独钓寒江雪风起云涌时山高水远处';
  let out = '';
  for (let s = 0; s < sentences; s++) {
    let sentence = '';
    for (let i = 0; i < len; i++) {
      sentence += chars[(s * len + i) % chars.length];
    }
    out += sentence + '。';
  }
  return out;
}

/** 生成对话为主的正文（对话句 + 短叙述句，对话占比高） */
function makeDialogueContent(sentences: number): string {
  let out = '';
  for (let s = 0; s < sentences; s++) {
    out += `“今日之事不可拖延。”\n他冷声道。\n`;
  }
  return out;
}

function makeChapters(count: number, contentFn: (no: number) => string): DriftChapterInput[] {
  return Array.from({ length: count }, (_, i) => ({
    chapterNo: i + 1,
    content: contentFn(i + 1),
  }));
}

describe('phraseOverlap', () => {
  it('空集合返回 1（不告警）', () => {
    expect(phraseOverlap([], ['a'])).toBe(1);
    expect(phraseOverlap(['a'], [])).toBe(1);
  });

  it('完全重合为 1，完全不重合为 0', () => {
    expect(phraseOverlap(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(phraseOverlap(['a'], ['b'])).toBe(0);
  });

  it('部分重合按交集/较小集计算（对集合大小不对称稳健）', () => {
    // |∩|=1, min(|A|,|B|)=2
    expect(phraseOverlap(['a', 'b'], ['b', 'c'])).toBeCloseTo(0.5);
    // 小基线集全命中大近期集 → 1（Jaccard 会误判为低重合）
    expect(phraseOverlap(['a', 'b'], ['a', 'b', 'c', 'd', 'e'])).toBe(1);
  });
});

describe('detectStyleDrift', () => {
  it('空章节：insufficient 且无信号', () => {
    const r = detectStyleDrift([]);
    expect(r.level).toBe('insufficient');
    expect(r.signals).toHaveLength(0);
    expect(r.baseline).toBeNull();
    expect(r.recent.chapterRange).toBeNull();
  });

  it('章节不足（无预设且基线 < 3 章）：insufficient 并给出建议', () => {
    const r = detectStyleDrift(makeChapters(2, () => makeContent(15, 20)));
    expect(r.level).toBe('insufficient');
    expect(r.suggestions[0]).toContain('不足');
  });

  it('文风一致：normal 且无信号', () => {
    // 12 章 + 最近 5 章句长完全一致 → 无句长/对话漂移；
    // 词组来自相同字符循环，重合度高
    const chapters = makeChapters(12, () => makeContent(15, 20));
    const r = detectStyleDrift(chapters);
    expect(r.level).toBe('normal');
    expect(r.signals).toHaveLength(0);
    expect(r.baseline?.source).toBe('earlier-chapters');
    expect(r.baseline?.chapterRange).toEqual([1, 7]);
    expect(r.recent.chapterRange).toEqual([8, 12]);
  });

  it('句长剧变：alert 级 sentence-length 信号与建议', () => {
    // 前 12 章长句（20 字/句），最近 5 章短句（6 字/句）→ 偏差 > 35%
    const chapters = [
      ...makeChapters(7, () => makeContent(20, 20)),
      ...makeChapters(5, () => makeContent(6, 20)).map((c, i) => ({ ...c, chapterNo: 8 + i })),
    ];
    const r = detectStyleDrift(chapters);
    expect(r.level).toBe('alert');
    const sig = r.signals.find((s) => s.type === 'sentence-length');
    expect(sig).toBeDefined();
    expect(sig!.level).toBe('alert');
    expect(r.suggestions.join('')).toContain('句长');
  });

  it('对话占比突变：alert 级 dialogue-ratio 信号', () => {
    // 前 7 章纯叙述，最近 5 章对话密集
    const chapters = [
      ...makeChapters(7, () => makeContent(15, 20)),
      ...makeChapters(5, () => makeDialogueContent(15)).map((c, i) => ({ ...c, chapterNo: 8 + i })),
    ];
    const r = detectStyleDrift(chapters);
    const sig = r.signals.find((s) => s.type === 'dialogue-ratio');
    expect(sig).toBeDefined();
    expect(sig!.level).toBe('alert');
    expect(r.level).toBe('alert');
  });

  it('高频词组换血：phrase-overlap 信号', () => {
    // 基线与近期使用完全不同的字符集 → n-gram 重合度极低
    const baseChars = '山河壮丽千秋万代江山如画一时多少豪杰风流人物还看今朝岁月峥嵘';
    const recentChars = '星辰大海征途漫漫未来可期勇往直前无所畏惧光速飞船跃迁虫洞穿越';
    const gen = (chars: string) => (no: number) => {
      let out = '';
      for (let s = 0; s < 20; s++) {
        let sentence = '';
        for (let i = 0; i < 15; i++) sentence += chars[(no * 7 + s + i) % chars.length];
        out += sentence + '。';
      }
      return out;
    };
    const chapters = [
      ...makeChapters(7, gen(baseChars)),
      ...makeChapters(5, gen(recentChars)).map((c, i) => ({ ...c, chapterNo: 8 + i })),
    ];
    const r = detectStyleDrift(chapters);
    const sig = r.signals.find((s) => s.type === 'phrase-overlap');
    expect(sig).toBeDefined();
  });

  it('预设基线优先生效（source=preset）', () => {
    const chapters = makeChapters(10, () => makeContent(15, 20));
    // 先扫一次拿近期真实高频词组，保证预设词组与近期统计集完全重合
    const first = detectStyleDrift(chapters);
    const phrases = first.recent.topPhrases.slice(0, 2);
    expect(phrases.length).toBe(2);
    const r = detectStyleDrift(chapters, {
      preset: { avgSentenceLength: 15, dialogueRatio: 0.1, commonPhrases: phrases },
    });
    expect(r.baseline?.source).toBe('preset');
    expect(r.baseline?.label).toContain('预设');
    expect(r.level).toBe('normal');
  });

  it('最近窗口取 min(recentK, 总章数)', () => {
    const chapters = makeChapters(4, () => makeContent(15, 20));
    // 4 章中最近 5 窗口只能取 4 章 → 基线为 0 章 → insufficient
    const r = detectStyleDrift(chapters);
    expect(r.level).toBe('insufficient');

    // 显式 recentK=2 → 基线 2 章，仍不足 3
    const r2 = detectStyleDrift(chapters, { recentK: 2 });
    expect(r2.level).toBe('insufficient');
  });

  it(`默认窗口常量为 ${RECENT_CHAPTER_WINDOW}，最小基线为 ${MIN_BASELINE_CHAPTERS} 章`, () => {
    expect(RECENT_CHAPTER_WINDOW).toBe(5);
    expect(MIN_BASELINE_CHAPTERS).toBe(3);
  });

  it('纯函数确定性：相同输入两次结果一致', () => {
    const chapters = makeChapters(12, (no) => (no > 7 ? makeContent(8, 20) : makeContent(15, 20)));
    const a = detectStyleDrift(chapters);
    const b = detectStyleDrift([...chapters].reverse());
    expect(a).toEqual(b);
  });
});
