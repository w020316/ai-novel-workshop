// ============================================================================
// 记忆装配器
// 依据：spec 5.5 节 / 计划 P4.5
// 职责：
// 1. 组装三级记忆（长期 + 中期 + 短期）为统一结构
// 2. Token 预算控制（压缩策略）
// 3. 生成 Prompt 用的记忆文本
// ============================================================================
import { estimateTokens, truncateAtSentence } from '@/lib/utils';
import type { AssembledMemory, LongTermMemory, MidTermMemory, ShortTermMemory } from '@/types';

/** 默认 Token 预算 */
const DEFAULT_TOKEN_BUDGET = 4096;

/** 各层级预算分配比例 */
const BUDGET_RATIO = {
  longTerm: 0.5,   // 长期记忆占 50%
  midTerm: 0.3,    // 中期记忆占 30%
  shortTerm: 0.2,  // 短期记忆占 20%
};

/**
 * 获取当前 session 的短期记忆
 * 从 Zustand store 中读取
 */
import { useShortTermMemory } from '@/lib/store/short-term-memory';

/**
 * 组装三级记忆
 * 从长期/中期/短期记忆源加载数据，合并为统一结构
 * 并在 Token 预算内进行压缩
 *
 * @param longTerm - 长期记忆
 * @param midTerm - 中期记忆
 * @param shortTerm - 短期记忆（可选，从 store 读取）
 * @param maxTokens - Token 预算上限（默认 4096）
 * @returns AssembledMemory
 */
export async function assembleMemory(
  longTerm: LongTermMemory,
  midTerm: MidTermMemory,
  shortTerm?: ShortTermMemory,
  maxTokens = DEFAULT_TOKEN_BUDGET
): Promise<AssembledMemory> {
  // 1. 若未传入 shortTerm，从 Zustand store 读取
  const resolvedShortTerm: ShortTermMemory =
    shortTerm ?? getShortTermFromStore();

  const assembled: AssembledMemory = {
    longTerm,
    midTerm,
    shortTerm: resolvedShortTerm,
    tokenEstimate: 0,
  };

  // 2. 估算当前 Token 消耗
  assembled.tokenEstimate = estimateMemoryTokens(assembled);

  // 3. 若超预算，执行压缩策略
  if (assembled.tokenEstimate > maxTokens) {
    return compressMemory(assembled, maxTokens);
  }

  return assembled;
}

/**
 * 估算记忆的 Token 消耗
 * 导出供降级路径复用统一估算口径（避免降级时错误地记为 0）
 * 口径对齐：覆盖 memoryToPrompt 实际注入 prompt 的全部字段
 * （worldview 6 字段、人物全字段、大纲主线/高潮/结局、伏笔、文风、
 *   中期摘要/支线、短期前情/要点），防止估算偏低使压缩阈值形同虚设。
 */
export function estimateMemoryTokens(memory: AssembledMemory): number {
  let total = 0;

  // 长期记忆 · 世界观（与 memoryToPrompt 输出一致的全部字段）
  if (memory.longTerm.worldview) {
    const wv = memory.longTerm.worldview;
    total += estimateStringTokens(wv.worldStructure ?? '');
    total += estimateStringTokens(wv.powerSystem ?? '');
    total += estimateStringTokens(wv.geography ?? '');
    total += estimateStringTokens(wv.era ?? '');
    total += estimateStringTokens(wv.factions ?? '');
    total += estimateStringTokens((wv.rules ?? []).join('\n'));
  }

  // 长期记忆 · 人物（含 memoryToPrompt 会输出的 name/role/motivation/weakness）
  for (const c of memory.longTerm.characters) {
    total += estimateStringTokens(
      [c.name, c.role, c.appearance, c.personality, c.background, c.motivation, c.weakness]
        .map((s) => s ?? '')
        .join('')
    );
    // growthArc/speechStyle/behaviorPattern 虽未进 memoryToPrompt，但会被人物卡等
    // 下游消费，一并计入防止整体低估
    total += estimateStringTokens([c.growthArc, c.speechStyle, c.behaviorPattern].map((s) => s ?? '').join(''));
  }

  // 长期记忆 · 大纲（主线 + 高潮节点 + 结局 + 卷计划）
  if (memory.longTerm.outline) {
    const o = memory.longTerm.outline;
    total += estimateStringTokens(o.mainPlotline ?? '');
    total += estimateStringTokens((o.climaxNodes ?? []).join('\n'));
    total += estimateStringTokens(o.ending ?? '');
    // 卷计划：memoryToPrompt 会注入当前卷的标题/核心冲突/剧情走向，
    // 全量卷文本计入防止低估（高估只会提前触发压缩，处于安全侧）
    for (const v of o.volumes ?? []) {
      total += estimateStringTokens(
        [v.title, v.coreConflict, v.summary].map((s) => s ?? '').join('')
      );
    }
  }

  // 长期记忆 · 伏笔
  for (const f of memory.longTerm.pendingForeshadowings) {
    total += estimateStringTokens(f.description);
  }

  // 长期记忆 · 文风预设（名称 + 样本）
  if (memory.longTerm.stylePreset) {
    total += estimateStringTokens(memory.longTerm.stylePreset.name ?? '');
    total += estimateStringTokens(memory.longTerm.stylePreset.sampleText ?? '');
  }

  // 中期记忆
  for (const s of memory.midTerm.relevantSummaries) {
    total += estimateStringTokens(s.summary);
  }
  for (const t of memory.midTerm.activePlotThreads) {
    total += estimateStringTokens(t.description);
  }

  // 短期记忆
  for (const s of memory.shortTerm.prevChapters) {
    total += estimateStringTokens(s.summary);
  }
  for (const p of memory.shortTerm.currentPlotPoints) {
    total += estimateStringTokens(p);
  }

  return total;
}

