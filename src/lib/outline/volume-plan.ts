// ============================================================================
// 自适应分卷规划（百万字长篇支持）
// 依据：产品决策「按目标字数自适应分卷」——新建/起底大纲时按字数推导卷数与
//       每卷章节区间，100 万字自动约 7 卷、50 万字约 4 卷，低字数保持 4 卷下限。
// 规则：
//   - 每章按 2500 字估算（20 万-500 万字区间的常见档位）
//   - 目标卷数 = clamp(ceil(总章数 / 60), 4, 12)，即每卷约 60 章（15-20 万字）
//   - 各卷均分章节区间，末卷承接收尾
//   - 零依赖、纯函数，便于单测与页面/表单即时预览
// ============================================================================
import type { Volume } from '@/types';

/** 每章估算字数（影响总章数与分卷均分） */
export const WORDS_PER_CHAPTER = 2500;
/** 每卷目标章数 */
export const CHAPTERS_PER_VOLUME = 60;
/** 卷数下限（保证大纲有起承转合的深度） */
export const MIN_VOLUMES = 4;
/** 卷数上限（避免卷太多管理成本过高） */
export const MAX_VOLUMES = 12;

/**
 * 主流平台爆款作品的常见章节字数标准（快捷档位）。
 * 依据 2025-2026 公开口径：番茄/七猫免费端 2000-2500 字完读率最优（1800 为隐形底线），
 * 起点/纵横付费男频 3000-4500 字，晋江女频 2500-4000 字。
 */
export const PLATFORM_CHAPTER_STANDARDS: { value: number; label: string; hint: string }[] = [
  { value: 2000, label: '番茄/七猫 · 2000 字', hint: '免费端黄金字数：完读率优先、快节奏强钩子' },
  { value: 2500, label: '通用稳妥 · 2500 字', hint: '多数平台通吃，节奏与信息量平衡' },
  { value: 3000, label: '晋江/纵横 · 3000 字', hint: '女频情感铺陈 / 传统男频常规节奏' },
  { value: 4000, label: '起点大章 · 4000 字', hint: '起点付费追更主流，情节充分展开' },
];

/** 估算总章数：向上取整并钳制到 [12, 999]；wordsPerChapter 缺省按 2500 */
export function estimateTotalChapters(targetWords: number, wordsPerChapter = WORDS_PER_CHAPTER): number {
  const per = Number.isFinite(wordsPerChapter) && wordsPerChapter >= 500 ? wordsPerChapter : WORDS_PER_CHAPTER;
  const n = Math.ceil(targetWords / per);
  return Math.min(999, Math.max(12, n));
}

/** 计算目标卷数：clamp(ceil(总章数 / 每卷章数), 4, 12) */
export function estimateVolumeCount(targetWords: number, wordsPerChapter = WORDS_PER_CHAPTER): number {
  const total = estimateTotalChapters(targetWords, wordsPerChapter);
  const vol = Math.ceil(total / CHAPTERS_PER_VOLUME);
  return Math.min(MAX_VOLUMES, Math.max(MIN_VOLUMES, vol));
}

/** 阶段卷标题（前 3 卷与末卷固定命名，中间卷按长线推进编号） */
const STAGE_TITLES = ['开局', '推进', '角力', '转折', '高潮', '变局', '深化'];

function volumeTitle(genre: string, index: number, count: number): string {
  // 注意：仅返回纯卷名主题，不带「第 N 卷」前缀——展示层与记忆层会各自拼接卷号
  if (index === 0) return `${genre}开局 · 身份与危机的引入`;
  if (index === 1) return '中期推进 · 升级与四方角力';
  if (count >= 5 && index === 2) return '转折爆发 · 真相 / 巨大危机';
  if (index === count - 1) return '终局清算 · 走向结局';
  if (index < STAGE_TITLES.length) return `${STAGE_TITLES[index]}期局势`;
  return '长线推进（新势力 / 新冲突）';
}

function volumeSummary(index: number, count: number): string {
  if (index === 0) return '交代背景与主角处境，抛出核心冲突与第一重悬念。';
  const diff = count - index;
  if (diff <= 1) return '最终对峙与清算，主线落定，呼应开头伏笔。';
  if (diff === 2) return '爆发巨大转折：真相揭露或强敌逼近，主角面临抉择。';
  if (diff === 3) return '主角获得成长（修行/事业/实力），与各方势力建立或激化关系。';
  return '长线推进：引入新势力与新冲突，主角在更大棋盘上逐步破局，为终局积蓄势能。';
}

function volumeConflict(index: number, count: number): string {
  if (index === 0) return '生存/身份危机浮现';
  const diff = count - index;
  if (diff <= 1) return '终局对决与收束';
  if (diff === 2) return '真相/背水一战';
  if (diff === 3) return '阵营冲突与实力升级';
  return '新势力登场与格局更替';
}

/**
 * 按目标字数生成自适应分卷规划。
 * @param targetWords - 项目目标字数（>0 时参与计算；0/非法按 30 万兜底）
 * @param genre - 题材（用于卷标题风味，缺省「通用」）
 * @param wordsPerChapter - 每章字数（可选，缺省 2500；影响总章数与分卷均分）
 * @returns Volume[]，章区间连续覆盖估算总章数，末卷覆盖至末章
 */
export function planVolumes(
  targetWords: number,
  genre = '通用',
  wordsPerChapter = WORDS_PER_CHAPTER
): Volume[] {
  const words = Number.isFinite(targetWords) && targetWords > 0 ? targetWords : 300000;
  const total = estimateTotalChapters(words, wordsPerChapter);
  const count = estimateVolumeCount(words, wordsPerChapter);

  const volumes: Volume[] = [];
  let start = 1;
  const base = Math.ceil(total / count);
  for (let i = 0; i < count; i++) {
    // 均分后把余量让给最后一卷，保证区间连续且覆盖全部章数
    const isLast = i === count - 1;
    const end = isLast ? total : Math.min(start + base - 1, total);
    volumes.push({
      volumeNo: i + 1,
      title: volumeTitle(genre, i, count),
      summary: volumeSummary(i, count),
      chapterRange: [start, end],
      coreConflict: volumeConflict(i, count),
    });
    start = end + 1;
  }

  return volumes;
}

/** 便于展示的摘要信息 */
export function summarizePlan(
  targetWords: number,
  genre = '通用',
  wordsPerChapter = WORDS_PER_CHAPTER
): { totalChapters: number; volumeCount: number; volumes: Volume[] } {
  const volumes = planVolumes(targetWords, genre, wordsPerChapter);
  return {
    totalChapters: volumes[volumes.length - 1].chapterRange[1],
    volumeCount: volumes.length,
    volumes,
  };
}