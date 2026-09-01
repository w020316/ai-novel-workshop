// ============================================================================
// 卷级健康体检
// 依据：计划「卷级健康体检」
// 职责：对标亿字长篇「不烂文」四大杀手做全局体检——
//       主线进度、伏笔积压/超期、角色活跃/遗忘、平均字数与战斗通胀信号。
// 说明：此项为确定性启发式聚合，不依赖 LLM，稳定可测；LLM 深入审查由上层按需触发。
// ============================================================================
import type {
  NovelProject,
  Outline,
  Foreshadowing,
  Character,
  ChapterSummary,
} from '@/types';
import {
  getProject,
  getOutline,
  listForeshadowings,
  listCharacters,
  listChapterSummaries,
  getProjectStats,
} from '@/lib/db/queries';

export type HealthSeverity = 'info' | 'warning' | 'error';

export interface HealthIssue {
  dimension:
    | 'mainline'
    | 'foreshadowing'
    | 'character'
    | 'power'
    | 'pacing'
    | 'words';
  severity: HealthSeverity;
  title: string;
  detail: string;
  suggestion?: string;
  relatedChapters?: number[];
}

export interface HealthMetrics {
  totalWords: number;
  totalChapters: number;
  completedChapters: number;
  /** 规划总章数（按卷末章号或目标字数估算），无则 null */
  plannedChapters: number | null;
  /** 主线完成度（%），无规划则 null */
  mainlineProgress: number | null;
  /** 待回收伏笔总数 */
  foreshadowingBacklog: number;
  /** 已超计划回收章节仍未回收的伏笔数 */
  overdrawnForeshadowings: number;
  /** 疑似被遗忘的重点角色数（长期未出场） */
  inactiveMainCharacters: number;
  /** 平均每章字数 */
  avgWordsPerChapter: number;
}

export interface ProjectHealthReport {
  projectId: string;
  generatedAt: number;
  summary: string;
  metrics: HealthMetrics;
  issues: HealthIssue[];
}

/** 默认每章目标字数（用于估算规划总章数） */
const WORDS_PER_CHAPTER = 2500;
/** 战力通胀启发阈值：升级类关键词频率高于此比例触发提醒 */
const POWER_WORD_RATIO = 0.3;

/** 升级/战力提升高频词（警惕战力通胀、升级流水账） */
const POWER_WORDS = ['突破', '晋级', '重修', '顿悟', '觉醒', '凝神', '神格'];

/**
 * 运行项目的健康体检
 */
export async function runHealthCheck(projectId: string): Promise<ProjectHealthReport> {
  const [project, outline, characters, foreshadowings, summaries, stats] =
    await Promise.all([
      getProject(projectId),
      getOutline(projectId),
      listCharacters(projectId),
      listForeshadowings(projectId),
      listChapterSummaries(projectId),
      getProjectStats(projectId),
    ]);

  const currentMaxChapter = computeCurrentMaxChapter(summaries, stats.totalChapters);
  const targetWords = project?.targetWords ?? 100000;
  const plannedChapters = estimatePlannedChapters(project, outline);

  const metrics: HealthMetrics = {
    totalWords: stats.totalWords,
    totalChapters: stats.totalChapters,
    completedChapters: stats.completedChapters,
    plannedChapters,
    mainlineProgress:
      plannedChapters && plannedChapters > 0
        ? Math.min(100, Math.round((stats.totalChapters / plannedChapters) * 100))
        : null,
    foreshadowingBacklog: backlogForeshadowings(foreshadowings).length,
    overdrawnForeshadowings: overdrawnForeshadowings(foreshadowings, currentMaxChapter).length,
    inactiveMainCharacters: findInactiveCharacters(
      characters,
      summaries,
      currentMaxChapter
    ).length,
    avgWordsPerChapter:
      stats.totalChapters > 0 ? Math.round(stats.totalWords / stats.totalChapters) : 0,
  };

  const issues: HealthIssue[] = [
    ...buildMainlineIssues(outline),
    ...buildForeshadowingIssues(foreshadowings, currentMaxChapter),
    ...buildCharacterIssues(characters, summaries, currentMaxChapter),
    ...buildPowerIssues(summaries, stats.totalChapters),
    ...buildPacingIssues(metrics, targetWords),
  ].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    projectId,
    generatedAt: Date.now(),
    summary: buildSummary(metrics, project?.title),
    metrics,
    issues,
  };
}

