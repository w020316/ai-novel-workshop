import { describe, it, expect, beforeEach } from 'vitest';
import { useShortTermMemory } from './short-term-memory';
import type { ChapterSummary } from '@/types';

function summary(id: string, chapterNo: number): ChapterSummary {
  return {
    id,
    projectId: 'p1',
    chapterId: `ch_${chapterNo}`,
    chapterNo,
    volumeNo: 1,
    summary: `第${chapterNo}章摘要`,
    keyEvents: [],
    characterStates: {},
    embedding: new Float32Array(384),
    createdAt: Date.now(),
  };
}

describe('lib/store/short-term-memory', () => {
  beforeEach(() => {
    useShortTermMemory.getState().clear();
  });

  it('初始状态为空', () => {
    const s = useShortTermMemory.getState();
    expect(s.prevChapters).toEqual([]);
    expect(s.currentDraft).toBe('');
    expect(s.currentPlotPoints).toEqual([]);
    expect(s.activeCharacterIds).toEqual([]);
  });

  it('setPrevChapters 仅保留最近 3 章', () => {
    useShortTermMemory.getState().setPrevChapters([
      summary('a', 1),
      summary('b', 2),
      summary('c', 3),
      summary('d', 4),
    ]);
    const ids = useShortTermMemory
      .getState()
      .prevChapters.map((c) => c.chapterNo);
    expect(ids).toEqual([2, 3, 4]);
  });

  it('addPrevChapter 追加并限制为最近 3 章', () => {
    const s = useShortTermMemory.getState();
    s.addPrevChapter(summary('a', 1));
    s.addPrevChapter(summary('b', 2));
    s.addPrevChapter(summary('c', 3));
    s.addPrevChapter(summary('d', 4));
    expect(useShortTermMemory.getState().prevChapters.map((c) => c.chapterNo)).toEqual([2, 3, 4]);
  });

  it('setCurrentDraft 覆盖草稿', () => {
    useShortTermMemory.getState().setCurrentDraft('第一版');
    expect(useShortTermMemory.getState().currentDraft).toBe('第一版');
    useShortTermMemory.getState().setCurrentDraft('第二版');
    expect(useShortTermMemory.getState().currentDraft).toBe('第二版');
  });

  it('appendToCurrentDraft 追加而非覆盖', () => {
    const s = useShortTermMemory.getState();
    s.setCurrentDraft('开头');
    s.appendToCurrentDraft('中段');
    s.appendToCurrentDraft('结尾');
    expect(useShortTermMemory.getState().currentDraft).toBe('开头中段结尾');
  });

  it('setCurrentPlotPoints / setActiveCharacterIds 写入对应字段', () => {
    const s = useShortTermMemory.getState();
    s.setCurrentPlotPoints(['主线A', '主线B']);
    s.setActiveCharacterIds(['ch1', 'ch2']);
    const after = useShortTermMemory.getState();
    expect(after.currentPlotPoints).toEqual(['主线A', '主线B']);
    expect(after.activeCharacterIds).toEqual(['ch1', 'ch2']);
  });

  it('clear 重置所有字段', () => {
    const s = useShortTermMemory.getState();
    s.setPrevChapters([summary('a', 1)]);
    s.setCurrentDraft('正文');
    s.setCurrentPlotPoints(['p']);
    s.setActiveCharacterIds(['x']);
    s.clear();
    const after = useShortTermMemory.getState();
    expect(after.prevChapters).toEqual([]);
    expect(after.currentDraft).toBe('');
    expect(after.currentPlotPoints).toEqual([]);
    expect(after.activeCharacterIds).toEqual([]);
  });
});