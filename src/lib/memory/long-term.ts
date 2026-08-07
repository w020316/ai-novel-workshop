// ============================================================================
// 长期记忆查询
// 依据：spec 5.5 节 / 计划 P4.1
// 职责：从 IndexedDB 读取世界观/人物/大纲/伏笔/文风预设
// ============================================================================
import type { LongTermMemory } from '@/types';
import {
  getWorldview,
  listCharacters,
  getOutline,
  listPendingForeshadowings,
  getProjectStylePreset,
} from '@/lib/db/queries';

/**
 * 加载项目的长期记忆
 * 长期记忆包含：世界观、人物档案、大纲、未回收伏笔、文风预设
 * 这些信息在项目生命周期中相对稳定，不随章节变化频繁变动
 *
 * @param projectId - 项目 ID
 * @returns LongTermMemory 对象
 */
export async function loadLongTermMemory(
  projectId: string
): Promise<LongTermMemory> {
  const [worldview, characters, outline, pendingForeshadowings, stylePreset] =
    await Promise.all([
      getWorldview(projectId),
      listCharacters(projectId),
      getOutline(projectId),
      listPendingForeshadowings(projectId),
      getProjectStylePreset(projectId),
    ]);

  return {
    worldview: worldview ?? null,
    characters,
    outline: outline ?? null,
    pendingForeshadowings,
    stylePreset: stylePreset ?? null,
  };
}

/**
 * 估算长期记忆的 token 消耗（用于记忆装配时的预算控制）
 */
export function estimateLongTermTokens(memory: LongTermMemory): number {
  let total = 0;

  // 世界观
  if (memory.worldview) {
    total += estimateStringTokens(memory.worldview.worldStructure ?? '');
    total += estimateStringTokens(memory.worldview.powerSystem ?? '');
    total += estimateStringTokens(memory.worldview.geography ?? '');
    total += estimateStringTokens(memory.worldview.era ?? '');
    total += estimateStringTokens(memory.worldview.factions ?? '');
    total += estimateStringTokens(
      (memory.worldview.rules ?? []).join('\n')
    );
  }

  // 人物
  for (const c of memory.characters) {
    total += estimateStringTokens(c.name ?? '');
    total += estimateStringTokens(c.appearance ?? '');
    total += estimateStringTokens(c.personality ?? '');
    total += estimateStringTokens(c.background ?? '');
    total += estimateStringTokens(c.motivation ?? '');
    total += estimateStringTokens(c.weakness ?? '');
    total += estimateStringTokens(c.growthArc ?? '');
    total += estimateStringTokens(c.speechStyle ?? '');
    total += estimateStringTokens(c.behaviorPattern ?? '');
  }

  // 大纲
  if (memory.outline) {
    total += estimateStringTokens(memory.outline.mainPlotline ?? '');
    total += estimateStringTokens(
      (memory.outline.climaxNodes ?? []).join('\n')
    );
    total += estimateStringTokens(memory.outline.ending ?? '');
  }

  // 伏笔
  for (const f of memory.pendingForeshadowings) {
    total += estimateStringTokens(f.description ?? '');
  }

  // 文风
  if (memory.stylePreset) {
    total += estimateStringTokens(memory.stylePreset.sampleText ?? '');
  }

  return total;
}

function estimateStringTokens(text: string): number {
  // 中文约 1.5 token/字，英文约 0.25 token/字符
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
}