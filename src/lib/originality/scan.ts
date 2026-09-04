// ============================================================================
// 全书级避撞体检（Manuscript-level Originality Scan）
// 背景：百万字长篇逐章写，单章才跑 checkOriginality 无法发现「某平台热书在
//       全书多处被反复撞到」的整体风险。本模块把项目全部章节一次性扫描，
//       汇总「哪些代表作/实时热书被复刻次数最多、落在哪些章」，供作者按卷/按
//       章批量修缮，契合「volume-level health checks」目标。
// 设计：纯函数、确定性、无 LLM/无网络，注入 liveTitles / genre 复用既有查重，
//       稳定可测、零成本。
// ============================================================================
import { checkOriginality, type OriginalityReport } from './check';

export interface ChapterFragment {
  /** 章节标识（通常为 ch-章号 或 数据库 id） */
  id: string;
  /** 章节标题（可选，仅用于展示/定位） */
  title?: string;
  /** 该章正文 */
  content: string;
}

export interface ChapterScanHit {
  chapterId: string;
  title: string;
  report: OriginalityReport;
}

export interface TopWork {
  /** 被撞作品的标题 */
  workTitle: string;
  /** 在多少章被命中 */
  count: number;
  /** 命中章节标识 */
  chapters: string[];
}

export interface ChapterScanResult {
  /** 实际扫描章数（不含空正文） */
  scanned: number;
  /** 有命中（撞梗）的章数 */
  chaptersWithHits: number;
  /** 命中总次数（跨章累加） */
  totalHits: number;
  /** 是否「全书无明显撞梗，可继续推进」 */
  passed: boolean;
  /** 原生度平均/最低可看 passed；命中章节明细 */
  hits: ChapterScanHit[];
  /** 全书最常被撞的作品排名（跨章去重按次数） */
  topWorks: TopWork[];
}

export interface ScanOptions {
  /** 运行时叠加黑名单：实时榜单热书作品名 */
  liveTitles?: string[];
  /** 限定题材（仅对该题材作品库比对，降低跨类误报） */
  genre?: string;
  /** 只报撞梗的前 N 部（topWorks 截断，缺省 5） */
  topN?: number;
}

/**
 * 对项目全部章节做一次避撞体检。
 * @param chapters 章节列表
 */
export function scanChaptersOriginality(
  chapters: ChapterFragment[],
  options: ScanOptions = {}
): ChapterScanResult {
  const { liveTitles, genre, topN = 5 } = options;
  const hits: ChapterScanHit[] = [];
  let scanned = 0;
  let totalHits = 0;
  const workCount = new Map<string, string[]>();

  for (const ch of chapters) {
    const text = (ch.content ?? '').trim();
    if (!text) continue; // 跳过空正文章
    scanned++;
    const report = checkOriginality(text, { liveTitles, genre });
    if (report.hits.length > 0) {
      hits.push({ chapterId: ch.id, title: ch.title ?? '', report });
      totalHits += report.hits.length;
      for (const h of report.hits) {
        const list = workCount.get(h.workTitle) ?? [];
        if (!list.includes(ch.id)) list.push(ch.id);
        workCount.set(h.workTitle, list);
      }
    }
  }

  const topWorks: TopWork[] = [...workCount.entries()]
    .map(([workTitle, chapters]) => ({ workTitle, count: chapters.length, chapters }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  const passed = totalHits === 0;
  return { scanned, chaptersWithHits: hits.length, totalHits, passed, hits, topWorks };
}
