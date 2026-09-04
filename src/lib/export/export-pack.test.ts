// ============================================================================
// 导出中心「一键打包」库单测
// ============================================================================
import { describe, it, expect } from 'vitest';
import { compileExportPackManifest, safeEntryName } from './export-pack';

const project = {
  id: 'p', title: '测试小说', genre: '玄幻' as never, summary: '一句话', targetWords: 100000,
  stylePresetId: '', llmConfig: null as never,
  status: 'drafting' as const, currentVolume: 1, currentChapter: 0, createdAt: 1, updatedAt: 1,
};
const chapters = [
  { id: 'c1', projectId: 'p', volumeNo: 1, chapterNo: 1, title: '第一章', plotPoints: [], content: '正文一', wordCount: 3, status: 'completed' as const, createdAt: 1, updatedAt: 1 },
];

const txt = { project, chapters };
const markdown = { project, chapters };

describe('compileExportPackManifest', () => {
  it('生成的 zip 条目含 TXT 与 Markdown 文本', () => {
    const { textEntries, blobEntries } = compileExportPackManifest({ txt, markdown });
    expect(textEntries.map((e) => e.path)).toEqual(['正文.txt', '正文.md']);
    expect(textEntries[0].content).toContain('测试小说');
    expect(textEntries[0].content).toContain('正文一');
    expect(blobEntries).toEqual([]);
  });

  it('可选 EPUB / JSON 备份可并入 blob 条目', () => {
    const epubBlob = new Blob(['epubdata'], { type: 'application/octet-stream' });
    const backupBlob = new Blob(['{}'], { type: 'application/json' });
    const { textEntries, blobEntries } = compileExportPackManifest({
      txt,
      markdown,
      epub: { filename: '封面.epub', blob: epubBlob },
      backup: { filename: '备份.json', blob: backupBlob },
    });
    expect(blobEntries.map((b) => b.path)).toEqual(['封面.epub', '备份.json']);
    expect(blobEntries[0].blob).toBe(epubBlob);
    expect(textEntries).toHaveLength(2);
  });

  it('无 epub/backup 时不产生 blob 条目', () => {
    const { textEntries, blobEntries } = compileExportPackManifest({ txt, markdown, epub: null, backup: null });
    expect(textEntries.length).toBe(2);
    expect(blobEntries).toEqual([]);
  });
});

describe('safeEntryName（zip 路径安全校验）', () => {
  it('合法文件名放行', () => {
    expect(safeEntryName('正文.txt')).toBe(true);
    expect(safeEntryName('封面.epub')).toBe(true);
  });
  it('拒绝路径穿越/分隔符/空串', () => {
    expect(safeEntryName('../evil.txt')).toBe(false);
    expect(safeEntryName('a/b.txt')).toBe(false);
    expect(safeEntryName('')).toBe(false);
    expect(safeEntryName('a\\b.txt')).toBe(false);
  });
});