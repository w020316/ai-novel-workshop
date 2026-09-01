// ============================================================================
// EPUB 导出引擎测试
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportEpub, downloadEpub } from './epub';
import type { NovelProject, Chapter } from '@/types';

// 捕获 jszip 实例以便断言写入的文件
interface ZipInstance {
  file: ReturnType<typeof vi.fn>;
  generateAsync: ReturnType<typeof vi.fn>;
}
const { JZip, lastZip } = vi.hoisted(() => {
  const lastZip: { inst: ZipInstance | null } = { inst: null };
  class JSZip {
    constructor() {
      lastZip.inst = this;
    }
    file = vi.fn();
    generateAsync = vi.fn(async () => new Blob(['zip-data'], { type: 'application/epub+zip' }));
  }
  return { JZip: JSZip, lastZip };
});

vi.mock('jszip', () => ({ default: JZip }));

const mockProject: NovelProject = {
  id: 'proj-1',
  title: '测试小说',
  genre: '玄幻',
  summary: '',
  targetWords: 100000,
  stylePresetId: '',
  llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
  status: 'drafting',
  currentVolume: 1,
  currentChapter: 0,
  createdAt: 0,
  updatedAt: 0,
};

function makeChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: 'ch-1',
    projectId: 'proj-1',
    volumeNo: 1,
    chapterNo: 1,
    title: '第一章 序章',
    plotPoints: [],
    content: '内容',
    wordCount: 10,
    status: 'completed',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function fileNames(zip: ZipInstance): string[] {
  return zip.file.mock.calls.map((c) => String(c[0]));
}

function fileContent(zip: ZipInstance, name: string): string {
  const call = zip.file.mock.calls.find((c) => c[0] === name);
  return call ? String(call[1]) : '';
}

describe('export/epub', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    lastZip.inst = null;
  });

  it('应生成 Blob 并调用 generateAsync', async () => {
    const blob = await exportEpub({ project: mockProject, chapters: [] });
    expect(blob).toBeInstanceOf(Blob);
    expect(lastZip.inst.generateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'blob', compression: 'DEFLATE' })
    );
  });

  it('应写入 mimetype / container / content.opf / cover / toc', async () => {
    await exportEpub({ project: mockProject, chapters: [] });
    const names = fileNames(lastZip.inst);
    expect(names).toContain('mimetype');
    expect(names).toContain('META-INF/container.xml');
    expect(names).toContain('OEBPS/content.opf');
    expect(names).toContain('OEBPS/cover.xhtml');
    expect(names).toContain('OEBPS/toc.xhtml');

    // mimetype 使用 STORE 无压缩
    const mimetypeCall = lastZip.inst.file.mock.calls.find((c) => c[0] === 'mimetype');
    expect(mimetypeCall[2]).toEqual({ compression: 'STORE' });

    const container = fileContent(lastZip.inst, 'META-INF/container.xml');
    expect(container).toContain('content.opf');
  });

  it('只包含已完成的章节文件', async () => {
    const chapters = [
      makeChapter({ id: 'c1', status: 'completed' }),
      makeChapter({ id: 'c2', status: 'drafting' }),
      makeChapter({ id: 'c3', status: 'completed', chapterNo: 2 }),
    ];
    await exportEpub({ project: mockProject, chapters });
    const chaptersFiles = fileNames(lastZip.inst).filter((n) => n.startsWith('OEBPS/chapter_'));
    expect(chaptersFiles).toEqual(['OEBPS/chapter_0.xhtml', 'OEBPS/chapter_1.xhtml']);

    const chapterBody = fileContent(lastZip.inst, 'OEBPS/chapter_0.xhtml');
    expect(chapterBody).toContain('第1章 第一章 序章');
  });

  it('正文应按行转换为 <p> 段落', async () => {
    const chapters = [makeChapter({ content: '第一段\n第二段\n第三段' })];
    await exportEpub({ project: mockProject, chapters });
    const body = fileContent(lastZip.inst, 'OEBPS/chapter_0.xhtml');
    expect(body).toContain('<p>第一段</p>');
    expect(body).toContain('<p>第二段</p>');
    expect(body).toContain('<p>第三段</p>');
  });

  it('特殊字符应被 XML 转义', async () => {
    const project = { ...mockProject, title: '<玄幻> & 测试"' };
    const chapters = [makeChapter({ title: '第1章 "引" & <上>' })];
    await exportEpub({ project, chapters });

    const opf = fileContent(lastZip.inst, 'OEBPS/content.opf');
    expect(opf).toContain('&lt;玄幻&gt; &amp; 测试&quot;');
    const chapterBody = fileContent(lastZip.inst, 'OEBPS/chapter_0.xhtml');
    expect(chapterBody).toContain('&quot;引&quot; &amp; &lt;上&gt;');
    expect(chapterBody).not.toContain('<玄幻>');
  });

  it('封面应包含题材与汇总总字数（含所有章节）', async () => {
    const chapters = [
      makeChapter({ wordCount: 10000 }),
      makeChapter({ wordCount: 2000 }),
      makeChapter({ wordCount: 5000 }),
    ];
    await exportEpub({ project: mockProject, chapters });
    const cover = fileContent(lastZip.inst, 'OEBPS/cover.xhtml');
    expect(cover).toContain('题材：玄幻');
    expect(cover).toContain('17,000');
  });

  it('downloadEpub 应触发浏览器下载', () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue('blob:xx'),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    const blob = new Blob(['x']);
    downloadEpub(blob, '我的小说');

    expect((globalThis.URL.createObjectURL as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('我的小说.epub');
    expect(anchor.click).toHaveBeenCalled();
    expect((globalThis.URL.revokeObjectURL as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('blob:xx');
  });

  it('downloadEpub 文件名已带 .epub 时不重复追加', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn().mockReturnValue('blob:y'), revokeObjectURL: vi.fn() });
    const click = vi.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const blob = new Blob(['x']);
    downloadEpub(blob, 'book.epub');
    expect(anchor.download).toBe('book.epub');
    expect(click).toHaveBeenCalled();
  });
});