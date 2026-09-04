// ============================================================================
// 趋势灵感（P5 扫榜 · 收敛版）
// 依据：调研 P5「扫榜/拆文」+ 头条系 5.2 爆款方法论 + Openwrite 拆书启示。
// 说明：平台实时榜单普遍被反爬/CORS 挡住，前端可靠抓取不可行，故不抓取、
//       改用「内置趋势参考（基于公开讨论与爆款方法论整理，非实时榜单）」——
//       渠道×题材 → 风向/爽点/人设反差/节奏 → 可生成灵感卡收藏反哺选题。
// 组成：
//   - getTrend            渠道×题材 → 确定性趋势分析（无 LLM 依赖）
//   - deriveTrendHints    由分析派生可写建议（LLM 不可用兜底）
//   - generateTrendInspiration 在其上调用 LLM 生成可收藏灵感卡，失败降级
// 复用：llm/client、deconstruct 的灵感卡落库、InspirationCard 类型。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';
import { buildAvoidance } from '@/lib/originality/check';
import type { InspirationCard } from '@/types';

/** 小说平台渠道（各榜口径来源，仅作选题参考） */
export const RANK_SOURCES: { id: string; name: string; focus: string; reader: string }[] = [
  { id: 'qidian', name: '起点中文网', focus: '男频升级流 / 脑洞设定，收藏票、月票导向', reader: '追求长期追读与世界观完成度' },
  { id: 'fanqie', name: '番茄小说', focus: '免费爽文，节奏快、情节密度高、paid 卡点密', reader: '开篇即钩子、快节奏爽点驱动' },
  { id: 'jinjiang', name: '晋江文学城', focus: '女频言情/纯爱/衍生，人设与情感张力', reader: '人设惊艳、情感细腻、文笔到位' },
  { id: 'feilu', name: '飞卢小说', focus: '脑洞/同人/无限流，设定新颖、爽点直接', reader: '点子取胜、读起来不累' },
  { id: 'qimao', name: '七猫中文', focus: '免费长篇，追读与完读率权重高', reader: '骨架稳、长篇不断更流畅' },
];

/** 各题材的「爆款风向」通用画像（内置参考，非实时榜单） */
export interface GenreTrend {
  genre: string;
  hotspot: string; // 当前常见高热方向（话题性措辞）
  tropes: string[]; // 高频爆款桥段/元素
  contrast: string[]; // 人设反差 / 阶层冲突入手点
  rhythm: 'fast' | 'medium' | 'slow';
  hookPattern: string; // 开篇/断章钩子套路
  words: string[]; // 自带热度关键词
}

