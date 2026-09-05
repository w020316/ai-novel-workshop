// ============================================================================
// 扫榜拆解 · 出圈逻辑（Viral Logic Breakdown）
// 背景：参考 Openwrite 1.3「扫榜拆书」增量 —— 对榜单头部作品不止罗列书名，
//       而是拆出「它为什么能出圈」：题材定位 / 金手指 / 钩子 / 情绪爽点 /
//       可借鉴手法，沉淀为可收藏灵感卡反哺创作。
// 组成：
//   - heuristicViralBreakdown 确定性启发式拆解（纯函数，无 LLM/无网络，可测）
//   - generateViralBreakdowns LLM 拆解（失败逐部降级启发式，绝不阻塞）
//   - viralBreakdownsToCards  拆解结果 → 灵感卡（复用既有灵感卡存储）
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';
import type { InspirationCard } from '@/types';

export interface ViralBook {
  rank?: number;
  title: string;
  author?: string;
}

export interface ViralBreakdown {
  title: string;
  /** 题材定位 */
  genre: string;
  /** 金手指（主角外挂/独特优势） */
  goldenFinger: string;
  /** 钩子（开篇/悬念手法） */
  hooks: string[];
  /** 情绪爽点 */
  emotionalPayoffs: string[];
  /** 可借鉴手法 */
  techniques: string[];
  fromLLM: boolean;
}

/** 题材关键词 → 题材定位（书名启发式判断） */
const GENRE_PATTERNS: Array<[RegExp, string, string]> = [
  [/赘婿|战神|龙王|神豪|总裁|首富|上门/, '都市赘婿/战神流', '隐藏身份+当众打脸的身份反差外挂'],
  [/重生|重回|重来/, '重生流', '先知先觉：知晓未来走势的信息差'],
  [/穿越|穿书|快穿/, '穿越/快穿流', '异世现代知识/剧透差当外挂'],
  [/系统|签到|打卡|满级/, '系统流', '系统面板：任务-奖励的即时反馈外挂'],
  [/仙|修|道|丹|宗/, '玄幻修仙', '功法/体质/传承类的修仙外挂'],
  [/末世|丧尸|求生|囤/, '末世求生', '空间/囤货/先知类的生存外挂'],
  [/诡|盗|案|谜|刑|侦探/, '悬疑刑侦', '特殊能力/职业视角的破案外挂'],
  [/婚|恋|甜|宠|娇|夫/, '现言/古言', '情感拉扯+身份反差的情感外挂'],
  [/游戏|电竞|全息/, '游戏电竞', '游戏天赋/系统化的竞技外挂'],
];

/** 爽点关键词 → 情绪爽点 */
const COOLPOINT_PATTERNS: Array<[RegExp, string]> = [
  [/逆袭|翻身|崛起/, '底层逆袭的扬眉吐气'],
  [/打脸|轻视|嘲讽|废物|废柴/, '被轻视后当众打脸'],
  [/首富|神豪|暴富|亿万/, '一夜暴富的爽感'],
  [/满级|无敌|最强|至尊/, '碾压式实力压制'],
  [/归来|回归|王者/, '王者归来的反差冲击'],
];

/**
 * 确定性启发式拆解：从书名 + 榜单位次推断题材定位/金手指/钩子/爽点/手法。
 * 无 LLM 依赖，同输入同输出。
 */
export function heuristicViralBreakdown(book: ViralBook, sourceName = ''): ViralBreakdown {
  const title = book.title.trim();
  let genre = '网文热门题材';
  let goldenFinger = '题材惯用的核心外挂（结合简介确认具体形态）';
  for (const [re, g, gf] of GENRE_PATTERNS) {
    if (re.test(title)) {
      genre = g;
      goldenFinger = gf;
      break;
    }
  }

  const payoffs = COOLPOINT_PATTERNS.filter(([re]) => re.test(title)).map(([, p]) => p);
  if (payoffs.length === 0) {
    payoffs.push('即时反馈的爽点节奏（榜单头部通常 3 章内首个 payoff）');
  }

  const rankNote =
    book.rank && book.rank <= 3
      ? `榜单第 ${book.rank} 位：开篇钩子前置极快（建议首屏内抛悬念）`
      : book.rank
        ? `榜单第 ${book.rank} 位：钩子密度是留存关键`
        : '钩子前置是上榜关键';

  return {
    title,
    genre,
    goldenFinger,
    hooks: [
      rankNote,
      '书名即钩子：题材词+身份/状态反差，一眼传递冲突',
    ],
    emotionalPayoffs: payoffs,
    techniques: [
      '借鉴其「题材 × 身份反差」组合思路，替换为差异化的金手指',
      `${sourceName ? sourceName + ' ' : ''}头部作品通常强断章：章末留悬念锁追读`,
    ],
    fromLLM: false,
  };
}

