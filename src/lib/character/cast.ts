// ============================================================================
// 人物团提案生成器（AI 全流程优先：提案 → 勾选 → 批量生成档案）
// 职责：按题材/简介/世界观，一次性产出 4-6 人的人物团提案（姓名 + 角色定位 + 关键词
//       全部由 AI 给出）；用户勾选/微调后再批量生成完整档案（由调用方走
//       generateCharacterWithLLM）。LLM 不可用时回退到按题材启发式人物团（确定性可测）。
// ============================================================================
import type { CharacterRole, Genre } from '@/types';
import { chat } from '@/lib/llm/client';
import { sanitizeCharacterName } from '@/lib/llm/generators/character';
import { safeParseJSON } from '@/lib/utils';

/** 单个提案人物：姓名 / 角色定位 / 关键词均由 AI 产出，用户可改 */
export interface CastMemberProposal {
  name: string;
  role: CharacterRole;
  keywords: string;
}

export interface CastProposalInput {
  genre?: Genre | string;
  summary?: string;
  worldviewSummary?: string;
  /** 期望提案人数（默认 5，钳制 3-6） */
  count?: number;
}

const ROLES: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];

const ROLE_PROMPT: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '主要配角',
  antagonist: '反派/对手',
  minor: '次要角色',
};

const SYSTEM_PROMPT = `你是一位资深网络小说人物设定师。请根据题材与故事简介，设计一组相互关联、有冲突张力的人物团提案。

必须严格以 JSON 对象输出：
{
  "cast": [
    { "name": "人物姓名（2-3字中文网文名）", "role": "protagonist|supporting|antagonist|minor", "keywords": "3-5个关键词，用顿号分隔，如：冷酷剑修、孤独、复仇、天赋异禀" }
  ]
}
要求：
1. 必须包含恰好 1 位主角（protagonist）与至少 1 位反派（antagonist）
2. 人物之间要有关系张力（宿敌/羁绊/立场冲突），关键词要互相呼应故事核心冲突
3. 姓名不重复，符合题材气质；不要输出 JSON 以外的解释`;

/**
 * 归一化 LLM 返回的提案列表：过滤非法项、钳制数量、去重姓名。
 * 不合法（非数组/全空）返回 null，供上层回退。
 */
export function normalizeCastProposal(raw: unknown, count: number): CastMemberProposal[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { cast?: unknown }).cast)
      ? (raw as { cast: unknown[] }).cast
      : null;
  if (!list) return null;

  const seen = new Set<string>();
  const result: CastMemberProposal[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    // 清洗姓名：LLM 可能返回「名（原名：xx）」等附注，统一去掉
    const name = sanitizeCharacterName(String((item as { name?: unknown }).name ?? ''));
    const keywords = String((item as { keywords?: unknown }).keywords ?? '').trim();
    const roleRaw = String((item as { role?: unknown }).role ?? '').trim() as CharacterRole;
    if (!name || !keywords) continue;
    if (!ROLES.includes(roleRaw)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    result.push({ name, role: roleRaw, keywords: keywords.slice(0, 60) });
    if (result.length >= count) break;
  }
  return result.length > 0 ? result : null;
}

/** 题材启发式关键词（LLM 不可用时的确定性人物团兜底） */
const GENRE_CAST_HINTS: Record<string, { keywords: string[]; antagonist: string[] }> = {
  default: {
    keywords: ['坚韧', '身世成谜', '天赋异禀'],
    antagonist: ['城府极深', '执念', '位高权重'],
  },
  玄幻: {
    keywords: ['废柴逆袭', '血脉之谜', '意志如铁'],
    antagonist: ['天骄之姿', '傲慢', '夺机缘'],
  },
  言情: {
    keywords: ['外冷内热', '口是心非', '原生家庭创伤'],
    antagonist: ['白月光', '占有欲', '门第之见'],
  },
  悬疑: {
    keywords: ['观察力惊人', '隐秘过去', '执于真相'],
    antagonist: ['完美伪装', '掌控欲', '旧案真凶'],
  },
  科幻: {
    keywords: ['理性冷静', '改造人', '文明存亡使命感'],
    antagonist: ['算法独裁', '工具理性', '意识上传'],
  },
  都市: {
    keywords: ['隐藏身份', '逆袭', '重情重义'],
    antagonist: ['豪门打压', '虚伪', '利益至上'],
  },
  历史: {
    keywords: ['权谋深沉', '寒门出身', '隐忍蛰伏'],
    antagonist: ['世家门阀', '挟主自重', '结党营私'],
  },
  末世: {
    keywords: ['重生者', '危机嗅觉', '守护同伴'],
    antagonist: ['弱肉强食', '囤积居奇', '背叛'],
  },
  游戏: {
    keywords: ['隐藏职业', '操作极限', '好奇探索'],
    antagonist: ['公会霸权', '数据垄断', '幕后黑手'],
  },
  宫斗: {
    keywords: ['低位生存', '心思剔透', '恩怨旧账'],
    antagonist: ['宠冠六宫', '借刀杀人', '母族势力'],
  },
};

function heuristicCast(input: CastProposalInput): CastMemberProposal[] {
  const hint = GENRE_CAST_HINTS[String(input.genre)] ?? GENRE_CAST_HINTS.default;
  const cast: CastMemberProposal[] = [
    { name: '', role: 'protagonist', keywords: hint.keywords.join('、') },
    { name: '', role: 'supporting', keywords: '机敏、可靠、身怀秘技' },
    { name: '', role: 'supporting', keywords: '温柔、善解人意、立场微妙' },
    { name: '', role: 'antagonist', keywords: hint.antagonist.join('、') },
    { name: '', role: 'minor', keywords: '市井气、消息灵通、趋利避害' },
  ];
  return cast.slice(0, Math.max(3, Math.min(6, input.count ?? 5)));
}

/**
 * 生成人物团提案（AI 优先，失败回退题材启发式）。
 * @returns 提案列表；由调用方交给用户勾选/微调后批量生成完整档案
 */
export async function generateCastProposal(
  input: CastProposalInput
): Promise<{ proposals: CastMemberProposal[]; usedFallback: boolean }> {
  const count = Math.max(3, Math.min(6, input.count ?? 5));
  try {
    const userPrompt = [
      input.genre ? `题材：${input.genre}` : '',
      input.summary ? `故事简介：${input.summary}` : '',
      input.worldviewSummary ? `世界观要点：${input.worldviewSummary.slice(0, 400)}` : '',
      `请设计 ${count} 位人物的人物团提案。`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.9, maxTokens: 1200 }
    );

    const raw = safeParseJSON<unknown>(result.content, null);
    const proposals = normalizeCastProposal(raw, count);
    if (proposals && proposals.length >= 2) {
      return { proposals, usedFallback: false };
    }
    return { proposals: heuristicCast(input), usedFallback: true };
  } catch {
    // LLM 不可用 / 未配 API Key：本地启发式兜底，保证「一键生成」始终可用
    return { proposals: heuristicCast(input), usedFallback: true };
  }
}
