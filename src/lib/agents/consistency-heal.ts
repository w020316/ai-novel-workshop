// ============================================================================
// 一致性自愈（Consistency Self-heal）
// 用途：把多章一致性问题聚合为「设定侧修订建议」，引导作者修订世界观/人物档案，
//       而非仅停留在「哪章报错」。纯函数、确定性、无 LLM/无网络、可测。
// 边界：本模块只做「定位+聚合+建议」，不自动改写设定（避免未经审阅覆盖人设）。
// ============================================================================
import type { ConsistencyReport } from '@/types';

export type SettingFixableType = 'character' | 'worldview';
export const SETTING_FIXABLE_TYPES: SettingFixableType[] = ['character', 'worldview'];

/** 跨章聚合后的一条设定侧问题 */
export interface SettingIssueAggregate {
  type: SettingFixableType;
  /** 归一化摘要（去重键）：type + description */
  key: string;
  description: string;
  suggestion: string;
  maxSeverity: 'warning' | 'error';
  /** 命中章 id 列表 */
  chapters: string[];
  /** 命中次数（跨章累计） */
  count: number;
}

export interface ConsistencyHealResult {
  /** 设定侧（character/worldview）问题聚合，按命中次数降序 */
  settingIssues: SettingIssueAggregate[];
  /** 剧情/伏笔/文风类（正文侧，非设定修订）问题数 */
  contentSideCount: number;
  /** 全部问题数 */
  totalIssues: number;
}

/** 指纹：type + description 归一化，作为去重键（strip 空白） */
export function issueKey(issue: { type: string; description: string }): string {
  return `${issue.type}:${(issue.description ?? '').replace(/\s+/g, '').slice(0, 60)}`;
}

/**
 * 聚合多个章节的一致性报告：
 *   - character/worldview 问题跨章折叠为 settingIssues（含命中章与次数）
 *   - 其余（plot/foreshadowing/style）计入 contentSide（正文侧，另行处理）
 * @param reports[] 各章报告（可为空）
 */
export function aggregateConsistencyIssues(
  reports: ConsistencyReport[]
): ConsistencyHealResult {
  const map = new Map<string, SettingIssueAggregate>();
  let contentSideCount = 0;
  let totalIssues = 0;
  const sevRank = { warning: 0, error: 1 } as const;

  for (const r of reports) {
    for (const issue of r.issues) {
      totalIssues++;
      if (issue.type === 'character' || issue.type === 'worldview') {
        const key = issueKey(issue);
        const existing = map.get(key);
        if (existing) {
          existing.chapters.push(r.chapterId);
          existing.count++;
          if (sevRank[issue.severity] > sevRank[existing.maxSeverity]) {
            existing.maxSeverity = issue.severity;
          }
        } else {
          map.set(key, {
            type: issue.type as SettingFixableType,
            key,
            description: issue.description,
            suggestion: issue.suggestion,
            maxSeverity: issue.severity,
            chapters: [r.chapterId],
            count: 1,
          });
        }
      } else {
        contentSideCount++;
      }
    }
  }

  const settingIssues = [...map.values()].sort(
    (a, b) => b.count - a.count || sevRank[b.maxSeverity] - sevRank[a.maxSeverity]
  );
  return { settingIssues, contentSideCount, totalIssues };
}

/**
 * 把一条 character 类一致性问题的聚合，翻译为「人物档案修订建议」文本。
 * 确定性、可复制给作者手动应用；不自动改写人物。
 */
export function buildCharacterFixProposal(agg: SettingIssueAggregate): string {
  const hits = `涉及 ${agg.chapters.length} 章（累计 ${agg.count} 次）`;
  return [
    `【人物一致性修订建议】`,
    `问题：${agg.description}`,
    `建议：${agg.suggestion}`,
    hits,
  ].join('\n');
}

/**
 * 从聚合结果筛选「error 级且多次出现」的最值得处理项，供 UI 标注优先级。
 * @param max 最多返回条数
 */
export function topCriticalIssues(
  result: ConsistencyHealResult,
  max = 5
): SettingIssueAggregate[] {
  return result.settingIssues
    .filter((s) => s.maxSeverity === 'error')
    .slice(0, Math.max(0, max));
}