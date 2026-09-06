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
import { isRewritten } from '@/lib/llm/polish-guard';
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

脑洞要求：设定必须有一个让人眼前一亮的「脑洞内核」（如新奇的世界规则、有代价的力量体系、反常识的势力结构），拒绝模板化的通用设定——读者看完第一段设定就知道"这本书不一样"。

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

// ============ 按简介完善世界观（需求 6 后半） ============

/** 「按简介完善」的输入：当前世界观各字段 + 项目简介 */
export interface RefineWorldviewInput {
  projectId: string;
  genre: Genre;
  title: string;
  summary: string;
  current: Pick<
    Worldview,
    'worldStructure' | 'powerSystem' | 'geography' | 'era' | 'factions' | 'rules'
  >;
}

/** 润色后的世界观字段（不含 id/锁定状态等元信息，由调用方填入表单，用户确认后保存） */
export interface RefinedWorldviewFields {
  worldStructure: string;
  powerSystem: string;
  geography: string;
  era: string;
  factions: string;
  rules: string[];
}

const REFINE_SYSTEM_PROMPT = `你是一位资深网络小说世界观架构师。用户会提供当前的世界观设定与小说简介，请在保持字段结构不变的前提下完善世界观：
1. 让各字段与简介的核心创意深度绑定（简介中的金手指、冲突、钩子应能在设定中落地）；
2. 【最重要】当前设定是底稿，不是参考：逐句保留原有设定的用语与表述，在原有句子基础上追加细节与例子（如具体地名/势力名/境界名/规则细则）；各字段篇幅不得少于原文（原文为空的字段除外）；严禁整体改写、换一种说法复述、删并压缩已有内容；
3. 核心规则只增不减：原有规则必须逐条保留，可在其后补充新规则；
4. 修补各字段之间不自洽之处，仅删除与简介直接矛盾的设定；
5. 时代背景须贴合题材且多样化，避免千篇一律的末法/衰落设定。

必须严格以 JSON 对象输出，字段如下：
{
  "worldStructure": "世界整体架构（如分层/界域/法则），200-300字",
  "powerSystem": "力量体系/成长体系（可含境界或等级划分），160-240字",
  "geography": "主要地理区域与场景（3-5个，互相关联），160-240字",
  "era": "时代背景（一段话，含时间特征与文明状态），100-160字",
  "factions": "主要势力/阵营（3-5方，说明相互制衡关系），160-240字",
  "rules": ["4-8条核心设定规则（每条一句话，自洽且可被后文引用）"]
}
不要输出 JSON 以外的解释。`;

const REFINE_REWORK_NOTE = `【返工要求·务必遵守】你上一轮的输出是对原设定的整体改写，几乎丢弃了原有的所有表述，这不符合要求。
请重新生成：以当前设定为底稿逐句保留原句，只在原句之后追加细节与例子（扩写），原有规则逐条保留并在其后补充新规则。`;

/**
 * 字段级扩写守卫：LLM 值为空、或相对当前值构成整体改写（保留覆盖率过低）时，
 * 保留当前值——宁可该字段不完善，也不允许丢失用户已有设定；当前值为空时总是接受 LLM 值。
 */
function pickRefined(next: string | undefined, prev: string): string {
  const v = next?.trim();
  if (!v) return prev;
  if (prev.trim() && isRewritten(prev, v)) return prev;
  return v;
}

/**
 * 按项目简介完善已有世界观：把当前各字段 + 简介交给 LLM，产出润色后的世界观字段（结构不变）。
 * 扩写守卫：各字段经保留覆盖率校验——LLM 值构成整体改写时保留当前值（worldStructure 被拦时
 * 先带返工要求重试一次）；核心规则与原规则做并集，只增不减。
 * 结果仅含字段内容，由调用方填入表单，用户确认后手动保存（人工可控）。
 * @throws LLMClientError - LLM 不可用或未返回有效核心内容（worldStructure 为空）时抛出，
 *         调用方应提示错误且不改动数据。
 */
export async function refineWorldviewWithSummary(
  input: RefineWorldviewInput
): Promise<RefinedWorldviewFields> {
  const c = input.current;
  const baseUserPrompt = `题材：${input.genre}
书名：${input.title || '（未命名）'}
项目简介：${input.summary || '（无）'}

【当前世界观设定（底稿，必须最大程度保留）】
世界架构：${c.worldStructure?.trim() || '（空）'}
力量体系：${c.powerSystem?.trim() || '（空）'}
地理设定：${c.geography?.trim() || '（空）'}
时代背景：${c.era?.trim() || '（空）'}
势力划分：${c.factions?.trim() || '（空）'}
核心规则：
${(c.rules ?? []).length ? c.rules.map((r, i) => `${i + 1}. ${r}`).join('\n') : '（空）'}

请按系统提示要求在上述底稿基础上扩写完善，严格输出 JSON。`;

  /** 调一次 LLM 并解析；reworkNote 非空时追加返工要求 */
  const requestOnce = async (reworkNote = ''): Promise<RawWorldview | null> => {
    const result = await chat(
      [
        { role: 'system', content: REFINE_SYSTEM_PROMPT },
        { role: 'user', content: [baseUserPrompt, reworkNote].filter(Boolean).join('\n\n') },
      ],
      { responseFormat: 'json', temperature: reworkNote ? 0.5 : 0.7, maxTokens: 2000 }
    );
    const raw = safeParseJSON<RawWorldview>(result.content, {});
    return raw && typeof raw === 'object' && raw.worldStructure?.trim() ? raw : null;
  };

  /** 应用字段级守卫组装结果：规则与原规则并集（只增不减） */
  const assemble = (raw: RawWorldview): RefinedWorldviewFields => {
    const mergedRules = normalizeRules([...(c.rules ?? []), ...(raw.rules ?? [])]);
    return {
      worldStructure: pickRefined(raw.worldStructure, c.worldStructure ?? ''),
      powerSystem: pickRefined(raw.powerSystem, c.powerSystem ?? ''),
      geography: pickRefined(raw.geography, c.geography ?? ''),
      era: pickRefined(raw.era, c.era ?? ''),
      factions: pickRefined(raw.factions, c.factions ?? ''),
      rules: mergedRules.length ? mergedRules : (c.rules ?? []),
    };
  };

  const first = await requestOnce();
  if (!first) {
    throw new LLMClientError('LLM 未返回有效的世界观完善结果', 502, true);
  }

  let assembled = assemble(first);
  // 核心字段被守卫拦截（整体改写）→ 带返工要求重试一次，逐字段择优（通过守卫者胜出）
  const blocked =
    c.worldStructure?.trim() && assembled.worldStructure === c.worldStructure?.trim();
  if (blocked) {
    const retry = await requestOnce(REFINE_REWORK_NOTE);
    if (retry) {
      const retried = assemble(retry);
      const fields = ['worldStructure', 'powerSystem', 'geography', 'era', 'factions'] as const;
      for (const f of fields) {
        // 重试值通过守卫（≠ 当前值）则采用，否则沿用首轮/当前值
        if (retried[f] !== (c[f] ?? '')) assembled = { ...assembled, [f]: retried[f] };
      }
      assembled = { ...assembled, rules: retried.rules };
    }
  }
  return assembled;
}