const SYSTEM_PROMPT = `你是网文扫榜拆书教练。用户给出某平台实时榜单的头部作品名单，请逐部拆解「它为什么能出圈」，严格只输出 JSON（不要解释/markdown），格式：
{
  "books": [
    {
      "title": "与输入完全一致的书名",
      "genre": "题材定位（如 都市赘婿流/玄幻修仙）",
      "goldenFinger": "主角金手指（一句话）",
      "hooks": ["开篇/悬念钩子手法 1-2 条"],
      "emotionalPayoffs": ["情绪爽点 1-2 条"],
      "techniques": ["可直接借鉴的手法 1-2 条"]
    }
  ]
}
要求：只拆解输入中出现的书名，务求具体（能给句式/结构就直接给），不要空话。`;

interface RawBreakdown {
  title?: string;
  genre?: string;
  goldenFinger?: string;
  hooks?: unknown;
  emotionalPayoffs?: unknown;
  techniques?: unknown;
}

function sanitizeStrArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, max);
}

/**
 * 对榜单头部作品批量拆解出圈逻辑：LLM 优先，失败/缺失逐部降级启发式。
 * 只拆前 maxN 部（榜单头部才有拆解价值，且控制 token 成本）。
 */
export async function generateViralBreakdowns(
  books: ViralBook[],
  sourceName = '',
  maxN = 5
): Promise<ViralBreakdown[]> {
  const targets = books
    .filter((b) => b.title.trim())
    .slice(0, Math.max(1, Math.min(maxN, 10)));

  if (targets.length === 0) return [];

  const heuristics = new Map(targets.map((b) => [b.title.trim(), heuristicViralBreakdown(b, sourceName)]));

  const userPrompt = [
    `【平台】${sourceName || '未知平台'} 实时榜单`,
    '【头部作品】',
    ...targets.map((b) => `- ${b.title}${b.author ? `（作者 ${b.author}）` : ''}${b.rank ? ` · 第 ${b.rank} 位` : ''}`),
    '',
    '请逐部拆解出圈逻辑（严格 JSON）。',
  ].join('\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.5, maxTokens: 1200 }
    );
    const parsed = safeParseJSON<{ books?: RawBreakdown[] }>(result.content ?? '', {});
    const rawBooks = Array.isArray(parsed.books) ? parsed.books : [];
    const byTitle = new Map(
      rawBooks
        .filter((r) => typeof r.title === 'string' && r.title.trim())
        .map((r) => [r.title!.trim(), r])
    );
    return targets.map((b) => {
      const fallback = heuristics.get(b.title.trim())!;
      const raw = byTitle.get(b.title.trim());
      if (!raw) return fallback;
      const genre = (raw.genre ?? '').trim() || fallback.genre;
      const goldenFinger = (raw.goldenFinger ?? '').trim() || fallback.goldenFinger;
      const hooks = sanitizeStrArray(raw.hooks, 2);
      const emotionalPayoffs = sanitizeStrArray(raw.emotionalPayoffs, 2);
      const techniques = sanitizeStrArray(raw.techniques, 2);
      // 任一关键字段为空则视为 LLM 产出不完整，整部退回启发式，避免半残卡
      if (!genre || !goldenFinger || hooks.length === 0 || emotionalPayoffs.length === 0 || techniques.length === 0) {
        return fallback;
      }
      return { title: b.title.trim(), genre, goldenFinger, hooks, emotionalPayoffs, techniques, fromLLM: true };
    });
  } catch {
    return targets.map((b) => heuristics.get(b.title.trim())!);
  }
}

/** 拆解结果 → 可收藏灵感卡（kind=structure，写入灵感库跨项目复用） */
export function viralBreakdownsToCards(
  projectId: string,
  breakdowns: ViralBreakdown[],
  sourceName = ''
): InspirationCard[] {
  if (breakdowns.length === 0) return [];
  const baseId = `viral_${Date.now()}`;
  return breakdowns.map((b, i) => ({
    id: `${baseId}_${i}`,
    projectId,
    kind: 'structure' as const,
    title: `出圈拆解·${b.title}`.slice(0, 40),
    content: [
      `题材定位：${b.genre}`,
      `金手指：${b.goldenFinger}`,
      `钩子：${b.hooks.join('；')}`,
      `情绪爽点：${b.emotionalPayoffs.join('；')}`,
      `可借鉴：${b.techniques.join('；')}`,
      sourceName ? `（来源：${sourceName} 实时榜单）` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    sourceDeconstructionId: baseId,
    createdAt: Date.now(),
  }));
}