export const GENRE_TRENDS: GenreTrend[] = [
  { genre: '玄幻', hotspot: '白月光/强反差开局 + 升级流爽点与身份伏笔', tropes: ['废柴逆袭', '天才陨落重生', '血脉觉醒', '异界降临'], contrast: ['表面废柴·实则万古才俊', '卑微仆役·暗中大佬'], rhythm: 'fast', hookPattern: '开局即抛身份反差或危机，章末升级/打脸卡点', words: ['跃迁', '觉醒', '圣境', '帝尊', '气运'] },
  { genre: '言情', hotspot: '人设吸引力前置，糖刀交替 + 阶层/身份反差', tropes: ['双洁/强强', '破镜重圆', '替身/追妻火葬场', '先婚后爱'], contrast: ['高冷强者·内心温柔', '落魄千金·身边隐世大佬'], rhythm: 'medium', hookPattern: '开篇一次意外相遇或误会，章末情感倒钩', words: ['心动', '暗恋', '偏爱', '救赎', '一眼万年'] },
  { genre: '悬疑', hotspot: '开篇即命案/谜题，走线密集 + 终局反转', tropes: ['连环案', '密室/孤岛', '记忆迷藏', '复仇真相'], contrast: ['无害负责人·每案真凶', '老实邻居·潜伏者的善良'], rhythm: 'medium', hookPattern: '开篇一个反常细节或命案，章末新证据/危险逼近', words: ['真相', '反转', '线索', '凶案', '面具'] },
  { genre: '科幻', hotspot: 'AI/脑机/星际 + 认知颠覆与伦理冲突', tropes: ['AI觉醒', '星际远征', '时空悖论', '末世降临'], contrast: ['普通职员·隐藏身份首脑', '守旧者·革命旗手'], rhythm: 'medium', hookPattern: '开篇一个设定悖论，章末抛出更大的世界秘密', words: ['觉醒', '跃迁', '奇点', '矩阵', '维度'] },
  { genre: '都市', hotspot: '身份反差 + 阶层冲突 + 打脸节奏', tropes: ['赘婿/神医', '重生暴富', '隐藏大佬', '卧底归来'], contrast: ['人前落魄·人后巨鳄', '草根出身·隐藏皇商'], rhythm: 'fast', hookPattern: '开篇被轻慢/侮辱，章末揭底打脸或身份反转', words: ['隐藏', '逆袭', '打脸', '夫人', '巨头'] },
  { genre: '历史', hotspot: '权谋博弈 + 历史事件亲历 + 改史爽点', tropes: ['穿越改史', '明君改造', '权臣/将门', '乱世群雄'], contrast: ['低阶寒门·胸中韬略', '闲散纨绔·运筹帷幄'], rhythm: 'slow', hookPattern: '开篇一场朝堂危机或命运节点，章末计谋落子', words: ['权谋', '朝堂', '争霸', '变法', '社稷'] },
  { genre: '末世', hotspot: '生存高压 + 人性抉择 + 金手指自救', tropes: ['丧尸围城', '天灾求生', '基地流', '重生末世前'], contrast: ['普通人·隐藏先知', '冷血首领·重情内核'], rhythm: 'fast', hookPattern: '开篇末世降临求生，章末新威胁或物资危机', words: ['幸存', '变异', '危机', '基地', '求生'] },
  { genre: '游戏', hotspot: '职业/系统脑洞 + 副本与隐藏奖励', tropes: ['无限流', '全息沉浸', '生活玩家', '系统流'], contrast: ['低级职业·隐藏天命', '咸鱼玩家·公会支柱'], rhythm: 'fast', hookPattern: '开篇一个反常属性/隐藏任务，章末bug级收获', words: ['副本', '隐藏任务', '神装', '甩锅', '欧皇'] },
  { genre: '宫斗', hotspot: '步步为营 + 阶级/位分反差 + 因果清算', tropes: ['庶女上位', '废后重生', '替身入宫', '前朝后宫联动'], contrast: ['低位忍辱·实则聪明人设', '无害妃嫔·背后执棋'], rhythm: 'medium', hookPattern: '开篇一次暗害或位分转折，章末新对手/圣宠卡点', words: ['圣宠', '扳倒', '布局', '司礼', '恩宠'] },
  { genre: '其他', hotspot: '跨题材融合 / 轻日常，靠人设与梗取胜', tropes: ['轻小说日常', '同人衍生', '系统日常', '治愈'], contrast: ['废物人设·隐藏实力', '高冷设定·反差萌'], rhythm: 'medium', hookPattern: '开篇一个笑点或萌点，章末抛一个日常反转', words: ['萌', '沙雕', '隐藏', '反差', '治愈'] },
];

export interface TrendAnalysis {
  sourceName: string;
  sourceFocus: string;
  genre: string;
  hotspot: string;
  tropes: string[];
  contrast: string[];
  rhythm: GenreTrend['rhythm'];
  hookPattern: string;
  words: string[];
}

export function getTrend(sourceId: string, genre: string): TrendAnalysis | null {
  const source = RANK_SOURCES.find((s) => s.id === sourceId);
  const g = GENRE_TRENDS.find((x) => x.genre === genre) ?? GENRE_TRENDS[GENRE_TRENDS.length - 1];
  if (!source) return null;
  return {
    sourceName: source.name,
    sourceFocus: source.focus,
    genre: g.genre,
    hotspot: g.hotspot,
    tropes: g.tropes,
    contrast: g.contrast,
    rhythm: g.rhythm,
    hookPattern: g.hookPattern,
    words: g.words,
  };
}

/** 确定性派生选题建议（LLM 不可用兜底） */
export function deriveTrendHints(t: TrendAnalysis): string[] {
  const s: string[] = [];
  s.push(`平台${t.sourceName}偏好${t.sourceFocus}——围绕「${t.hotspot}」最易出热梗。`);
  s.push(`常用人设反差：${t.contrast.join('；')}——是天然的开篇钩子与后续打脸素材。`);
  if (t.tropes.length) s.push(`高频桥段可组合复用：${t.tropes.slice(0, 4).join('、')}。`);
  s.push(`开篇那样写：${t.hookPattern}。`);
  return s;
}

