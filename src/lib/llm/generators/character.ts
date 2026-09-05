// ============================================================================
// 人物档案生成器（真实 LLM）
// 依据：spec 4.3 节 · 设定工坊 / 计划 P3
// 职责：调用兼容层 chat 接口，基于关键词、姓名（可选）与角色定位生成人物档案。
// 降级：字段缺失用本地角色模板对应字段补齐；核心字段（personality）缺失则抛错，
//       由调用方整体回退到模板路径（复用 lib/character/template.ts）。
// ============================================================================
import type { Character, CharacterRole, Genre } from '@/types';
import { chat, LLMClientError } from '@/lib/llm/client';
import { generateId, safeParseJSON } from '@/lib/utils';
import { generateCharacterTemplate } from '@/lib/character/template';

export interface CharacterLLMInput {
  projectId: string;
  name: string;
  keywords: string;
  role: CharacterRole;
  genre?: Genre;
}

/** LLM 返回的最小结构（字段均可选，缺省由模板补齐） */
interface RawCharacter {
  name?: string;
  appearance?: string;
  personality?: string;
  catchphrase?: string;
  background?: string;
  motivation?: string;
  weakness?: string;
  growthArc?: string;
  speechStyle?: string;
  behaviorPattern?: string;
}

const ROLE_PROMPT: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '主要配角',
  antagonist: '反派/对手',
  minor: '次要角色',
};

const SYSTEM_PROMPT = `你是一位资深网络小说人物设定师。请根据用户给定的关键词、姓名（可选）与角色定位，创作一个立体、有弧光、能推动剧情的人物档案。

人设三原则（务必遵守）：
一、人设源于故事：每个人设都要能推动剧情，明确这个角色在主线中的功能位（他/她如何让主线更精彩、更难、更欲罢不能），而不是孤立的属性表
二、内核冲突驱动：「渴望什么—却害怕什么—所以总是怎样」的矛盾才是人设的灵魂，标签只是外壳；角色行为必须有内在动机
三、用对话与行为立人设：说话风格和口头禅要让读者一听就能认出这个角色，宁可一句示范台词，不要十个形容词

必须严格以 JSON 对象输出，字段如下：
{
  "name": "人物姓名（若用户未提供，则自拟合理的网文名，一般用2-3字姓氏+名）",
  "appearance": "外貌辨识特征（只写具体特征如疤痕/习惯动作/穿着癖好，不写'美丽出众'这类无法落笔的评价），80-150字",
  "personality": "性格特质：先给3-5个辨识标签，再用内核冲突展开（渴望X，却害怕Y，所以总是Z），优缺点并存，120-180字",
  "catchphrase": "一句有辨识度的口头禅（能体现内核冲突更佳）",
  "background": "身世背景（与关键词联动，解释内核冲突的来源），120-180字",
  "motivation": "核心动机：用句式「渴望…，却害怕…，所以总是…」一句话写透内在矛盾",
  "weakness": "弱点/软肋（明确，能被对手利用，不能毫无破绽）",
  "growthArc": "成长弧线（起—承—转—合，能支撑长篇小说展开）",
  "speechStyle": "说话风格（用词与语气特征），并附一句示范台词，格式：风格描述。例：『台词』",
  "behaviorPattern": "典型行为反应链（遇事先做什么再做什么），并说明这种行为模式如何推动主线剧情"
}
要求：性格必须与关键词强相关；要有明显缺点而非完美；动机要有张力；成长弧线要在长篇中可持续。不要输出 JSON 以外的解释。`;

/**
 * 清洗 LLM 返回的人物名：
 * - 去掉括号附注（如「寂灭者（原名：虚空行者·赫尔墨斯）」→「寂灭者」）
 * - 去掉包裹引号与「——」后的补充说明
 * - 截断到 12 字（网文名一般 2-4 字，留足余量）
 */
export function sanitizeCharacterName(raw: string): string {
  return raw
    .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '')
    .replace(/[——-].*$/, '')
    .replace(/["'“”‘’「」]/g, '')
    .trim()
    .slice(0, 12);
}

/**
 * 基于关键词 / 姓名 / 角色定位，调用真实 LLM 生成人物档案。
 * @throws LLMClientError - LLM 不可用或未返回有效核心内容（personality 为空）时抛出，供上层回退。
 */
export async function generateCharacterWithLLM(
  input: CharacterLLMInput
): Promise<Character> {
  const userPrompt = `角色定位：${ROLE_PROMPT[input.role]}
关键词：${input.keywords || '（无，请按该角色定位创作）'}
姓名：${input.name || '（请自行命名）'}
${input.genre ? `题材：${input.genre}` : ''}

请产出符合要求的 JSON 人物档案。`;

  const result = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { responseFormat: 'json', temperature: 0.9, maxTokens: 1200 }
  );

  const raw = safeParseJSON<RawCharacter>(result.content, {});
  if (!raw || typeof raw !== 'object' || !raw.personality?.trim()) {
    throw new LLMClientError('LLM 未返回有效人物档案', 502, true);
  }

  // 结构完整兜底：缺失字段用本地角色模板补齐，保证产出可保存、字段非空。
  const base = generateCharacterTemplate(input);
  return {
    id: generateId('char'),
    projectId: input.projectId,
    name: sanitizeCharacterName(raw.name ?? '') || base.name,
    role: input.role,
    appearance: raw.appearance?.trim() || base.appearance,
    personality: raw.personality.trim(),
    catchphrase: raw.catchphrase?.trim() || base.catchphrase,
    background: raw.background?.trim() || base.background,
    motivation: raw.motivation?.trim() || base.motivation,
    weakness: raw.weakness?.trim() || base.weakness,
    growthArc: raw.growthArc?.trim() || base.growthArc,
    relationships: [],
    speechStyle: raw.speechStyle?.trim() || base.speechStyle,
    behaviorPattern: raw.behaviorPattern?.trim() || base.behaviorPattern,
    locked: false,
    updatedAt: Date.now(),
  };
}