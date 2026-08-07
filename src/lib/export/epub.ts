// ============================================================================
// EPUB 导出引擎（基于 jszip）
// ============================================================================
import type { Chapter, NovelProject } from '@/types';

/**
 * 生成简单的 EPUB 文件（不含图片/复杂样式）
 * 使用 jszip 打包为 ZIP 并重命名为 .epub
 */
export async function exportEpub({
  project,
  chapters,
}: {
  project: NovelProject;
  chapters: Chapter[];
}): Promise<Blob> {
  // 动态导入 jszip（减小首屏体积）
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const completed = chapters.filter((c) => c.status === 'completed');
  const now = new Date().toISOString().replace(/[TZ]/g, '').slice(0, 8);

  // mimetype（必须无压缩，放在最前）
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // OEBPS/content.opf
  const manifestItems = [
    `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`,
    `<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>`,
    ...completed.map(
      (ch, i) =>
        `<item id="chapter_${i}" href="chapter_${i}.xhtml" media-type="application/xhtml+xml"/>`
    ),
  ].join('\n');

  const spineItems = [
    `<itemref idref="cover"/>`,
    `<itemref idref="toc"/>`,
    ...completed.map((_, i) => `<itemref idref="chapter_${i}"/>`),
  ].join('\n');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:${project.id}</dc:identifier>
    <dc:title>${escapeXml(project.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>AI 小说制作工坊</dc:creator>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
  );

  // OEBPS/cover.xhtml
  zip.file(
    'OEBPS/cover.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>封面</title></head>
<body>
  <div style="text-align:center;padding:20% 0;">
    <h1>${escapeXml(project.title)}</h1>
    <p>题材：${escapeXml(project.genre)}</p>
    <p>总字数：${chapters.reduce((s, c) => s + c.wordCount, 0).toLocaleString()}</p>
  </div>
</body>
</html>`
  );

  // OEBPS/toc.xhtml
  const tocItems = completed
    .map(
      (ch, i) =>
        `<li><a href="chapter_${i}.xhtml">第${ch.chapterNo}章 ${escapeXml(ch.title)}</a></li>`
    )
    .join('\n');

  zip.file(
    'OEBPS/toc.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>目录</title></head>
<body>
  <h1>目录</h1>
  <ol>${tocItems}</ol>
</body>
</html>`
  );

  // 各章节
  for (let i = 0; i < completed.length; i++) {
    const ch = completed[i];
    const content = (ch.content || '').split('\n').map((line) => `<p>${escapeXml(line)}</p>`).join('\n');
    zip.file(
      `OEBPS/chapter_${i}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第${ch.chapterNo}章 ${escapeXml(ch.title)}</title></head>
<body>
  <h1>第${ch.chapterNo}章 ${escapeXml(ch.title)}</h1>
  ${content}
</body>
</html>`
    );
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadEpub(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.epub') ? filename : `${filename}.epub`;
  a.click();
  URL.revokeObjectURL(url);
}