/**
 * Token 预算压缩策略
 * 压缩顺序：中期摘要 → 短期记忆 → 长期人物 → 世界观
 */
function compressMemory(
  memory: AssembledMemory,
  maxTokens: number
): AssembledMemory {
  const compressed = { ...memory };
  const target = {
    longTerm: Math.floor(maxTokens * BUDGET_RATIO.longTerm),
    midTerm: Math.floor(maxTokens * BUDGET_RATIO.midTerm),
    shortTerm: Math.floor(maxTokens * BUDGET_RATIO.shortTerm),
  };

  // 1. 压缩中期记忆（减少相关摘要数量）
  const midTermTokens = estimateStringTokens(
    compressed.midTerm.relevantSummaries.map((s) => s.summary).join('')
  );
  if (midTermTokens > target.midTerm) {
    compressed.midTerm.relevantSummaries = truncateSummaries(
      compressed.midTerm.relevantSummaries,
      target.midTerm
    );
  }

  // 2. 压缩短期记忆
  const shortTermTokens = estimateStringTokens(
    compressed.shortTerm.prevChapters.map((s) => s.summary).join('')
  );
  if (shortTermTokens > target.shortTerm) {
    compressed.shortTerm.prevChapters = truncateSummaries(
      compressed.shortTerm.prevChapters,
      target.shortTerm
    );
  }

  // 3. 压缩长期记忆 - 人物描述
  const longTermTokens = estimateMemoryTokensSimple(compressed);
  if (longTermTokens > target.longTerm) {
    compressed.longTerm.characters = compressed.longTerm.characters.map(
      (c) => ({
        ...c,
        appearance: truncateAtSentence(c.appearance, 100),
        background: truncateAtSentence(c.background, 100),
      })
    );
  }

  // 重新计算 Token 估算
  const tokenEstimate = estimateMemoryTokens(compressed);
  return { ...compressed, tokenEstimate };
}

/**
 * 截断摘要列表直到 Token 预算内
 */
function truncateSummaries<T extends { summary: string }>(
  summaries: T[],
  maxTokens: number
): T[] {
  const result: T[] = [];
  let tokens = 0;

  // 按相关性排序（假设数组已按相关度降序排列）
  for (const s of summaries) {
    const t = estimateStringTokens(s.summary);
    if (tokens + t > maxTokens) break;
    result.push(s);
    tokens += t;
  }

  return result;
}

/**
 * 简化的记忆 Token 估算（仅长期记忆部分）
 */
function estimateMemoryTokensSimple(memory: AssembledMemory): number {
  let total = 0;
  for (const c of memory.longTerm.characters) {
    total += estimateStringTokens(c.appearance + c.background);
  }
  total += estimateStringTokens(memory.longTerm.worldview?.worldStructure ?? '');
  return total;
}

/**
 * 从 Zustand store 读取短期记忆
 */
function getShortTermFromStore(): ShortTermMemory {
  const state = useShortTermMemory.getState();
  return {
    prevChapters: state.prevChapters,
    currentPlotPoints: state.currentPlotPoints,
  };
}

/**
 * 将记忆装配为 Prompt 文本
 * 供多智能体使用
 *
 * @param memory - 装配好的三级记忆
 * @param opts - 可选：chapterNo 用于聚焦当前卷（主线锚点注入）；anchorMode 为 true 时要求必须输出主线锚点
 */
export interface MemoryPromptOptions {
  chapterNo?: number;
}

