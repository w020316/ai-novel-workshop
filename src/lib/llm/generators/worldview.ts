// ============================================================================
// 世界观生成器（真实 LLM）
// 依据：spec 4.3 节 · 设定工坊 / 计划 P3
// 职责：调用兼容层 chat 接口，基于题材 + 书名 + 简介生成世界观，返回可直接保存的结构。
// 降级：字段缺失用本地题材模板对应字段补齐（保证结构完整）；核心字段为空则抛错，
//       由调用方整体回退到模板路径（复用 lib/worldview/template.ts）。
// ============================================================================
import type { Genre, Worldview } from '@/types';
import { chat, LLMClientError } from '@/lib/llm/client';
import { generateId, safeParseJSON } from '@/lib/utils';
import {
  generateWorldviewTemplate,
  normalizeRules,
} from '@/lib/worldview/template';

export interface WorldviewLLMInput {
  projectId: string;
  genre: Genre;
  title: string;
  summary: string;
}

/** LLM 返回的最小结构（字段均可选，缺省由模板补齐） */
interface RawWorldview {
  worldStructure?: string;
  powerSystem?: string;
  geography?: string;
  era?: string;
  factions?: string;
  rules?: string[];
}

const SYSTEM_PROMPT = `你是一位资深网络小说世界观架构师。请根据用户提供的题材、书名与简介，创作一套完整、自洽、有辨识度的世界观设定。

必须严格以 JSON 对象输出，字段如下：
{
  "worldStructure": "世界整体架构（如分层/界域/法则），150-220字",
  "powerSystem": "力量体系/成长体系（可含境界或等级划分），120-180字",
  "geography": "主要地理区域与场景（3-5个，互相关联），120-180字",
  "era": "时代背景（一段话，含时间特征与文明状态），80-140字",
  "factions": "主要势力/阵营（3-5方，说明相互制衡关系），120-180字",
  "rules": ["3-6条核心设定规则（每条一句话，自洽且可被后文引用）"]
}
要求：设定必须与题材相符、彼此自洽；力量体系要具体可量化；势力间要有张力；规则要能支撑伏笔。不要输出 JSON 以外的解释。若信息不足可合理发挥，但不得脱离指定题材。`;

/**
 * 基于题材 / 书名 / 简介，调用真实 LLM 生成世界观。
 * @throws LLMClientError - LLM 不可用或未返回有效核心内容（worldStructure 为空）时抛出，供上层回退。
 */
export async function generateWorldviewWithLLM(
  input: WorldviewLLMInput
): Promise<Worldview> {
  const userPrompt = `题材：${input.genre}
书名：${input.title || '（未命名）'}
简介：${input.summary || '（无，请按题材常规立意创作）'}

请按系统提示要求产出符合题材特色的世界观 JSON。`;

  const result = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { responseFormat: 'json', temperature: 0.8, maxTokens: 1400 }
  );

  const raw = safeParseJSON<RawWorldview>(result.content, {});
  if (!raw || typeof raw !== 'object' || !raw.worldStructure?.trim()) {
    throw new LLMClientError('LLM 未返回有效世界观内容', 502, true);
  }

  // 结构完整兜底：缺失字段用本地题材模板补齐，保证产出可保存、字段非空。
  const base = generateWorldviewTemplate(input);
  return {
    id: generateId('wv'),
    projectId: input.projectId,
    worldStructure: raw.worldStructure.trim(),
    powerSystem: raw.powerSystem?.trim() || base.powerSystem,
    geography: raw.geography?.trim() || base.geography,
    era: raw.era?.trim() || base.era,
    factions: raw.factions?.trim() || base.factions,
    rules: normalizeRules(raw.rules ?? []).length
      ? normalizeRules(raw.rules!)
      : base.rules,
    locked: false,
    updatedAt: Date.now(),
  };
}