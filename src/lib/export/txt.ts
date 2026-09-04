// ============================================================================
// TXT 导出引擎
// ============================================================================
import type { Chapter, NovelProject } from '@/types';

export interface ExportTxtOptions {
  project: NovelProject;
  chapters: Chapter[];
  includeOutline?: boolean;
  /** 导出末尾附加的附录文本（如避撞体检报告，可选） */
  appendix?: string;
}

export function exportTxt({ project, chapters, appendix }: ExportTxtOptions): string {
  const lines: string[] = [];
  // 只统计已完成章的字数，与正文导出口径一致（此前把未完成稿也计入，header 与正文不符）
  const completed = chapters.filter((c) => c.status === 'completed');

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
  lines.push(`总字数：${completed.reduce((s, c) => s + c.wordCount, 0).toLocaleString()}`);
  lines.push('');
  lines.push('─'.repeat(40));
  lines.push('');

  // 章节
  for (const ch of completed) {
    lines.push(`第${ch.chapterNo}章 ${ch.title}`);
    lines.push('─'.repeat(20));
    lines.push('');
    lines.push(ch.content || '');
    lines.push('');
    lines.push('');
  }

  // 附录（可选：如避撞体检报告）
  if (appendix) {
    lines.push('');
    lines.push(appendix.replace(/^\n+|\n+$/g, ''));
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