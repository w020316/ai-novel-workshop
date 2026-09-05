// ============================================================================
// Markdown 工作区导入回流（P2-6，对标 OpenNovel「纯 Markdown 可 git」）
// 职责：
// 1. parseMarkdownDoc：纯函数解析 Markdown → 元数据 + 章节列表（与 export/markdown.ts 导出格式互通）
// 2. applyMarkdownImport：把解析出的章节回流进项目（新建/更新，含版本快照）
// 设计：外部编辑（改字/加章）后导入即回流；与现有章号一致的章节更新正文，
//       旧版自动快照为历史版本，人工内容不会无声丢失。
// ============================================================================
import type { Chapter } from '@/types';
import { db } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';

/** 解析出的单章 */
export interface ParsedChapter {
  chapterNo: number;
  title: string;
  content: string;
}

/** 解析出的文档：元数据 + 章节 */
export interface ParsedMarkdownDoc {
  title?: string;
  genre?: string;
  summary?: string;
  chapters: ParsedChapter[];
}

/** 回流结果统计 */
export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
}

// 章节标题：## / ### 开头，第N章（阿拉伯数字或中文数字），后接可选分隔符与标题
const CHAPTER_HEADING =
  /^#{2,4}\s*第\s*([0-9０-９]+|[一二三四五六七八九十百千两]+)\s*章\s*[:：、.\s]*(.*)$/;
// 元数据行：- **题材**：xxx（冒号全半角均可）
const GENRE_LINE = /^[-*]\s*\*{0,2}题材\*{0,2}\s*[:：]\s*(\S.*)$/;

/** 中文数字 → 阿拉伯数字（支持到万级；无法解析返回 null） */
export function chineseNumeralToNumber(s: string): number | null {
  const digits: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

  // 纯阿拉伯/全角数字
  if (/^[0-9０-９]+$/.test(s)) {
    const normalized = s.replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    );
    return parseInt(normalized, 10);
  }

  let total = 0; // 万以上累计
  let section = 0; // 当前万级以内的累计
  let current = 0; // 当前数字
  let sawDigit = false;

  for (const ch of s) {
    if (digits[ch] !== undefined) {
      current = digits[ch];
      sawDigit = true;
    } else if (units[ch] !== undefined) {
      const unit = units[ch];
      if (unit === 10000) {
        section = (section + current) * unit;
        total += section;
        section = 0;
      } else {
        section += (current === 0 && !sawDigit ? 1 : current) * unit;
      }
      current = 0;
      sawDigit = false;
    } else {
      return null; // 非数字字符
    }
  }
  const result = total + section + current;
  return result > 0 ? result : null;
}

/** 去掉结尾的 `---` 分隔线与多余空行 */
function trimTrailingSeparator(lines: string[]): string {
  const copy = [...lines];
  while (copy.length > 0) {
    const last = copy[copy.length - 1].trim();
    if (last === '' || last === '---') copy.pop();
    else break;
  }
  return copy.join('\n').trim();
}

/**
 * 解析 Markdown 文档为章节列表（纯函数，与 exportMarkdown 输出互通）。
 * - 第一个 `# 标题` → title；紧随的 `> 引言` → summary；`- **题材**：x` → genre
 * - `## 第N章 标题`（##~#### 均可，兼容中文数字章号）起收集正文，直到下一个章标题
 * - 第一个章标题之前的内容（元信息/目录/分隔线）一律忽略
 */
export function parseMarkdownDoc(md: string): ParsedMarkdownDoc {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const doc: ParsedMarkdownDoc = { chapters: [] };

  let current: { chapterNo: number; title: string; contentLines: string[] } | null = null;

  for (const line of lines) {
    const heading = line.match(CHAPTER_HEADING);
    if (heading) {
      // 落盘上一章
      if (current) {
        doc.chapters.push({
          chapterNo: current.chapterNo,
          title: current.title,
          content: trimTrailingSeparator(current.contentLines),
        });
      }
      const no = chineseNumeralToNumber(heading[1]);
      if (no === null) { current = null; continue; }
      current = {
        chapterNo: no,
        title: heading[2].trim() || `第${no}章`,
        contentLines: [],
      };
      continue;
    }

    // 章内：收集正文
    if (current) {
      current.contentLines.push(line);
      continue;
    }

    // 章前：提取元数据（仅在尚未收集到章时）
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !doc.title) {
      doc.title = h1[1].trim();
      continue;
    }
    const quote = line.match(/^>\s*(.+)$/);
    if (quote && !doc.summary) {
      doc.summary = quote[1].trim();
      continue;
    }
    const genre = line.match(GENRE_LINE);
    if (genre && !doc.genre) {
      doc.genre = genre[1].trim();
    }
  }

  if (current) {
    doc.chapters.push({
      chapterNo: current.chapterNo,
      title: current.title,
      content: trimTrailingSeparator(current.contentLines),
    });
  }

  return doc;
}

/**
 * 把解析出的章节回流进项目：
 * - 章号已存在：标题或正文有变化 → 旧版快照为历史版本后更新；无变化 → unchanged
 * - 章号不存在：新建（status=completed，卷号按大纲卷区间反查）
 * 空正文章节跳过（目录残留等）。
 */
export async function applyMarkdownImport(
  projectId: string,
  md: string
): Promise<ImportResult> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('项目不存在');

  const doc = parseMarkdownDoc(md);
  const chapters = doc.chapters.filter((c) => c.content.trim().length > 0);
  if (chapters.length === 0) {
    throw new Error('未在文件中解析到任何章节正文（需形如「## 第1章 章名」的标题）');
  }

  const outline = await db.outlines.where('projectId').equals(projectId).first();
  const volumes = outline?.volumes ?? [];
  const existing = await db.chapters.where('projectId').equals(projectId).toArray();
  const byNo = new Map(existing.map((c) => [c.chapterNo, c]));

  const result: ImportResult = { created: 0, updated: 0, unchanged: 0 };

  for (const parsed of chapters) {
    const prev = byNo.get(parsed.chapterNo);
    const wordCount = (parsed.content.match(/[\u4e00-\u9fff]/g) ?? []).length;

    if (prev) {
      const titleChanged = prev.title !== parsed.title;
      const contentChanged = prev.content !== parsed.content;
      if (!titleChanged && !contentChanged) {
        result.unchanged++;
        continue;
      }
      // 正文变化 → 旧版快照为历史版本（与章节页手动保存行为一致）
      if (contentChanged) {
        await db.chapterVersions.add({
          id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chapterId: prev.id,
          projectId,
          chapterNo: parsed.chapterNo,
          title: prev.title,
          plotPoints: prev.plotPoints,
          content: prev.content,
          wordCount: prev.wordCount,
          createdAt: Date.now(),
        });
      }
      await db.chapters.put({
        ...prev,
        title: parsed.title,
        content: parsed.content,
        wordCount,
        status: 'completed',
        updatedAt: Date.now(),
      });
      result.updated++;
    } else {
      const activeVolume = volumes.find(
        (v) => parsed.chapterNo >= v.chapterRange[0] && parsed.chapterNo <= v.chapterRange[1]
      );
      const now = Date.now();
      await db.chapters.add({
        id: generateId('ch'),
        projectId,
        volumeNo: activeVolume?.volumeNo ?? 1,
        chapterNo: parsed.chapterNo,
        title: parsed.title,
        plotPoints: [],
        content: parsed.content,
        wordCount,
        status: 'completed',
        createdAt: now,
        updatedAt: now,
      });
      result.created++;
    }
  }

  return result;
}

/** 读取用户选择的 .md 文件为文本 */
export function readMarkdownFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}