/** ===== 汇总 ===== */
function buildSummary(metrics: HealthMetrics, title?: string): string {
  const parts: string[] = [title ? `《${title}》` : '本项目'];
  if (metrics.mainlineProgress != null) {
    parts.push(`主线进度约 ${metrics.mainlineProgress}%`);
  }
  parts.push(`共 ${metrics.totalChapters} 章 / ${metrics.totalWords.toLocaleString()} 字`);
  if (metrics.foreshadowingBacklog > 0) {
    parts.push(`待回收伏笔 ${metrics.foreshadowingBacklog} 条`);
  }
  if (metrics.inactiveMainCharacters > 0) {
    parts.push(`疑似被遗忘角色 ${metrics.inactiveMainCharacters} 位`);
  }
  return `${parts.join('，')}。`;
}

/** ===== 主线进度 ===== */
function buildMainlineIssues(outline: Outline | undefined): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (!outline) {
    issues.push({
      dimension: 'mainline',
      severity: 'error',
      title: '缺少大纲规划',
      detail: '尚未创建大纲，生成将缺少主线锚点牵引，长篇小说极易中途跑偏。',
      suggestion: '先用「大纲」规划主线、卷目标与结局，再批量生成章节。',
    });
    return issues;
  }
  if (!outline.mainPlotline) {
    issues.push({
      dimension: 'mainline',
      severity: 'warning',
      title: '主线描述为空',
      detail: '大纲未填写主线描述，主线锚点约束较弱。',
      suggestion: '在大纲中补充「主线（一句话）」以强化每章的牵引。',
    });
  }
  if (!outline.ending) {
    issues.push({
      dimension: 'mainline',
      severity: 'warning',
      title: '未设定结局归宿',
      detail: '缺少结局会让生成缺乏终点导向，长线容易失控。',
      suggestion: '在大纲中填写结局走向，让每章都向终点推进。',
    });
  }
  return issues;
}

/** ===== 伏笔 ===== */
function backlogForeshadowings(fs: Foreshadowing[]): Foreshadowing[] {
  return fs.filter((f) => f.status === 'planted' || f.status === 'pending');
}

function overdrawnForeshadowings(
  fs: Foreshadowing[],
  currentMaxChapter: number
): Foreshadowing[] {
  return backlogForeshadowings(fs).filter(
    (f) => f.plannedRecoveryChapter != null && currentMaxChapter > f.plannedRecoveryChapter
  );
}

function buildForeshadowingIssues(
  fs: Foreshadowing[],
  currentMaxChapter: number
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const overdrawn = overdrawnForeshadowings(fs, currentMaxChapter);
  if (overdrawn.length > 0) {
    issues.push({
      dimension: 'foreshadowing',
      severity: 'warning',
      title: `有 ${overdrawn.length} 条伏笔超期未回收`,
      detail: overdrawn
        .map((f) => `${f.description}（计划回收于第 ${f.plannedRecoveryChapter} 章）`)
        .join('；'),
      suggestion: '在后续章节中按计划回收，避免伏笔烂尾。',
    });
  }
  return issues;
}

/** ===== 角色活跃 / 遗忘 ===== */
function findInactiveCharacters(
  characters: Character[],
  summaries: ChapterSummary[],
  currentMaxChapter: number
): Character[] {
  // 自适应阈值：连续缺席当前长度的约 15%（且不少于 10 章）视为疑似遗忘，适配短篇到千万字长篇
  const threshold = Math.max(10, Math.round(currentMaxChapter * 0.15));
  return characters.filter((c) => {
    if (c.role === 'minor') return false; // 次要角色不作为重点检测对象
    let lastSeen = 0;
    for (const s of summaries) {
      if (s.characterStates && c.id in s.characterStates) {
        lastSeen = Math.max(lastSeen, s.chapterNo);
      }
    }
    // 从未出场且故事已铺开，或长期未再出场
    if (lastSeen === 0) return currentMaxChapter > 10;
    return currentMaxChapter - lastSeen > threshold;
  });
}

