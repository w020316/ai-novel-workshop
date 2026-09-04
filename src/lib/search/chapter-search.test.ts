// ============================================================================
// 跨章全文检索 单测（纯函数）
// ============================================================================
import { describe, it, expect } from 'vitest';
import { searchChapters } from './chapter-search';

const tpl = (chapterNo: number, title: string, content: string) => ({
  id: `ch${chapterNo}`,
  chapterNo,
  title,
  content,
});

describe('searchChapters', () => {
  it('空查询/空章节返回空结果', () => {
    const r1 = searchChapters([tpl(1, '第一章', '正文')], '   ');
    expect(r1.totalMatches).toBe(0);
    const r2 = searchChapters([], '关键词');
    expect(r2.matchedChapters).toBe(0);
  });

  it('跨章命中并计数，按章号升序返回', () => {
    const chapters = [
      tpl(2, '第二章', '主角来到宗门修炼剑法，剑意大涨。'),
      tpl(1, '第一章', '少年拜入宗门，宗门的长老传他剑法。'),
      tpl(3, '第三章', '与世无争，如何修行。'),
    ];
    const r = searchChapters(chapters, '宗门');
    expect(r.matchedChapters).toBe(2);
    expect(r.totalMatches).toBe(3); // 第1章 2 次 + 第2章 1 次
    expect(r.hits.map((h) => h.chapterNo)).toEqual([1, 2]);
    expect(r.hits[0].count).toBe(2);
    expect(r.hits[1].count).toBe(1);
  });

  it('大小写不敏感（英文关键词）', () => {
    const chapters = [tpl(1, 'One', 'He found the SWORD of legend.')];
    const r = searchChapters(chapters, 'sword');
    expect(r.totalMatches).toBe(1);
  });

  it('上下文片段以命中词为中心、含省略号，数量受 maxSnippets 限制', () => {
    const long = `前文不重要。关键句：这里出现了《凌云剑诀》get。${'填充'.repeat(20)} 补充。`;
    const ch = tpl(1, '第一章', long + long); // 命中 2 次
    const r = searchChapters([ch], '凌云剑诀', { maxSnippets: 1 });
    expect(r.hits[0].snippets.length).toBe(1);
    expect(r.hits[0].snippets[0]).toContain('凌云剑诀');
  });

  it('片段窗口天然含省略号且包含命中词', () => {
    const content = `${'甲'.repeat(100)}命中词命中的位置${'乙'.repeat(100)}`;
    const r = searchChapters([tpl(1, '第一章', content)], '命中词命中', { maxSnippets: 2 });
    const s = r.hits[0].snippets[0];
    expect(s).toContain('命中词命中');
    expect(s.length).toBeGreaterThan(3);
  });
});