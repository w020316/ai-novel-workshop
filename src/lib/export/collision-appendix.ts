// ============================================================================
// 导出附录：全书避撞体检报告（供 TXT / Markdown 导出末尾附加）
// 复用 scanChaptersOriginality 扫描全部章节，拼装为可读的纯文本/Markdown 块，
// 让交付物自带「查重清单」——作者投稿前即可知晓哪些章与平台代表作/实时热书撞梗。
// 设计：纯函数、无网络/无 IndexedDB，可测。
// ============================================================================
import { scanChaptersOriginality, type ChapterFragment } from '@/lib/originality/scan';

export interface CollisionAppendixOptions {
  /** 运行时叠加黑名单：实时榜单热书作品名 */
  liveTitles?: string[];
  /** 限定题材（缺省全库） */
  genre?: string;
}

/**
 * 构建「避撞体检报告」附录正文。
 * 无撞梗时返回精简的通过说明；有撞梗时列出全书最常被撞作品 + 命中章号。
 */
export function buildCollisionAppendix(
  chapters: ChapterFragment[],
  options: CollisionAppendixOptions = {}
): string {
  const { liveTitles, genre } = options;
  const r = scanChaptersOriginality(chapters, { liveTitles, genre });
  const L: string[] = [];
  L.push('');
  L.push('='.repeat(52));
  L.push('附录 · 全书避撞体检报告');
  L.push('='.repeat(52));
  L.push('');

  if (r.scanned === 0) {
    L.push('（暂无已完成章节，未执行避撞体检）');
    return L.join('\n');
  }

  if (r.passed) {
    L.push('✔ 扫描 ' + r.scanned + ' 章，未发现与平台代表作 / 实时热书撞梗，可放心投稿。');
    L.push('（本报告由「AI 小说制作工坊」内置作品库 + 实时榜单黑名单生成，仅供自查参考，不构成平台审核承诺。）');
    return L.join('\n');
  }

  L.push('扫描 ' + r.scanned + ' 章，发现 ' + r.totalHits + ' 处撞梗（涉及 ' + r.chaptersWithHits + ' 章）：');
  L.push('');
  if (r.topWorks.length > 0) {
    L.push('【全书最常被撞的作品】');
    for (const w of r.topWorks) {
      L.push('- 《' + w.workTitle + '》× ' + w.count + ' 章（章号：' + w.chapters.join('、') + '）');
    }
    L.push('');
  }
  L.push('【命中章节明细】');
  for (const h of r.hits) {
    const names = h.report.hits.map((x) => '《' + x.workTitle + '》·' + x.matched).join('；');
    L.push('- 第' + h.chapterId + '章' + (h.title ? ' ' + h.title : '') + '：' + names);
  }
  L.push('');
  L.push('提示：请对命中章节按卷调整设定/表述，做差异化改写后再投稿。');
  return L.join('\n');
}