const SYSTEM_PROMPT = `你是一位题材策划，熟悉起点/番茄/晋江/飞卢/七猫等小说平台的榜单口味。用户会给出一个平台 + 一个题材，请你据此给出可直接用的「选题灵感」，严格只输出 JSON（不要解释/前后缀/markdown），字段如下：
{
  "cards": [
    { "kind": "hook|coolpoint|pacing|character|structure|other", "title": "灵感卡标题", "content": "可落地的具体写法/人设/卡点设定（1-3 句）" }
  ]
}
要求：cards 3-5 张，必须具体可执行（给人物关系、反差、开篇与断章卡点都可），不要空话。`;

interface RawResult {
  cards?: Array<{ kind?: string; title?: string; content?: string }>;
}

const CARD_KINDS: InspirationCard['kind'][] = [
  'golden-three', 'hook', 'coolpoint', 'pacing', 'character', 'structure', 'other',
];

/**
 * 生成趋势灵感卡：先做确定性分析，再调用 LLM 扩写为 3-5 张可收藏灵感卡；
 * LLM 失败/返回非法时降级为确定性派生建议（无 cards 时给出 1 张结构卡兜底）。
 */
export async function generateTrendInspiration(
  projectId: string,
  sourceId: string,
  genre: string
): Promise<{ cards: InspirationCard[]; trend: TrendAnalysis; fromLLM: boolean }> {
  const trend = getTrend(sourceId, genre) ?? getTrend('fanqie', '都市')!;
  const base = deriveTrendHints(trend);
  // 平台榜单参考 + 原创性规避负例（同题材代表作黑名单）
  const avoidance = buildAvoidance({ genre: trend.genre, platformId: sourceId });
  let fromLLM = false;
  let cards: InspirationCard[] = [];

  const userPrompt = [
    `【平台】${trend.sourceName}`,
    `【题材】${trend.genre}`,
    `【热度方向】${trend.hotspot}`,
    `【高频桥段】${trend.tropes.join('、')}`,
    `【人设反差】${trend.contrast.join('；')}`,
    `【节奏】${trend.rhythm}｜【开篇/断章】${trend.hookPattern}`,
    '',
    `【目标平台榜单参考】`,
    avoidance.rankingHint || '（暂无内置榜单参考，请自行把握热度方向）',
    '',
    `【原创性/规避要求】`,
    avoidance.prompt,
    '',
    '注意：以上榜单与热梗仅作选题方向参考。请在同题材下做差异化创新，灵感卡必须给出差异化设定与差异化人设，不要整体复刻下方列入规避名单的代表作。',
    '',
    '请给出 3-5 张可收藏的选题灵感卡（严格 JSON）。',
  ].join('\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.6, maxTokens: 700 }
    ).catch(() => null);

    if (result) {
      const parsed = safeParseJSON<RawResult>(result.content ?? '', {});
      const raw = Array.isArray(parsed.cards) ? parsed.cards.slice(0, 5) : [];
      if (raw.length > 0) {
        cards = raw
          .map((c, i) => ({
            id: `trend_${Date.now()}_${i}`,
            projectId,
            kind: (CARD_KINDS as string[]).includes(c.kind ?? '')
              ? (c.kind as InspirationCard['kind'])
              : 'structure',
            title: (c.title ?? '趋势灵感').trim().slice(0, 40),
            content: (c.content ?? '').trim(),
            sourceDeconstructionId: `trend_${sourceId}`,
            createdAt: Date.now(),
          }))
          .filter((c) => c.content.length > 0);
        fromLLM = cards.length > 0;
      }
    }
  } catch {
    // 静默降级
  }

  if (cards.length === 0) {
    cards = [
      {
        id: `trend_${Date.now()}_0`,
        projectId,
        kind: 'structure',
        title: `${trend.genre} · ${trend.sourceName} 选题方向`,
        content: ['[悬避撞提示] 请差异化创新，不要整体复刻：' + (avoidance.avoid.join('、') || '暂无内置代表作，请保持原创'), trend.hotspot, ...base].join('\n'),
        sourceDeconstructionId: `trend_${sourceId}`,
        createdAt: Date.now(),
      },
    ];
  }

  return { cards, trend, fromLLM };
}