// ============================================================================
// 人物档案生成器（真实 LLM）
// 依据：spec 4.3 节 · 设定工坊 / 计划 P3
// 职责：调用兼容层 chat 接口，基于关键词、姓名（可选）与角色定位生成人物档案。
// 降级：字段缺失用本地角色模板对应字段补齐；核心字段（personality）缺失则抛错，
//       由调用方整体回退到模板路径（复用 lib/character/template.ts）。
// ============================================================================
import type { Character, CharacterRelation, CharacterRole, Genre } from '@/types';
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
  role?: string;
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

// ============================================================================
// 灵感 → 人物档案关键词一键生成（需求 7）
// 输入灵感文本优先取项目简介（summary），为空时回落用户粘贴的灵感内容（ideaText）。
// LLM 失败/非法输出时确定性降级：从灵感文本提取关键词填入 personality/motivation
// 模板句，其余字段复用角色模板，保证草稿字段齐备、绝不抛错。
// 产出为 Partial<Character> 草稿（不含 id/projectId），由表单填充后再人工微调保存。
// ============================================================================

export interface CharacterInspirationInput {
  /** 项目题材（如「玄幻」） */
  genre?: string;
  /** 项目简介（灵感文本首选来源） */
  summary?: string;
  /** 用户粘贴/选择的灵感卡内容（项目简介为空时的灵感来源） */
  ideaText?: string;
  /** 角色定位（缺省主角） */
  role?: CharacterRole;
}

/** 人物草稿的完整字段形状（不含 id/projectId 等落库字段） */
interface CharacterDraft {
  name: string;
  role: CharacterRole;
  appearance: string;
  personality: string;
  catchphrase: string;
  background: string;
  motivation: string;
  weakness: string;
  growthArc: string;
  relationships: CharacterRelation[];
  speechStyle: string;
  behaviorPattern: string;
}

const VALID_ROLES: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];

/** 灵感关键词不足时的兜底词（保证降级模板句子完整） */
const DEFAULT_IDEA_KEYWORDS = ['逆风翻盘', '在意之人', '被掩埋的真相'];

const INSPIRATION_SYSTEM_PROMPT = `你是资深网文人物设定师。请基于给定题材与灵感文本，生成一套与灵感设定一致、且有反差记忆点的人物档案关键词。

要求：
一、人设长在故事里：从灵感文本中提炼身份、能力、处境、冲突等要素，人物必须与灵感设定强相关
二、有反差记忆点：至少一处「表面 X / 内里 Y」的反差设定，让读者一眼记住
三、严格只输出 JSON（字段名与人物档案对齐，relationships 固定为空数组），格式：
{
  "name": "人物姓名（2-3 字网文名）",
  "role": "protagonist|supporting|antagonist|minor 之一",
  "appearance": "外貌一句话（写具体辨识特征，不写空泛评价）",
  "personality": "性格（先给 2-4 个标签，再点出内核冲突）",
  "catchphrase": "一句有辨识度的口头禅",
  "background": "背景（与灵感文本联动，解释内核冲突来源）",
  "motivation": "核心执念（用句式：渴望…，却害怕…，所以总是…）",
  "weakness": "弱点（明确，能被对手利用）",
  "growthArc": "成长线（从…到…，可支撑长篇展开）",
  "speechStyle": "说话风格（可附一句示范台词）",
  "behaviorPattern": "行为模式（遇事如何反应）",
  "relationships": []
}
不要输出 JSON 以外的解释。`;

/**
 * 从灵感文本中确定性提取候选关键词（供降级模板与单测使用）：
 * 按标点/空白切分，保留 2-10 字短语，去重后最多取 6 个。
 */
export function extractInspirationKeywords(ideaText: string): string[] {
  return ideaText
    .split(/[，,。.！!？?、；;：:（）()【】\[\]「」『』“”‘’"'·—…\s\u3000]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 10)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .slice(0, 6);
}

/** 灵感降级草稿：关键词提取 + 角色模板，确定性产出字段齐备的草稿 */
function buildInspirationFallback(
  ideaText: string,
  genre: string | undefined,
  role: CharacterRole
): CharacterDraft & { fromLLM: false } {
  const keywords = extractInspirationKeywords(ideaText);
  const [k0, k1, k2] = [...keywords, ...DEFAULT_IDEA_KEYWORDS];
  // 复用角色模板保证其余字段确定性非空，再用灵感关键词改写性格与核心执念
  const tpl = generateCharacterTemplate({
    projectId: 'inspiration-draft',
    keywords: keywords.join('、'),
    name: '',
    role,
  });
  return {
    name: tpl.name,
    role,
    appearance: tpl.appearance,
    personality: `围绕「${k0}」展开：渴望${k0}，却害怕因此失去${k1}，所以总是先人一步布局；${genre ? `在${genre}背景下，` : ''}「${k0}」与「${k1}」构成其反差记忆点。`,
    catchphrase: tpl.catchphrase,
    background: tpl.background,
    motivation: `渴望${k0}，却始终被${k1}牵制，因此不断在「${k2}」上押注、试探与妥协。`,
    weakness: tpl.weakness,
    growthArc: tpl.growthArc,
    relationships: [],
    speechStyle: tpl.speechStyle,
    behaviorPattern: tpl.behaviorPattern,
    fromLLM: false,
  };
}

/**
 * 灵感文本 → 人物档案关键词草稿（不落库，供表单填充后人工微调）。
 * 灵感文本优先取 summary，为空时用 ideaText；LLM 失败/非法时确定性降级，不抛错。
 */
export async function generateCharacterFromInspiration(
  input: CharacterInspirationInput
): Promise<Partial<Character> & { fromLLM: boolean }> {
  const role: CharacterRole = input.role ?? 'protagonist';
  const idea = input.summary?.trim() ? input.summary.trim() : (input.ideaText ?? '').trim();
  const fallback = buildInspirationFallback(idea, input.genre, role);

  const userPrompt = [
    input.genre ? `【题材】${input.genre}` : '',
    `【灵感文本】${idea || '（空，请按题材自拟一个与主流套路有反差的人物）'}`,
    `【角色定位】${ROLE_PROMPT[role]}`,
    '',
    '请输出符合要求的 JSON 人物档案关键词。',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: INSPIRATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.9, maxTokens: 1200 }
    );

    const raw = safeParseJSON<RawCharacter>(result.content, {});
    if (!raw || typeof raw !== 'object' || !raw.personality?.trim()) {
      throw new LLMClientError('LLM 未返回有效灵感人物档案', 502, true);
    }

    return {
      name: sanitizeCharacterName(raw.name ?? '') || fallback.name,
      role: raw.role && (VALID_ROLES as string[]).includes(raw.role) ? (raw.role as CharacterRole) : role,
      appearance: raw.appearance?.trim() || fallback.appearance,
      personality: raw.personality.trim(),
      catchphrase: raw.catchphrase?.trim() || fallback.catchphrase,
      background: raw.background?.trim() || fallback.background,
      motivation: raw.motivation?.trim() || fallback.motivation,
      weakness: raw.weakness?.trim() || fallback.weakness,
      growthArc: raw.growthArc?.trim() || fallback.growthArc,
      relationships: [],
      speechStyle: raw.speechStyle?.trim() || fallback.speechStyle,
      behaviorPattern: raw.behaviorPattern?.trim() || fallback.behaviorPattern,
      fromLLM: true,
    };
  } catch {
    // LLM 失败/非法输出：确定性降级，绝不抛错
    return fallback;
  }
}