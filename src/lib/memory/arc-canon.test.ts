import { describe, it, expect, vi, beforeEach } from 'vitest';
import { maybeUpdateArcCanon, regenerateArcCanon } from './arc-canon';
import type { ArcCanon, Chapter, ChapterSummary } from '@/types';

vi.mock('@/lib/db/queries', () => ({
  getArcCanon: vi.fn(),
  saveArcCanon: vi.fn(),
  listChapterSummaries: vi.fn(),
}));

vi.mock('@/lib/llm/generators/arc-canon', () => ({
  shouldUpdateCanon: vi.fn(),
  deterministicCanonText: vi.fn(),
  compressCanonViaLLM: vi.fn(),
}));

import { getArcCanon, saveArcCanon, listChapterSummaries } from '@/lib/db/queries';
import {
  shouldUpdateCanon,
  deterministicCanonText,
  compressCanonViaLLM,
} from '@/lib/llm/generators/arc-canon';

const mockChapter: Chapter = {
  id: 'ch20',
  projectId: 'proj1',
  volumeNo: 1,
  chapterNo: 20,
  title: '第二十章',
  plotPoints: ['推进'],
  content: '正文',
  wordCount: 1000,
  status: 'completed',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function makeSummary(chapterNo: number): ChapterSummary {
  return {
    id: `summary_ch${chapterNo}`,
    projectId: 'proj1',
    chapterId: `ch${chapterNo}`,
    chapterNo,
    volumeNo: 1,
    summary: `第${chapterNo}章摘要`,
    keyEvents: [],
    characterStates: {},
    embedding: new Float32Array(384),
    createdAt: Date.now(),
  };
}

const existingCanon: ArcCanon = {
  id: 'canon_proj1',
  projectId: 'proj1',
  canonText: '旧纲要',
  upToDateChapterNo: 10,
  fromLLM: true,
  updatedAt: 0,
};

describe('memory/arc-canon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('maybeUpdateArcCanon', () => {
    it('未达间隔时应跳过且不写库', async () => {
      (getArcCanon as ReturnType<typeof vi.fn>).mockResolvedValue(existingCanon);
      (shouldUpdateCanon as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await maybeUpdateArcCanon('proj1', mockChapter);

      expect(result).toBe(existingCanon);
      expect(saveArcCanon).not.toHaveBeenCalled();
    });

    it('达间隔且 LLM 成功时保存 LLM 纲要', async () => {
      (getArcCanon as ReturnType<typeof vi.fn>).mockResolvedValue(existingCanon);
      (shouldUpdateCanon as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (listChapterSummaries as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSummary(11),
        makeSummary(12),
      ]);
      (compressCanonViaLLM as ReturnType<typeof vi.fn>).mockResolvedValue('LLM 新纲要');

      const result = await maybeUpdateArcCanon('proj1', mockChapter);

      expect(saveArcCanon).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        id: 'canon_proj1',
        projectId: 'proj1',
        canonText: 'LLM 新纲要',
        upToDateChapterNo: 20,
        fromLLM: true,
      });
      // 只把覆盖差值内的摘要传给压缩器
      const summariesArg = (compressCanonViaLLM as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(summariesArg).toHaveLength(2);
    });

    it('LLM 失败时回落确定性拼接并标记 fromLLM=false', async () => {
      (getArcCanon as ReturnType<typeof vi.fn>).mockResolvedValue(existingCanon);
      (shouldUpdateCanon as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (listChapterSummaries as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSummary(11),
      ]);
      (compressCanonViaLLM as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (deterministicCanonText as ReturnType<typeof vi.fn>).mockReturnValue('降级拼接纲要');

      const result = await maybeUpdateArcCanon('proj1', mockChapter);

      expect(result).toMatchObject({
        canonText: '降级拼接纲要',
        upToDateChapterNo: 20,
        fromLLM: false,
      });
      expect(saveArcCanon).toHaveBeenCalled();
    });

    it('无旧纲要时首次建立（id 按 projectId 生成）', async () => {
      (getArcCanon as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (shouldUpdateCanon as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (listChapterSummaries as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSummary(1),
        makeSummary(10),
      ]);
      (compressCanonViaLLM as ReturnType<typeof vi.fn>).mockResolvedValue('首份纲要');

      const result = await maybeUpdateArcCanon('proj1', mockChapter);

      expect(result).toMatchObject({ id: 'canon_proj1', canonText: '首份纲要' });
    });

    it('更新链路抛错时应静默返回 null 不阻塞章节保存', async () => {
      (getArcCanon as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db error'));

      const result = await maybeUpdateArcCanon('proj1', mockChapter);
      expect(result).toBeNull();
      expect(saveArcCanon).not.toHaveBeenCalled();
    });
  });

  describe('regenerateArcCanon', () => {
    it('无任何摘要时应返回 null', async () => {
      (listChapterSummaries as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await regenerateArcCanon('proj1');
      expect(result).toBeNull();
      expect(saveArcCanon).not.toHaveBeenCalled();
    });

    it('全量重建应以全部摘要为输入并以最大章号覆盖', async () => {
      (getArcCanon as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (listChapterSummaries as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSummary(3),
        makeSummary(1),
        makeSummary(15),
      ]);
      (compressCanonViaLLM as ReturnType<typeof vi.fn>).mockResolvedValue('全量纲要');

      const result = await regenerateArcCanon('proj1');

      expect(result).toMatchObject({ upToDateChapterNo: 15, canonText: '全量纲要' });
      const summariesArg = (compressCanonViaLLM as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(summariesArg).toHaveLength(3);
      expect(saveArcCanon).toHaveBeenCalled();
    });
  });
});
