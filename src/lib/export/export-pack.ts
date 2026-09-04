// ============================================================================
// 导出中心「一键打包」库
// 把 TXT / Markdown / EPUB（可选）聚合为一个 ZIP，交付多格式作品包。
// 设计与可测性：compileExportPackManifest 为纯函数（给定各格式内容生成 zip 条目），
// epub 需异步 Blob，故打包分两步——先构建清单映射，再由 buildExportPackZip 落地 zip。
// 复用 jszip（epub 同款依赖）。
// ============================================================================
import { exportTxt, type ExportTxtOptions } from './txt';
import { exportMarkdown, type ExportMarkdownOptions } from './markdown';

export interface ExportPackOptions {
  txt: ExportTxtOptions;
  markdown: ExportMarkdownOptions;
  /** 可选：EPUB Blob 文件名（含 .epub）与 Blob */
  epub?: { filename: string; blob: Blob } | null;
  /** 可选：JSON 备份 Blob 文件名与 Blob */
  backup?: { filename: string; blob: Blob } | null;
}

export interface PackEntry {
  path: string;
  content: string;
}

/**
 * 纯函数：给定各格式导出选项/Blob，产出 zip 内条目映射（不含 epub/backup 的文本由调用方提前生成）。
 * 返回：{ textEntries, blobEntries }。
 * 分离便于单测（不依赖 Blob/jsZIP 异步）。
 */
export function compileExportPackManifest(options: ExportPackOptions): {
  textEntries: PackEntry[];
  blobEntries: { path: string; blob: Blob }[];
} {
  const textEntries: PackEntry[] = [
    { path: '正文.txt', content: exportTxt(options.txt) },
    { path: '正文.md', content: exportMarkdown(options.markdown) },
  ];
  const blobEntries: { path: string; blob: Blob }[] = [];
  if (options.epub) blobEntries.push({ path: options.epub.filename, blob: options.epub.blob });
  if (options.backup) blobEntries.push({ path: options.backup.filename, blob: options.backup.blob });
  return { textEntries, blobEntries };
}

/**
 * 基于清单生成 ZIP Blob。纯异步、无直接 DOM/网络依赖（jszip 动态导入）。
 */
export async function buildExportPackZip(
  manifest: { textEntries: PackEntry[]; blobEntries: { path: string; blob: Blob }[] }
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const e of manifest.textEntries) zip.file(e.path, e.content);
  for (const e of manifest.blobEntries) zip.file(e.path, e.blob);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** 校验文件名安全：含路径分隔或非法路径即视为危险，避免 zip 内路径穿越 */
export function safeEntryName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !name.includes('..') &&
    !/[/\\]/.test(name) &&
    !name.includes('\0')
  );
}