export function memoryToPrompt(
  memory: AssembledMemory,
  opts?: MemoryPromptOptions
): string {
  const parts: string[] = [];

  // ===== 世界观 =====
  if (memory.longTerm.worldview) {
    const wv = memory.longTerm.worldview;
    parts.push('【世界观设定】');
    if (wv.worldStructure) parts.push(`世界架构：${wv.worldStructure}`);
    if (wv.powerSystem) parts.push(`力量体系：${wv.powerSystem}`);
    if (wv.geography) parts.push(`地理：${wv.geography}`);
    if (wv.era) parts.push(`时代背景：${wv.era}`);
    if (wv.factions) parts.push(`势力划分：${wv.factions}`);
    if (wv.rules?.length) parts.push(`世界规则：${wv.rules.join('；')}`);
    parts.push('');
  }

  // ===== 人物档案 =====
  if (memory.longTerm.characters.length > 0) {
    parts.push('【人物档案】');
    for (const c of memory.longTerm.characters) {
      const desc = [
        c.name && `${c.name}`,
        c.role && `（${c.role}）`,
        c.appearance && `：${c.appearance}`,
        c.personality && `性格：${c.personality}`,
        c.background && `背景：${c.background}`,
        c.motivation && `执念：${c.motivation}`,
        c.weakness && `弱点：${c.weakness}`,
      ]
        .filter(Boolean)
        .join('');
      parts.push(desc);
    }
    parts.push('');
  }

  // ===== 大纲（主线锚点 · 强制注入） =====
  if (memory.longTerm.outline) {
    const outline = memory.longTerm.outline;
    parts.push('【主线锚点（务必严格遵守，禁止偏离主线）】');
    if (outline.mainPlotline) parts.push(`主线程：${outline.mainPlotline}`);
    if (outline.climaxNodes?.length) {
      parts.push(`关键高潮节点：${outline.climaxNodes.join(' → ')}`);
    }
    if (outline.ending) parts.push(`结局归宿：${outline.ending}`);

    // 当前卷定位：本章应推进的目标/冲突
    const curNo = opts?.chapterNo;
    let activeVolume = outline.volumes.find((v) => {
      if (curNo == null) return false;
      const [lo, hi] = v.chapterRange;
      return curNo >= lo && curNo <= hi;
    });
    if (!activeVolume && outline.volumes.length > 0) {
      activeVolume = outline.volumes[0];
    }
    if (activeVolume) {
      parts.push('');
      parts.push('【当前创作进度定位】');
      if (activeVolume.title) parts.push(`本卷：第${activeVolume.volumeNo}卷《${activeVolume.title}》${activeVolume.chapterRange ? `（章${activeVolume.chapterRange[0]}-${activeVolume.chapterRange[1]}）` : ''}`);
      if (activeVolume.coreConflict) parts.push(`本卷核心冲突：${activeVolume.coreConflict}`);
      if (activeVolume.summary) parts.push(`本卷剧情走向：${activeVolume.summary}`);
    }
    parts.push('');
  }

  // ===== 伏笔 =====
  if (memory.longTerm.pendingForeshadowings.length > 0) {
    parts.push('【待回收伏笔】');
    for (const f of memory.longTerm.pendingForeshadowings) {
      parts.push(`- ${f.description}`);
    }
    parts.push('');
  }

  // ===== 文风 =====
  if (memory.longTerm.stylePreset) {
    parts.push('【文风要求】');
    parts.push(memory.longTerm.stylePreset.name);
    if (memory.longTerm.stylePreset.sampleText) {
      parts.push(`样本：${memory.longTerm.stylePreset.sampleText}`);
    }
    parts.push('');
  }

  // ===== 相关章节摘要 =====
  if (memory.midTerm.relevantSummaries.length > 0) {
    parts.push('【相关章节回顾】');
    for (const s of memory.midTerm.relevantSummaries) {
      parts.push(`第 ${s.chapterNo} 章：${s.summary}`);
    }
    parts.push('');
  }

  // ===== 活跃支线 =====
  if (memory.midTerm.activePlotThreads.length > 0) {
    parts.push('【活跃支线】');
    for (const t of memory.midTerm.activePlotThreads) {
      parts.push(`- ${t.description}`);
    }
    parts.push('');
  }

  // ===== 前几章摘要 =====
  if (memory.shortTerm.prevChapters.length > 0) {
    parts.push('【前情提要】');
    for (const s of memory.shortTerm.prevChapters) {
      parts.push(`第 ${s.chapterNo} 章：${s.summary}`);
    }
    parts.push('');
  }

  // ===== 当前剧情要点 =====
  if (memory.shortTerm.currentPlotPoints.length > 0) {
    parts.push('【当前剧情要点】');
    for (const p of memory.shortTerm.currentPlotPoints) {
      parts.push(`- ${p}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/** 沿用全局统一的 token 估算口径（utils.estimateTokens） */
const estimateStringTokens = estimateTokens;