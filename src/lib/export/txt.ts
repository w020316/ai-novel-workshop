// ============================================================================
// TXT 导出引擎
// ============================================================================
import type { Chapter, NovelProject } from '@/types';

export interface ExportTxtOptions {
  project: NovelProject;
  chapters: Chapter[];
  includeOutline?: boolean;
}

export function exportTxt({ project, chapters }: ExportTxtOptions): string {
  const lines: string[] = [];

  // 标题
  lines.push(project.title);
  lines.push('='.repeat(project.title.length));
  lines.push('');
  if (project.summary) {
    lines.push(`简介：${project.summary}`);
    lines.push('');
  }
  lines.push(`作者：AI 小说制作工坊`);
  lines.push(`题材：${project.genre}`);
  lines.push(`总字数：${chapters.reduce((s, c) => s + c.wordCount, 0).toLocaleString()}`);
  lines.push('');
  lines.push('─'.repeat(40));
  lines.push('');

  // 章节
  for (const ch of chapters) {
    if (ch.status !== 'completed') continue;
    lines.push(`第${ch.chapterNo}章 ${ch.title}`);
    lines.push('─'.repeat(20));
    lines.push('');
    lines.push(ch.content || '');
    lines.push('');
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadTxt(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}