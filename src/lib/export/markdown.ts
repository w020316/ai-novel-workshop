// ============================================================================
// Markdown 导出引擎
// ============================================================================
import type { Chapter, NovelProject } from '@/types';

export interface ExportMarkdownOptions {
  project: NovelProject;
  chapters: Chapter[];
  /** 导出末尾附加的附录文本（如避撞体检报告，可选） */
  appendix?: string;
}

export function exportMarkdown({ project, chapters, appendix }: ExportMarkdownOptions): string {
  const parts: string[] = [];
  // 只导出已完成章，字数口径与正文一致（此前未完成稿也计入 header）
  const completed = chapters.filter((c) => c.status === 'completed');

  // 元数据
  parts.push(`# ${project.title}`);
  parts.push('');
  if (project.summary) {
    parts.push(`> ${project.summary}`);
    parts.push('');
  }
  parts.push(`- **题材**：${project.genre}`);
  parts.push(`- **总字数**：${completed.reduce((s, c) => s + c.wordCount, 0).toLocaleString()}`);
  parts.push(`- **章节数**：${completed.length}`);
  parts.push('');
  parts.push('---');
  parts.push('');

  // 目录（锚点需与正文标题的 GitHub 风格 slug 一致并 URL 编码，含空格/标点才可跳转）
  parts.push('## 目录');
  parts.push('');
  for (const ch of completed) {
    parts.push(`- [第${ch.chapterNo}章 ${ch.title}](#${anchorFor(`第${ch.chapterNo}章 ${ch.title}`)})`);
  }
  parts.push('');
  parts.push('---');
  parts.push('');

  // 正文
  for (const ch of completed) {
    parts.push(`## 第${ch.chapterNo}章 ${ch.title}`);
    parts.push('');
    parts.push(ch.content || '');
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  // 附录（可选：如避撞体检报告）
  if (appendix) {
    parts.push('---');
    parts.push('');
    parts.push(appendix.replace(/^\n+|\n+$/g, ''));
    parts.push('');
  }

  return parts.join('\n');
}

// 生成与正文标题最内层 slug 一致的 GitHub 风格锚点（去标点空格→连字符，URL 编码）
function anchorFor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff -]/g, '')
    .replace(/ +/g, '-')
    .replace(/-+/g, '-');
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