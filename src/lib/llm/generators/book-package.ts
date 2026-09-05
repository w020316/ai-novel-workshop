// ============================================================================
// 一句话灵感 → 自动开书包（Book Package Generator）
// 依据：开源补研 v2 P1-1（对标 AI-Novel-Writing-Assistant「自动开书」）——
//       新手只需输入一句灵感，即可得到可直接落向导的开书包：
//       书名·题材·一句话简介·金手指·主线冲突·长线钩子·世界观种子。
// 降级：LLM 不可用或产出不合规时回落启发式模板，绝不阻塞开书。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';
import { GENRE_OPTIONS } from '@/lib/validators';
import {
  checkOriginality,
  type OriginalityOptions,
  type OriginalityReport,
} from '@/lib/originality/check';
import type { Genre } from '@/types';

const GENRES = GENRE_OPTIONS.map((g) => g.value) as Genre[];

export interface BookPackage {
  /** 书名（≤ 30 字） */
  title: string;
  /** 备选书名（≤ 3 个） */
  titleAlternatives: string[];
  /** 题材（项目枚举之一） */
  genre: Genre;
  /** 一句话简介（≤ 100 字，可直填向导「简介」） */
  summary: string;
  /** 金手指（主角核心外挂） */
  goldenFinger: string;
  /** 主线冲突（长篇推进引擎） */
  mainConflict: string;
  /** 长线钩子（留住百万字读者的悬念） */
  longHook: string;
  /** 世界观种子（生成世界观设定的起点） */
  worldviewSeed: string;
  fromLLM: boolean;
}

/** 灵感关键词 → 题材（启发式判断） */
const GENRE_PATTERNS: Array<[RegExp, Genre, string, string]> = [
  [/赘婿|战神|神豪|总裁|首富|都市|打工|老板/, '都市', '身份反差带来的资源与人脉压制', '家族/商战/阶层的公开羞辱与反杀'],
  [/重生|回到|重来|上一世/, '都市', '先知先觉：知晓未来大势的信息差', '修正前世遗憾的过程中卷入更大的棋局'],
  [/穿越|穿书|异世界|快穿/, '其他', '异世带来的现代知识/剧透差', '回不去的宿命与逐渐揭开的穿越真相'],
  [/系统|签到|面板|任务/, '其他', '系统面板：任务-奖励的即时反馈', '系统背后的真正目的逐步浮出水面'],
  [/修仙|仙|道|宗门|丹|灵气/, '玄幻', '功法/体质/传承类的修炼外挂', '飞升真相与天地大劫的逼近'],
  [/末世|丧尸|废土|求生|囤货/, '末世', '空间/囤货/先知类的生存优势', '灾变源头与人性的双线压迫'],
  [/悬疑|凶手|案子|侦探|破案|诡/, '悬疑', '特殊能力/职业视角的破案优势', '案件背后与主角身世勾连的幕后黑手'],
  [/星际|飞船|机器人|AI|赛博|银河/, '科幻', '科技造物/超前技术带来的代差', '文明级别的阴谋与人类存亡'],
  [/宫|皇|嫡|王爷|妃|宅斗/, '宫斗', '前世记忆/现代思维带来的先手', '从棋子到执棋人的权力攀升'],
  [/游戏|电竞|副本|直播/, '游戏', '游戏天赋/未卜先知的版本理解', '虚拟与现实的利益纠葛逐步失控'],
];

/** 启发式开书包：从灵感文本提取关键词组装，确定性可测 */
export function heuristicBookPackage(idea: string): BookPackage {
  const text = idea.trim();
  const hit = GENRE_PATTERNS.find(([re]) => re.test(text));
  const genre: Genre = hit ? hit[1] : '玄幻';
  const goldenFinger = hit ? hit[2] : '独门天赋：主角拥有他人无法复制的核心优势';
  const longHook = hit ? hit[3] : '身世之谜与天地大劫层层嵌套，每卷揭开一层';

  // 书名：取灵感里的关键词段 + 题材味后缀
  const base = text.replace(/[，。！？、,.!?~\s]+/g, ' ').split(' ').filter(Boolean)[0] ?? '无名之火';
  const title = base.slice(0, 12) || '无名之火';

  return {
    title: `${title}`,
    titleAlternatives: [`${title}·新篇`, `${title}传奇`],
    genre,
    summary: text.slice(0, 100) || '一个普通人借金手指逆天改命的故事。',
    goldenFinger,
    mainConflict: `${goldenFinger}带来的既得利益者围剿 VS 主角向上攀升`,
    longHook,
    worldviewSeed: `${genre}世界：力量/资源分配极度不均，主角从底层缝隙中崛起`,
    fromLLM: false,
  };
}