function buildCharacterIssues(
  characters: Character[],
  summaries: ChapterSummary[],
  currentMaxChapter: number
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const missed = findInactiveCharacters(characters, summaries, currentMaxChapter);
  if (missed.length > 0) {
    issues.push({
      dimension: 'character',
      severity: 'warning',
      title: `${missed.length} 位重点角色疑似被遗忘`,
      detail: missed.map((c) => c.name).join('、') + ' 已在连续很长篇幅未出场。',
      suggestion: '在近期章节安排其回归或交代去向，防止角色断层。',
    });
  }
  return issues;
}

/** ===== 战力通胀 / 升级节奏 ===== */
function buildPowerIssues(
  summaries: ChapterSummary[],
  totalChapters: number
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (totalChapters === 0 || summaries.length === 0) return issues;

  const texts = summaries.map((s) => s.summary).join(' ');
  let powerCount = 0;
  for (const w of POWER_WORDS) {
    const re = new RegExp(w, 'g');
    const m = texts.match(re);
    if (m) powerCount += m.length;
  }
  if (powerCount / totalChapters > POWER_WORD_RATIO) {
    issues.push({
      dimension: 'power',
      severity: 'warning',
      title: '力量升级过于频繁，警惕战力通胀',
      detail: `升级/突破类关键词出现约 ${powerCount} 次（均每章 ${(powerCount / totalChapters).toFixed(1)} 次）。`,
      suggestion: '放缓升级节奏，多聚焦人设、博弈与主线推进，避免战力求爽导致设定崩坏。',
    });
  }
  return issues;
}

/** ===== 节奏 / 字数 ===== */
function buildPacingIssues(
  metrics: HealthMetrics,
  targetWords: number
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (metrics.totalChapters === 0) return issues;

  if (metrics.totalWords < targetWords * 0.3 && metrics.totalChapters > 5) {
    issues.push({
      dimension: 'words',
      severity: 'warning',
      title: '当前篇幅显著低于目标',
      detail: `已完成 ${metrics.totalChapters} 章约 ${metrics.totalWords.toLocaleString()} 字，距目标 ${targetWords.toLocaleString()} 字仍有较大距离。`,
      suggestion: '适当回归主线推进进度，避免停留在开局阶段。',
    });
  }
  if (metrics.avgWordsPerChapter < 800) {
    issues.push({
      dimension: 'pacing',
      severity: 'warning',
      title: '平均每章字数偏低',
      detail: `平均约 ${metrics.avgWordsPerChapter} 字/章，信息密度可能不足。`,
      suggestion: '检查是否频繁出现半章断更或流水账式短章。',
    });
  }
  return issues;
}

/** ===== 工具 ===== */
function computeCurrentMaxChapter(
  summaries: ChapterSummary[],
  totalChapters: number
): number {
  const fromSummaries = summaries.reduce((max, s) => Math.max(max, s.chapterNo || 0), 0);
  return Math.max(fromSummaries, totalChapters);
}

function estimatePlannedChapters(
  project: NovelProject | undefined,
  outline: Outline | undefined
): number | null {
  if (outline && outline.volumes.length > 0) {
    const end = outline.volumes.reduce((max, v) => Math.max(max, v.chapterRange?.[1] ?? 0), 0);
    if (end > 0) return end;
  }
  const target = project?.targetWords;
  if (target && target > 0) return Math.ceil(target / WORDS_PER_CHAPTER);
  return null;
}

function severityRank(s: HealthSeverity): number {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2;
}

/** ===== LLM 深度审查（可选，供上层按需调用） ===== */
export const POWER_HEALTH_DIMENSIONS = [
  'mainline' as const,
  'foreshadowing' as const,
  'power' as const,
  'pacing' as const,
];