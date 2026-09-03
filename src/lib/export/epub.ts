// ============================================================================
// EPUB 导出引擎（基于 jszip）
// v2 增强：SVG 书封面 + 作者/简介元数据 + 章节首行缩进排版
// ============================================================================
import type { Chapter, NovelProject } from '@/types';

export interface EpubMeta {
  author?: string;
  description?: string;
  coverTitle?: string;
}

/**
 * 生成带封面与元数据的 EPUB（jszip 打包为 ZIP 重命名 .epub）
 */
export async function exportEpub({
  project,
  chapters,
  meta,
}: {
  project: NovelProject;
  chapters: Chapter[];
  meta?: EpubMeta;
}): Promise<Blob> {
  // 动态导入 jszip（减小首屏体积）
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const completed = chapters.filter((c) => c.status === 'completed');
  const totalWords = completed.reduce((s, c) => s + c.wordCount, 0);
  const author = meta?.author?.trim() || 'AI 小说制作工坊';
  const description = meta?.description?.trim() || project.summary || '';
  const coverTitle = meta?.coverTitle?.trim() || project.title;

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

  // 生成 SVG 书封面（无需外部资源，阅读器可渲染）
  const coverSvg = buildCoverSvg(coverTitle, project.genre, String(totalWords));

  // OEBPS/content.opf（含封面图片 + 作者 + 简介元数据）
  const manifestItems = [
    `<item id="cover-img" href="cover.svg" media-type="image/svg+xml"/>`,
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

  const dcDescription =
    description.length > 0 ? `    <dc:description>${escapeXml(description)}</dc:description>\n` : '';

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <meta property="dcterms:modified">${new Date().toISOString()}</meta>
    <dc:identifier id="book-id">urn:uuid:${project.id}</dc:identifier>
    <dc:title>${escapeXml(coverTitle)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <meta name="cover" content="cover-img"/>
${dcDescription}  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
  );

  // SVG 书封面
  zip.file('OEBPS/cover.svg', coverSvg);

  // OEBPS/cover.xhtml（引用 SVG 封面）
  zip.file(
    'OEBPS/cover.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>封面</title></head>
<body>
  <div style="text-align:center;padding:5% 0;">
    <img src="cover.svg" alt="${escapeXml(coverTitle)}" style="max-width:80%;height:auto;"/>
    <p>题材：${escapeXml(project.genre)}</p>
    <p>总字数：${totalWords.toLocaleString()}</p>
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

  // 各章节（正文段落加首行缩进，中文排版更佳）
  for (let i = 0; i < completed.length; i++) {
    const ch = completed[i];
    const content = (ch.content || '')
      .split('\n')
      .map((line) => `<p style="text-indent:2em;line-height:1.8;margin:0.5em 0;">${escapeXml(line)}</p>`)
      .join('\n');
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

/**
 * 生成 SVG 书封面（文房风格：暖纸底 + 翰墨青描边 + 朱砂点缀 + 标题/题材/字数）
 */
export function buildCoverSvg(title: string, genre: string, words: string, author = 'AI 小说制作工坊'): string {
  const safeTitle = escapeXml(title).slice(0, 24);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#f5f0e6"/>
  <rect x="20" y="20" width="560" height="760" fill="none" stroke="#2a6658" stroke-width="4"/>
  <rect x="36" y="36" width="528" height="728" fill="none" stroke="#2a6658" stroke-width="1"/>
  <text x="300" y="130" text-anchor="middle" font-family="'-apple-system','Microsoft YaHei',serif" font-size="30" fill="#c0332c" letter-spacing="4">书 名</text>
  <text x="300" y="340" text-anchor="middle" font-family="serif" font-size="56" font-weight="bold" fill="#29231b">${safeTitle}</text>
  <line x1="180" y1="380" x2="420" y2="380" stroke="#ddc8a6" stroke-width="1"/>
  <text x="300" y="470" text-anchor="middle" font-family="'-apple-system','Microsoft YaHei',sans-serif" font-size="26" fill="#5d554a">${escapeXml(genre)}</text>
  <text x="300" y="530" text-anchor="middle" font-family="'-apple-system','Microsoft YaHei',sans-serif" font-size="22" fill="#8c8374">${escapeXml(words)} 字</text>
  <text x="300" y="640" text-anchor="middle" font-family="'Noto Serif SC',serif" font-size="20" fill="#2a6658">${escapeXml(author)}</text>
  <text x="300" y="700" text-anchor="middle" font-family="serif" font-size="18" fill="#c0332c">AI 小说制作工坊</text>
</svg>`;
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