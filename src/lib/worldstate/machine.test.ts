import { describe, it, expect } from 'vitest';
import { buildWorldState, THREAD_STAGNANT_GAP, type WorldStateInput } from './machine';

function baseInput(): WorldStateInput {
  return {
    chapters: [],
    plotThreads: [],
    foreshadowings: [],
    summaries: [],
  };
}

describe('buildWorldState', () => {
  it('空项目：全部为零值且无风险', () => {
    const snap = buildWorldState(baseInput());
    expect(snap.totalChapters).toBe(0);
    expect(snap.latestChapterNo).toBe(0);
    expect(snap.totalWords).toBe(0);
    expect(snap.holes).toEqual([]);
    expect(snap.volumeProgress).toEqual([]);
    expect(snap.threads).toEqual([]);
    expect(snap.foreshadowProgress.overdue).toEqual([]);
    expect(snap.characterPresence).toEqual([]);
    expect(snap.risks).toEqual([]);
    expect(snap.progressPct).toBeUndefined();
  });

  it('时间线进度：统计字数、卷进度与计划完结百分比', () => {
    const snap = buildWorldState({
      ...baseInput(),
      chapters: [
        { chapterNo: 1, volumeNo: 1, title: 'a', wordCount: 2000 },
        { chapterNo: 2, volumeNo: 1, title: 'b', wordCount: 3000 },
        { chapterNo: 3, volumeNo: 2, title: 'c', wordCount: 1000 },
      ],
      plannedEndChapter: 10,
    });
    expect(snap.totalChapters).toBe(3);
    expect(snap.latestChapterNo).toBe(3);
    expect(snap.latestVolumeNo).toBe(2);
    expect(snap.totalWords).toBe(6000);
    expect(snap.progressPct).toBe(30);
    expect(snap.volumeProgress).toEqual([
      { volumeNo: 1, chapters: 2, words: 5000 },
      { volumeNo: 2, chapters: 1, words: 1000 },
    ]);
  });

  it('章号空洞：删除留下的洞被识别', () => {
    const snap = buildWorldState({
      ...baseInput(),
      chapters: [
        { chapterNo: 1, volumeNo: 1, title: 'a', wordCount: 100 },
        { chapterNo: 4, volumeNo: 1, title: 'd', wordCount: 100 },
      ],
    });
    expect(snap.holes).toEqual([2, 3]);
    expect(snap.risks.some((r) => r.includes('章号空洞'))).toBe(true);
  });

  it('情节线：active 主线停滞、resolved 线不算停滞', () => {
    const snap = buildWorldState({
      ...baseInput(),
      chapters: Array.from({ length: 20 }, (_, i) => ({
        chapterNo: i + 1,
        volumeNo: 1,
        title: `ch${i + 1}`,
        wordCount: 100,
      })),
      plotThreads: [
        { id: 't1', name: '夺嫡主线', type: 'main', status: 'active', relatedChapters: [1, 2] },
        { id: 't2', name: '感情线', type: 'subplot', status: 'resolved', relatedChapters: [3] },
        { id: 't3', name: '门派恩怨', type: 'subplot', status: 'active', relatedChapters: [5, 6] },
      ],
    });
    const t1 = snap.threads.find((t) => t.id === 't1')!;
    expect(t1.stagnant).toBe(true);
    expect(t1.lastChapter).toBe(2);
    // resolved 线即使不推进也不算停滞
    expect(snap.threads.find((t) => t.id === 't2')!.stagnant).toBe(false);
    // 20-6=14 < 15 未停滞
    expect(snap.threads.find((t) => t.id === 't3')!.stagnant).toBe(false);
    expect(snap.risks.some((r) => r.includes('主线「夺嫡主线」'))).toBe(true);
  });

  it(`停滞阈值：恰好 ${THREAD_STAGNANT_GAP} 章未推进即判定停滞`, () => {
    const latest = THREAD_STAGNANT_GAP + 1; // 16 章，主线只在第 1 章推进 → 16-1=15 触发
    const snap = buildWorldState({
      ...baseInput(),
      chapters: Array.from({ length: latest }, (_, i) => ({
        chapterNo: i + 1,
        volumeNo: 1,
        title: `ch${i + 1}`,
        wordCount: 100,
      })),
      plotThreads: [
        { id: 't1', name: '主线', type: 'main', status: 'active', relatedChapters: [1] },
      ],
    });
    expect(snap.threads[0].stagnant).toBe(true);
  });

  it('伏笔进度：逾期未收按计划回收章排序', () => {
    const snap = buildWorldState({
      ...baseInput(),
      chapters: Array.from({ length: 10 }, (_, i) => ({
        chapterNo: i + 1,
        volumeNo: 1,
        title: `ch${i + 1}`,
        wordCount: 100,
      })),
      foreshadowings: [
        { id: 'f1', description: '神秘令牌', setupChapter: 1, status: 'planted', plannedRecoveryChapter: 5 },
        { id: 'f2', description: '旧信', setupChapter: 2, status: 'recovered', actualRecoveryChapter: 8 },
        { id: 'f3', description: '远方来信', setupChapter: 3, status: 'planted', plannedRecoveryChapter: 12 },
        { id: 'f4', description: '弃坑线', setupChapter: 4, status: 'abandoned' },
      ],
    });
    expect(snap.foreshadowProgress.planted).toBe(2);
    expect(snap.foreshadowProgress.recovered).toBe(1);
    expect(snap.foreshadowProgress.abandoned).toBe(1);
    expect(snap.foreshadowProgress.overdue.map((f) => f.id)).toEqual(['f1']);
    expect(snap.risks.some((r) => r.includes('1 处伏笔'))).toBe(true);
  });

  it('人物在场：按出场章数降序、末次状态取最新章', () => {
    const snap = buildWorldState({
      ...baseInput(),
      summaries: [
        { chapterNo: 1, characterStates: { 林凡: '重伤', 苏婉: '初遇' } },
        { chapterNo: 3, characterStates: { 林凡: '突破' } },
        { chapterNo: 2, characterStates: { 苏婉: '离城' } },
      ],
    });
    expect(snap.characterPresence[0]).toEqual({
      name: '林凡',
      appearances: 2,
      lastChapterNo: 3,
      lastState: '突破',
    });
    expect(snap.characterPresence[1].name).toBe('苏婉');
    expect(snap.characterPresence[1].lastState).toBe('离城');
  });

  it('人物在场：超过 12 人截断，空名跳过', () => {
    const summaries = Array.from({ length: 15 }, (_, i) => ({
      chapterNo: i + 1,
      characterStates: { [`人物${i + 1}`]: '在场', ' ': '' },
    }));
    const snap = buildWorldState({ ...baseInput(), summaries });
    expect(snap.characterPresence).toHaveLength(12);
    expect(snap.characterPresence.every((p) => p.name.trim() !== '')).toBe(true);
  });

  it('纯函数确定性：相同输入两次结果一致', () => {
    const input: WorldStateInput = {
      chapters: [{ chapterNo: 1, volumeNo: 1, title: 'a', wordCount: 500 }],
      plotThreads: [{ id: 't', name: '主', type: 'main', status: 'active', relatedChapters: [1] }],
      foreshadowings: [{ id: 'f', description: 'x', setupChapter: 1, status: 'planted' }],
      summaries: [{ chapterNo: 1, characterStates: { A: 's' } }],
    };
    expect(buildWorldState(input)).toEqual(buildWorldState(input));
  });
});
