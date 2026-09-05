import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldUpdateCanon,
  deterministicCanonText,
  compressCanonViaLLM,
  CANON_UPDATE_INTERVAL,
  CANON_MAX_CHARS,
} from './arc-canon';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}));

import { chat } from '@/lib/llm/client';

describe('arc-canon generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldUpdateCanon', () => {
    it('无纲要时达到间隔章数即应更新', () => {
      expect(shouldUpdateCanon(null, CANON_UPDATE_INTERVAL)).toBe(true);
      expect(shouldUpdateCanon(undefined, CANON_UPDATE_INTERVAL - 1)).toBe(false);
    });

    it('有纲要时按覆盖差值判断', () => {
      const canon = { upToDateChapterNo: 10 };
      expect(shouldUpdateCanon(canon, 19)).toBe(false);
      expect(shouldUpdateCanon(canon, 20)).toBe(true);
      expect(shouldUpdateCanon(canon, 25)).toBe(true);
    });
  });

  describe('deterministicCanonText', () => {
    it('应保留旧纲要头部并按章号顺序拼接新摘要', () => {
      const old = '主线：主角从宗门杂役崛起。\n[覆盖至第10章]';
      const text = deterministicCanonText(old, [
        { chapterNo: 12, summary: '主角突破筑基' },
        { chapterNo: 11, summary: '主角获得残卷' },
      ]);

      expect(text).toContain('主线：主角从宗门杂役崛起。');
      expect(text).not.toContain('[覆盖至第10章]');
      expect(text.indexOf('第11章')).toBeLessThan(text.indexOf('第12章'));
      expect(text).toContain('第11章：主角获得残卷');
    });

    it('无旧纲要时直接拼接摘要', () => {
      const text = deterministicCanonText('', [{ chapterNo: 5, summary: '开局灭门' }]);
      expect(text).toBe('第5章：开局灭门');
    });

    it('超长时应裁掉最旧的摘要行且不超上限', () => {
      const head = '主线锚定：主角必须活到最后一卷。';
      const summaries = Array.from({ length: 60 }, (_, i) => ({
        chapterNo: i + 1,
        summary: `第${i + 1}章发生了很多事情，剧情推进。`.repeat(3),
      }));
      const text = deterministicCanonText(head, summaries);

      expect(text.length).toBeLessThanOrEqual(CANON_MAX_CHARS);
      expect(text.startsWith(head)).toBe(true);
      // 最早几章被裁掉
      expect(text).not.toContain('第1章：');
    });

    it('空摘要应被过滤', () => {
      const text = deterministicCanonText('', [
        { chapterNo: 3, summary: '' },
        { chapterNo: 4, summary: '   ' },
      ]);
      expect(text).toBe('');
    });
  });

  describe('compressCanonViaLLM', () => {
    it('LLM 返回内容时应裁剪并返回文本', async () => {
      (chat as ReturnType<typeof vi.fn>).mockResolvedValue({ content: '更新后的纲要' });

      const result = await compressCanonViaLLM('旧纲要', [
        { chapterNo: 11, summary: '新进展' },
      ]);

      expect(result).toBe('更新后的纲要');
      expect(chat).toHaveBeenCalledTimes(1);
    });

    it('无新摘要时不应调用 LLM', async () => {
      const result = await compressCanonViaLLM('旧纲要', []);
      expect(result).toBeNull();
      expect(chat).not.toHaveBeenCalled();
    });

    it('LLM 失败或空内容时应返回 null', async () => {
      (chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('quota'));
      expect(await compressCanonViaLLM('旧', [{ chapterNo: 1, summary: 'a' }])).toBeNull();

      (chat as ReturnType<typeof vi.fn>).mockResolvedValue({ content: '  ' });
      expect(await compressCanonViaLLM('旧', [{ chapterNo: 1, summary: 'a' }])).toBeNull();
    });
  });
});
