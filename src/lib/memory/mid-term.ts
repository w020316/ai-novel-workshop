// ============================================================================
// 中期记忆查询
// 依据：spec 5.5 节 / 计划 P4.3
// 职责：
// 1. 检索相关章节摘要（基于向量相似度或 TF-IDF）
// 2. 加载活跃支线剧情
// 3. 加载待回收伏笔
// 4. 加载人物状态
// ============================================================================
import type { MidTermMemory, ChapterSummary, PlotThread, Foreshadowing } from '@/types';
import { listChapterSummaries, listForeshadowings } from '@/lib/db/queries';
import { TfIdfIndex } from './tfidf';

/**
 * 加载项目的中期记忆
 * 中期记忆包含：相关章节摘要、活跃支线、待回收伏笔、人物状态
 *
 * @param projectId - 项目 ID
 * @param chapterNo - 当前章节号（用于决定检索范围）
 * @param query - 当前剧情要点（用于向量/TF-IDF 检索）
 * @param options - 检索选项
 * @returns MidTermMemory 对象
 */
export async function loadMidTermMemory(
  projectId: string,
  chapterNo: number,
  query: string,
  options: { topK?: number } = {}
): Promise<MidTermMemory> {
  const topK = options.topK ?? 5;

  // 1. 加载所有章节摘要
  const allSummaries = await listChapterSummaries(projectId);

  // 2. 检索相关摘要（基于 TF-IDF 关键词匹配）
  const relevantSummaries = query
    ? searchRelevantSummaries(projectId, allSummaries, query, chapterNo, topK)
    : getRecentSummaries(allSummaries, chapterNo, topK);

  // 3. 加载所有伏笔，筛选出待回收的
  const allForeshadowings = await listForeshadowings(projectId);
  const foreshadowingsToRecover = allForeshadowings.filter(
    (f) =>
      f.status === 'pending' &&
      (f.plannedRecoveryChapter === undefined ||
        f.plannedRecoveryChapter >= chapterNo)
  );

  // 4. 活跃支线（从章节摘要提取）
  const activePlotThreads = extractPlotThreads(projectId, relevantSummaries, allForeshadowings);

  // 5. 人物状态（从相关摘要中提取）
  const characterStates = extractCharacterStates(relevantSummaries);

  return {
    relevantSummaries,
    activePlotThreads,
    foreshadowingsToRecover,
    characterStates,
  };
}

/**
 * 使用 TF-IDF 检索相关章节摘要。
 * 性能：进程级签名缓存——同一次章节生成内（剧情设计/写作等多次调用）摘要集合
 * 未变化时直接复用已建索引，避免全量重建；集合变化（章末写入新摘要）才重建。
 * 取舍：未做增量 add（IDF 语义会漂移），百万字批量场景下重建次数已降为每章一次。
 */
const tfidfCache = new Map<string, { sig: string; index: TfIdfIndex }>();

function searchRelevantSummaries(
  projectId: string,
  summaries: ChapterSummary[],
  query: string,
  currentChapterNo: number,
  topK: number
): ChapterSummary[] {
  // 过滤出当前章节之前的摘要
  const prevSummaries = summaries.filter(
    (s) => s.chapterNo < currentChapterNo
  );
  if (prevSummaries.length === 0) return [];

  const sig = `${prevSummaries.length}:${prevSummaries[prevSummaries.length - 1]?.chapterId ?? ''}`;
  const cached = tfidfCache.get(projectId);
  let index: TfIdfIndex;
  if (cached && cached.sig === sig) {
    index = cached.index;
  } else {
    index = new TfIdfIndex();
    index.build(
      prevSummaries.map((s) => ({
        id: s.chapterId,
        text: s.summary,
        metadata: { chapterNo: s.chapterNo },
      }))
    );
    tfidfCache.set(projectId, { sig, index });
    // 防多项目长会话内存缓慢增长：只保留最近 4 个项目的索引
    if (tfidfCache.size > 4) {
      const oldest = tfidfCache.keys().next().value;
      if (oldest !== undefined) tfidfCache.delete(oldest);
    }
  }

  // 搜索
  const results = index.search(query, topK);

  // 映射回 ChapterSummary
  const summaryMap = new Map(prevSummaries.map((s) => [s.chapterId, s]));
  return results
    .map((r) => summaryMap.get(r.id))
    .filter((s): s is ChapterSummary => s !== undefined);
}

/**
 * 获取最近 N 章摘要（当无查询关键词时使用）
 */
function getRecentSummaries(
  summaries: ChapterSummary[],
  currentChapterNo: number,
  count: number
): ChapterSummary[] {
  return summaries
    .filter((s) => s.chapterNo < currentChapterNo)
    .sort((a, b) => b.chapterNo - a.chapterNo)
    .slice(0, count);
}

/**
 * 从章节摘要中提取活跃支线
 */
function extractPlotThreads(
  projectId: string,
  summaries: ChapterSummary[],
  foreshadowings: Foreshadowing[]
): PlotThread[] {
  const threads: PlotThread[] = [];
  const seen = new Set<string>();

  // 从伏笔推测支线
  for (const f of foreshadowings) {
    if (f.status === 'pending' && !seen.has(f.description)) {
      seen.add(f.description);
      threads.push({
        id: f.id,
        projectId,
        name: f.description.slice(0, 20),
        type: 'subplot',
        description: f.description,
        status: 'active',
        relatedChapters: [],
        embedding: new Float32Array(),
        updatedAt: Date.now(),
      });
    }
  }

  // 从摘要关键词推测支线
  const threadKeywords = [
    '寻找', '追查', '调查', '修炼', '历练', '突破',
    '阴谋', '秘密', '真相', '复仇', '守护', '争夺',
  ];

  for (const summary of summaries) {
    for (const keyword of threadKeywords) {
      if (summary.summary.includes(keyword) && !seen.has(keyword)) {
        seen.add(keyword);
        threads.push({
          id: `thread_${keyword}`,
          projectId,
          name: keyword,
          type: 'subplot',
          description: keyword,
          status: 'active',
          relatedChapters: [],
          embedding: new Float32Array(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  return threads;
}

/**
 * 从章节摘要中提取人物状态。
 * 修复：同一章命中多个状态时按发现顺序合并（顿号连接），
 * 而非 last-write-wins 覆盖——此前「第3章 受伤+突破」只会留下「突破」。
 */
function extractCharacterStates(
  summaries: ChapterSummary[]
): Record<string, string> {
  const states: Record<string, string> = {};

  // 从摘要中提取人物提及（简化版：按关键词匹配）
  const characterKeywords: Record<string, string[]> = {
    '受伤': ['重伤', '负伤', '受伤', '伤势'],
    '突破': ['突破', '进阶', '晋级', '升级'],
    '昏迷': ['昏迷', '晕倒', '沉睡'],
    '觉醒': ['觉醒', '苏醒', '领悟'],
    '逃亡': ['逃亡', '逃跑', '逃离', '遁走'],
  };

  for (const summary of summaries) {
    const key = `chapter_${summary.chapterNo}`;
    for (const [state, keywords] of Object.entries(characterKeywords)) {
      if (keywords.some((kw) => summary.summary.includes(kw))) {
        const prev = states[key];
        if (!prev) {
          states[key] = state;
        } else if (!prev.split('、').includes(state)) {
          states[key] = `${prev}、${state}`;
        }
      }
    }
  }

  return states;
}