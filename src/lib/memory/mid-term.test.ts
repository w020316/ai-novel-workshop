// ============================================================================
// 中期记忆查询测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMidTermMemory, deriveMidTermFromLongTerm } from './mid-term';
import type { Foreshadowing, LongTermMemory } from '@/types';

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

describe('deriveMidTermFromLongTerm（需求 11：中期记忆从长期记忆衍生）', () => {
  const longTerm: LongTermMemory = {
    worldview: null,
    characters: [
      { id: 'c1', projectId: 'p', name: '林动', role: 'protagonist', appearance: '', personality: '坚韧不屈，越挫越勇', catchphrase: '', background: '', motivation: '为父报仇，登顶武道巅峰', weakness: '', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0 },
      { id: 'c2', projectId: 'p', name: '应欢欢', role: 'supporting', appearance: '', personality: 'P'.repeat(40), catchphrase: '', background: '', motivation: 'M'.repeat(40), weakness: '', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0 },
    ],
    outline: null,
    pendingForeshadowings: [
      { id: 'f1', projectId: 'p', description: '神秘石符的来历', setupChapter: 1, importance: 'high', status: 'pending', relatedCharacters: [], createdAt: 0 },
    ] as Foreshadowing[],
    stylePreset: null,
  };

  it('应从人物档案衍生「姓名 → 性格+执念」快照（50 字内）', () => {
    const derived = deriveMidTermFromLongTerm(longTerm);
    expect(derived.characterStates['林动']).toBe('坚韧不屈，越挫越勇；为父报仇，登顶武道巅峰');
    // 超长描述应被截到 50 字内
    expect(derived.characterStates['应欢欢'].length).toBeLessThanOrEqual(50);
    expect(derived.derivedFromLongTerm).toBe(true);
  });

  it('应沿用长期记忆的待回收伏笔，摘要与支线为空', () => {
    const derived = deriveMidTermFromLongTerm(longTerm);
    expect(derived.foreshadowingsToRecover).toEqual(longTerm.pendingForeshadowings);
    expect(derived.relevantSummaries).toEqual([]);
    expect(derived.activePlotThreads).toEqual([]);
  });

  it('性格与执念皆空的人物不应产出空快照', () => {
    const derived = deriveMidTermFromLongTerm({
      ...longTerm,
      characters: [
        { id: 'c3', projectId: 'p', name: '路人甲', role: 'minor', appearance: '', personality: '', catchphrase: '', background: '', motivation: '', weakness: '', growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0 },
      ],
    });
    expect(derived.characterStates).toEqual({});
  });
});