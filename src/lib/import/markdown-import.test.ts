// ============================================================================
// P2-6 Markdown 导入回流单测
// 覆盖：导出格式往返解析、中文数字章号、标题变体、元数据提取、
//       回流落库（新建/更新/无变化三分支）与旧版快照
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db/schema';
import {
  parseMarkdownDoc,
  applyMarkdownImport,
  chineseNumeralToNumber,
} from './markdown-import';
import { exportMarkdown } from '@/lib/export/markdown';
import type { Chapter, NovelProject } from '@/types';

function makeProject(): NovelProject {
  return {
    id: 'proj-md-1',
    title: '回流测试',
    genre: '玄幻',
    summary: '简介',
    targetWords: 100000,
    stylePresetId: 'style-preset-1',
    llmConfig: { provider: 'zhipu', model: 'glm-4-flash', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
    status: 'ongoing',
    currentVolume: 1,
    currentChapter: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeChapter(no: number, content: string): Chapter {
  return {
    id: `ch_${no}`,
    projectId: 'proj-md-1',
    volumeNo: 1,
    chapterNo: no,
    title: `第${no}章`,
    plotPoints: [],
    content,
    wordCount: content.length,
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('chineseNumeralToNumber', () => {
  it('应解析阿拉伯与全角数字', () => {
    expect(chineseNumeralToNumber('12')).toBe(12);
    expect(chineseNumeralToNumber('１２')).toBe(12);
  });

  it('应解析常见中文数字（含带单位省位）', () => {
    expect(chineseNumeralToNumber('一')).toBe(1);
    expect(chineseNumeralToNumber('十')).toBe(10);
    expect(chineseNumeralToNumber('十二')).toBe(12);
    expect(chineseNumeralToNumber('二十')).toBe(20);
    expect(chineseNumeralToNumber('一百零三')).toBe(103);
    expect(chineseNumeralToNumber('两百')).toBe(200);
    expect(chineseNumeralToNumber('一万零一')).toBe(10001);
  });

  it('非数字应返回 null', () => {
    expect(chineseNumeralToNumber('abc')).toBeNull();
  });
});

describe('parseMarkdownDoc', () => {
  it('应与 exportMarkdown 输出往返互通', () => {
    const project = makeProject();
    const chapters = [
      makeChapter(1, '少年抬头，望向山巅。'),
      makeChapter(2, '三年之后，他归来时已是强者。'),
    ];
    const md = exportMarkdown({ project, chapters });
    const doc = parseMarkdownDoc(md);

    expect(doc.title).toBe('回流测试');
    expect(doc.summary).toBe('简介');
    expect(doc.genre).toBe('玄幻');
    expect(doc.chapters).toHaveLength(2);
    expect(doc.chapters[0].chapterNo).toBe(1);
    expect(doc.chapters[0].title).toBe('第1章');
    expect(doc.chapters[0].content).toContain('少年抬头');
    expect(doc.chapters[1].chapterNo).toBe(2);
    // 目录区不应混入正文（章内容不包含「目录」锚点行）
    expect(doc.chapters[0].content).not.toContain('目录');
  });

  it('应兼容「第N章：标题」变体与 ### 级标题', () => {
    const doc = parseMarkdownDoc(
      ['### 第3章：风起', '', '正文内容甲。', '', '## 第4章 雨落', '', '正文内容乙。'].join('\n')
    );
    expect(doc.chapters).toHaveLength(2);
    expect(doc.chapters[0].chapterNo).toBe(3);
    expect(doc.chapters[0].title).toBe('风起');
    expect(doc.chapters[1].chapterNo).toBe(4);
  });

  it('应支持中文数字章号', () => {
    const doc = parseMarkdownDoc('## 第十二章 试炼\n\n内容。');
    expect(doc.chapters[0].chapterNo).toBe(12);
    expect(doc.chapters[0].title).toBe('试炼');
  });

  it('章前元信息与目录不应进入正文，无章标题时返回空列表', () => {
    const doc = parseMarkdownDoc(
      ['# 书名', '', '> 一句话', '', '- **题材**：都市', '', '## 目录', '', '- [第1章](#x)', '', '---'].join('\n')
    );
    expect(doc.chapters).toHaveLength(0);
    expect(doc.title).toBe('书名');
    expect(doc.genre).toBe('都市');
  });
});

describe('applyMarkdownImport（回流落库）', () => {
  beforeEach(async () => {
    await db.chapters.clear();
    await db.chapterVersions.clear();
    await db.outlines.clear();
    await db.projects.clear();
    await db.projects.add(makeProject());
  });

  it('新章号 → 新建；章号已存在且内容变化 → 更新并快照旧版', async () => {
    await db.chapters.add(makeChapter(1, '旧版第一章内容。'));
    const md = [
      '## 第1章 新标题',
      '',
      '第一章被外部编辑后的新内容。',
      '',
      '## 第2章 新建章',
      '',
      '这是导入新增的第二章。',
    ].join('\n');

    const result = await applyMarkdownImport('proj-md-1', md);
    expect(result).toEqual({ created: 1, updated: 1, unchanged: 0 });

    const all = await db.chapters.toArray();
    const updated = all.find((c) => c.chapterNo === 1);
    const created = all.find((c) => c.chapterNo === 2);
    expect(updated?.content).toContain('外部编辑后的新内容');
    expect(updated?.title).toBe('新标题');
    expect(updated?.id).toBe('ch_1'); // 复用原 id

    const versions = await db.chapterVersions.where('chapterId').equals('ch_1').toArray();
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toContain('旧版第一章内容');

    expect(created?.title).toBe('新建章');
    expect(created?.status).toBe('completed');
  });

  it('内容与标题均无变化 → unchanged，不产生快照', async () => {
    await db.chapters.add(makeChapter(1, '原封不动的内容。'));
    const md = '## 第1章 第1章\n\n原封不动的内容。';
    const result = await applyMarkdownImport('proj-md-1', md);
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(await db.chapterVersions.count()).toBe(0);
  });

  it('新建章应按大纲卷区间落卷号', async () => {
    await db.outlines.add({
      id: 'outline-1',
      projectId: 'proj-md-1',
      volumes: [
        { volumeNo: 2, title: '第二卷', summary: '', chapterRange: [5, 10], coreConflict: '' },
      ],
      mainPlotline: '',
      climaxNodes: [],
      ending: '',
      updatedAt: Date.now(),
    });
    const md = '## 第6章 卷中章\n\n内容。';
    const result = await applyMarkdownImport('proj-md-1', md);
    expect(result.created).toBe(1);
    const ch = (await db.chapters.toArray()).find((c) => c.chapterNo === 6);
    expect(ch?.volumeNo).toBe(2);
  });

  it('项目不存在应抛错；无章节正文应抛错', async () => {
    await expect(applyMarkdownImport('proj-none', '## 第1章 x\n\n内容')).rejects.toThrow(
      '项目不存在'
    );
    await expect(applyMarkdownImport('proj-md-1', '# 只有标题')).rejects.toThrow(
      /未在文件中解析到任何章节/
    );
  });
});
