// ============================================================================
// 中期记忆查询测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMidTermMemory } from './mid-term';
import type { Foreshadowing } from '@/types';

vi.mock('@/lib/db/queries', () => ({
  listChapterSummaries: vi.fn(),
  listForeshadowings: vi.fn(),
}));

import { listChapterSummaries, listForeshadowings } from '@/lib/db/queries';

describe('loadMidTermMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应在无数据时返回空记忆', async () => {
    vi.mocked(listChapterSummaries).mockResolvedValue([]);
    vi.mocked(listForeshadowings).mockResolvedValue([]);

    const result = await loadMidTermMemory('proj-1', 1, '测试查询');
    expect(result.relevantSummaries).toEqual([]);
    expect(result.activePlotThreads).toEqual([]);
    expect(result.foreshadowingsToRecover).toEqual([]);
  });

  it('应返回相邻章节摘要', async () => {
    const summaries = [
      { id: 's1', projectId: 'proj-1', chapterId: 'ch1', chapterNo: 1, volumeNo: 1, summary: '第一章摘要', keyEvents: [], characterStates: {}, embedding: new Float32Array(384), createdAt: 100 },
      { id: 's2', projectId: 'proj-1', chapterId: 'ch2', chapterNo: 2, volumeNo: 1, summary: '第二章摘要', keyEvents: [], characterStates: {}, embedding: new Float32Array(384), createdAt: 200 },
    ];
    vi.mocked(listChapterSummaries).mockResolvedValue(summaries);
    vi.mocked(listForeshadowings).mockResolvedValue([]);

    const result = await loadMidTermMemory('proj-1', 3, '');
    expect(result.relevantSummaries.length).toBeGreaterThan(0);
  });

  it('待回收伏笔应包含状态为 pending 的伏笔', async () => {
    vi.mocked(listChapterSummaries).mockResolvedValue([]);
    vi.mocked(listForeshadowings).mockResolvedValue([
      { id: 'f1', projectId: 'proj-1', description: '伏笔1', setupChapter: 1, importance: 'high', status: 'pending', relatedCharacters: [], createdAt: 0 },
      { id: 'f2', projectId: 'proj-1', description: '伏笔2', setupChapter: 2, importance: 'medium', status: 'pending', relatedCharacters: [], createdAt: 0 },
      { id: 'f3', projectId: 'proj-1', description: '伏笔3', setupChapter: 1, importance: 'low', status: 'recovered', relatedCharacters: [], createdAt: 0 },
    ] as Foreshadowing[]);

    const result = await loadMidTermMemory('proj-1', 3, '测试');
    expect(result.foreshadowingsToRecover).toHaveLength(2);
  });

  it('同一章命中多个状态时应合并而非覆盖（修复 last-write-wins）', async () => {
    const summaries = [
      { id: 's1', projectId: 'proj-1', chapterId: 'ch1', chapterNo: 1, volumeNo: 1, summary: '主角重伤之后闭关突破', keyEvents: [], characterStates: {}, embedding: new Float32Array(384), createdAt: 100 },
    ];
    vi.mocked(listChapterSummaries).mockResolvedValue(summaries);
    vi.mocked(listForeshadowings).mockResolvedValue([]);

    const result = await loadMidTermMemory('proj-1', 2, '');
    // 修复前：只留下后遍历到的「突破」；修复后：两状态合并
    expect(result.characterStates['chapter_1']).toBe('受伤、突破');
  });

  it('TF-IDF 索引签名缓存：摘要集合未变时两次检索结果一致', async () => {
    const summaries = [
      { id: 's1', projectId: 'proj-1', chapterId: 'ch1', chapterNo: 1, volumeNo: 1, summary: '主角在宗门修炼剑法', keyEvents: [], characterStates: {}, embedding: new Float32Array(384), createdAt: 100 },
      { id: 's2', projectId: 'proj-1', chapterId: 'ch2', chapterNo: 2, volumeNo: 1, summary: '女主角追查家族阴谋', keyEvents: [], characterStates: {}, embedding: new Float32Array(384), createdAt: 200 },
    ];
    vi.mocked(listChapterSummaries).mockResolvedValue(summaries);
    vi.mocked(listForeshadowings).mockResolvedValue([]);

    const r1 = await loadMidTermMemory('proj-1', 3, '修炼剑法');
    const r2 = await loadMidTermMemory('proj-1', 3, '修炼剑法');
    // 第二次走缓存复用，结果必须一致
    expect(r2.relevantSummaries.map((s) => s.chapterId)).toEqual(
      r1.relevantSummaries.map((s) => s.chapterId)
    );
    expect(r1.relevantSummaries[0]?.chapterId).toBe('ch1');
  });
});