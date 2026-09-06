// ============================================================================
// 投稿格式排版导出引擎（UX 评估 N4）
// 目标：一键输出「可直接粘贴到作家助手 / 平台后台」的正文格式——
//   - 书名 + 简介开头，无 Markdown 目录/分隔线/元数据块等平台不需要的标记
//   - 分卷标题（依据大纲卷规划，可选）：章节落进卷区间时插入「第N卷 卷名」
//   - 章节标题「第N章 标题」
//   - 段落首行全角空格缩进（默认 2 格），段间空行，清理 Markdown 痕迹
// 说明：零依赖、纯函数、确定性可测；下载复用 txt.ts 的 downloadTxt。
// ============================================================================
import type { Chapter, NovelProject, Volume } from '@/types';

export interface ExportSubmissionOptions {
  project: NovelProject;
  chapters: Chapter[];
  /** 大纲卷规划（可选；提供时按章节号落卷并插入卷标题） */
  volumes?: Volume[];
  /** 段落首行缩进的全角空格数（默认 2） */
  indent?: number;
}

/** 清理正文中不适合投稿排版的 Markdown 痕迹（标题/列表/行内强调标记） */
function cleanContent(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '') // 标题标记
    .replace(/^\s*[-*+]\s+/gm, '') // 列表标记
    .replace(/\*\*|__|`/g, ''); // 行内强调
}

/** 段落排版：逐段去空白后首行缩进，段间空行 */
function indentParagraphs(content: string, indent: number): string {
  const pad = '　'.repeat(Math.max(0, indent));
  return content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => pad + l)
    .join('\n\n');
}

/**
 * 生成投稿格式纯文本。
 * @returns 平台友好的正文文本（书名/简介开头 + 卷标题 + 章节标题 + 缩进段落）
 */
export function exportSubmission({
  project,
  chapters,
  volumes,
  indent = 2,
}: ExportSubmissionOptions): string {
  const completed = chapters
    .filter((c) => c.status === 'completed')
    .sort((a, b) => a.chapterNo - b.chapterNo);

  const lines: string[] = [];
  lines.push(project.title);
  lines.push('');
  if (project.summary) {
    lines.push(`简介：${project.summary}`);
    lines.push('');
  }

  const volFor = (no: number): Volume | undefined =>
    volumes?.find((v) => no >= v.chapterRange[0] && no <= v.chapterRange[1]);
  let lastVolNo: number | null = null;

  for (const ch of completed) {
    const vol = volFor(ch.chapterNo);
    if (vol && vol.volumeNo !== lastVolNo) {
      lines.push(`第${vol.volumeNo}卷 ${vol.title}`);
      lines.push('');
      lastVolNo = vol.volumeNo;
    }
    lines.push(`第${ch.chapterNo}章 ${ch.title}`);
    lines.push('');
    lines.push(indentParagraphs(cleanContent(ch.content || ''), indent));
    lines.push('');
  }

  // 收尾多余空行压成一个换行
  return lines.join('\n').replace(/\n{2,}$/, '\n');
}
