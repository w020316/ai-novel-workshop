import { describe, it, expect } from 'vitest';
import { buildTimeline, MAX_EVENTS_PER_CHAPTER } from './timeline';

describe('buildTimeline', () => {
  it('空输入返回空时间线', () => {
    expect(buildTimeline([], [], [])).toEqual([]);
  });

  it('按卷分组、按章排序，并带卷标题', () => {
    const groups = buildTimeline(
      [
        { chapterNo: 3, volumeNo: 1, title: 'c3' },
        { chapterNo: 1, volumeNo: 1, title: 'c1' },
        { chapterNo: 2, volumeNo: 2, title: 'c2' },
      ],
      [],
      [
        { volumeNo: 1, title: '第一卷·崛起' },
        { volumeNo: 2, title: '第二卷·风波' },
      ]
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].volumeNo).toBe(1);
    expect(groups[0].volumeTitle).toBe('第一卷·崛起');
    expect(groups[0].items.map((i) => i.chapterNo)).toEqual([1, 3]);
    expect(groups[1].items.map((i) => i.chapterNo)).toEqual([2]);
  });

  it('关键事件按章挂载、空事件过滤、超限截断', () => {
    const groups = buildTimeline(
      [
        { chapterNo: 1, volumeNo: 1, title: 'a' },
        { chapterNo: 2, volumeNo: 1, title: 'b' },
      ],
      [
        { chapterNo: 1, keyEvents: ['觉醒', '', '拜师', '夺宝', '突破'] },
        { chapterNo: 2, keyEvents: [] },
      ]
    );
    expect(groups[0].items[0].keyEvents).toEqual(['觉醒', '拜师', '夺宝']);
    expect(groups[0].items[0].keyEvents.length).toBeLessThanOrEqual(MAX_EVENTS_PER_CHAPTER);
    expect(groups[0].items[1].keyEvents).toEqual([]);
  });

  it('无摘要的章节也能上时间线（仅标题）', () => {
    const groups = buildTimeline([{ chapterNo: 5, volumeNo: 3, title: 'ch5' }], []);
    expect(groups[0].volumeNo).toBe(3);
    expect(groups[0].items).toEqual([{ chapterNo: 5, title: 'ch5', keyEvents: [] }]);
  });

  it('纯函数确定性：同输入同输出', () => {
    const chapters = [
      { chapterNo: 1, volumeNo: 1, title: 'a' },
      { chapterNo: 2, volumeNo: 1, title: 'b' },
    ];
    const summaries = [{ chapterNo: 1, keyEvents: ['开局'] }];
    expect(buildTimeline(chapters, summaries)).toEqual(buildTimeline(chapters, summaries));
  });
});