const SYSTEM_PROMPT = `你是网文开书策划。用户会给出一句（或一段）灵感，请把它扩写成一个可直接开写的「开书包」，严格只输出 JSON（不要解释/markdown），格式：
{
  "title": "书名（8 字内，有网感）",
  "titleAlternatives": ["备选书名 1", "备选书名 2"],
  "genre": "必须从 玄幻/言情/悬疑/科幻/都市/历史/末世/游戏/宫斗/其他 中选一个",
  "summary": "一句话简介（50 字内，冲突清晰）",
  "goldenFinger": "主角金手指（一句话）",
  "mainConflict": "主线冲突（一句话，可持续推进百万字）",
  "longHook": "长线钩子（一句话，留悬念）",
  "worldviewSeed": "世界观种子（一句话，供后续生成世界观）"
}
要求：务求具体、可开写，避免空泛套话。`;

interface RawBookPackage {
  title?: string;
  titleAlternatives?: unknown;
  genre?: string;
  summary?: string;
  goldenFinger?: string;
  mainConflict?: string;
  longHook?: string;
  worldviewSeed?: string;
}

function sanitizeStrArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, max);
}

/** generateBookPackage 可选项：注入原创性规避块，防止开书包撞热门作品 */
export interface GenerateBookPackageOptions {
  /** 规避 Prompt 块（来自 buildAvoidance），追加到用户消息尾部 */
  avoidancePrompt?: string;
}

/**
 * 一句话灵感 → 开书包。LLM 优先，失败/不合规回落启发式，绝不阻塞。
 * 传入 options.avoidancePrompt 时把「勿复刻代表作」要求写进提示词，开书包从源头避撞。
 */
export async function generateBookPackage(
  idea: string,
  options: GenerateBookPackageOptions = {}
): Promise<BookPackage> {
  const fallback = heuristicBookPackage(idea);
  if (idea.trim().length < 4) return fallback;

  try {
    const userContent = [
      `【灵感】${idea.trim().slice(0, 500)}`,
      options.avoidancePrompt ? `\n${options.avoidancePrompt}` : '',
      '\n请扩写成开书包（严格 JSON）。书名必须与规避名单中的作品不同名，核心设定与金手指须差异化创新。',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      { responseFormat: 'json', temperature: 0.8, maxTokens: 700 }
    );
    const raw = safeParseJSON<RawBookPackage>(result.content ?? '', {});
    const title = (raw.title ?? '').trim();
    const genre = GENRES.includes(raw.genre as Genre) ? (raw.genre as Genre) : null;
    const summary = (raw.summary ?? '').trim();
    const goldenFinger = (raw.goldenFinger ?? '').trim();
    const mainConflict = (raw.mainConflict ?? '').trim();
    // 关键字段缺失则视为产出不完整，整包退回启发式，避免半残开书包
    if (!title || !genre || !summary || !goldenFinger || !mainConflict) return fallback;
    return {
      title: title.slice(0, 30),
      titleAlternatives: sanitizeStrArray(raw.titleAlternatives, 3).map((t) => t.slice(0, 30)),
      genre,
      summary: summary.slice(0, 100),
      goldenFinger,
      mainConflict,
      longHook: (raw.longHook ?? '').trim() || fallback.longHook,
      worldviewSeed: (raw.worldviewSeed ?? '').trim() || fallback.worldviewSeed,
      fromLLM: true,
    };
  } catch {
    return fallback;
  }
}

/** 开书包 → 向导预填摘要（简介 + 金手指 + 冲突 + 钩子，供「简介」字段直填） */
export function bookPackageToSummary(bp: BookPackage): string {
  return [bp.summary, `金手指：${bp.goldenFinger}`, `主线冲突：${bp.mainConflict}`, `长线钩子：${bp.longHook}`]
    .join(' ')
    .slice(0, 300);
}

/** 开书包 → 查重文本（书名 + 简介 + 金手指 + 冲突 + 钩子 + 世界观种子） */
export function bookPackageOriginalityText(bp: BookPackage): string {
  return [bp.title, bp.summary, bp.goldenFinger, bp.mainConflict, bp.longHook, bp.worldviewSeed].join('\n');
}

/**
 * 开书包原创性预检：与内置代表作 + 实时榜单热书名比对，撞梗即提示（不强制拦截）。
 * 默认按开书包自身题材过滤比对池，可经 options 叠加 liveTitles / maxHits。
 */
export function checkBookPackageOriginality(
  bp: BookPackage,
  options: Omit<OriginalityOptions, 'genre'> = {}
): OriginalityReport {
  return checkOriginality(bookPackageOriginalityText(bp), { genre: bp.genre, ...options });
}
