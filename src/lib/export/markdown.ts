// ============================================================================
// Markdown 导出引擎
// ============================================================================
import type { Chapter, NovelProject } from '@/types';

export interface ExportMarkdownOptions {
  project: NovelProject;
  chapters: Chapter[];
}

export function exportMarkdown({ project, chapters }: ExportMarkdownOptions): string {
  const parts: string[] = [];

  // 元数据
  parts.push(`# ${project.title}`);
  parts.push('');
  if (project.summary) {
    parts.push(`> ${project.summary}`);
    parts.push('');
  }
  parts.push(`- **题材**：${project.genre}`);
  parts.push(`- **总字数**：${chapters.reduce((s, c) => s + c.wordCount, 0).toLocaleString()}`);
  parts.push(`- **章节数**：${chapters.filter((c) => c.status === 'completed').length}`);
  parts.push('');
  parts.push('---');
  parts.push('');

  // 目录
  parts.push('## 目录');
  parts.push('');
  for (const ch of chapters) {
    if (ch.status !== 'completed') continue;
    parts.push(`- [第${ch.chapterNo}章 ${ch.title}](#第${ch.chapterNo}章-${ch.title})`);
  }
  parts.push('');
  parts.push('---');
  parts.push('');

  // 正文
  for (const ch of chapters) {
    if (ch.status !== 'completed') continue;
    parts.push(`## 第${ch.chapterNo}章 ${ch.title}`);
    parts.push('');
    parts.push(ch.content || '');
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  a.click();
  URL.revokeObjectURL(url);
}