// ============================================================================
// 原创性查重与规避（Originality Check & Avoidance）
// 职责：
//   1. checkOriginality  把文本（正文/选题/大纲）与 WORKS_DB 中已知作品的
//      标志性桥段/人设/核心梗做相似度比对，命中即提示，确保不整体复刻。
//   2. buildAvoidance    生成"规避负例 + 平台榜单参考"的 Prompt 块，注入到
//      选题/剧情设计/正文创作环节，引导模型在平台热梗方向上创新而非照搬。
// 设计原则：
//   - checkOriginality 全程确定性规则、无 LLM 依赖，稳定可测、零成本。
//   - 规避仅用于"避免雷同"，配合榜单参考做"同方向差异化"，不评估版权归属。
//   - 命中只提示改写/换向，不强制替换，作者拥有最终判断。
// ============================================================================
import { WORKS_DB, platformRankingHint, type RankedWork } from './works-db';

export interface OriginalityHit {
  /** 命中的已知作品名 */
  workTitle: string;
  /** 所属平台 */
  platform: string;
  /** 题材 */
  genre: string;
  /** 命中的标志性桥段 / 人设 / 核心梗 */
  matched: string;
}

export interface OriginalityReport {
  /** 0-100 原创度（越高越不易撞梗；仅自检参考） */
  score: number;
  /** 是否"无明显撞梗、建议可继续" */
  passed: boolean;
  /** 命中明细（按作品去重就近） */
  hits: OriginalityHit[];
  /** 规避建议 */
  hints: string[];
}

export interface OriginalityOptions {
  /** 限定题材（仅对该题材作品库比对，降低跨类误报），缺省全库 */
  genre?: string;
  /** 最多上报几部作品 */
  maxHits?: number;
  /** 运行时叠加黑名单：实时榜单抓取到的热书作品名，按标题级比对 */
  liveTitles?: string[];
}

/**
 * 对文本做原创性查重：逐条比对 WORKS_DB 中作品的标志性桥段与标志性人设。
 * @param text 待查文本（正文 / 选题 / 大纲）
 * @param options 可选题材过滤
 */
export function checkOriginality(text: string, options: OriginalityOptions = {}): OriginalityReport {
  const content = text.trim();
  const maxHits = options.maxHits ?? 3;
  const hints: string[] = [];
  const hits: OriginalityHit[] = [];
  if (!content) {
    return { score: 100, passed: true, hits: [], hints: ['暂无文本可查，默认视为原创。'] };
  }

  // 兼顾题材过滤与全库：优先题材内，其次同平台/全库兜底
  const pool = options.genre
    ? WORKS_DB.filter((w) => w.genre === options.genre)
    : WORKS_DB;
  // 找不到该题材代表作则回退全库
  const candidates = pool.length > 0 ? pool : WORKS_DB;

  // 逐作品匹配，命中一台作品记为一次 hit（作品名本身命中权重更高）
  for (const work of candidates) {
    if (hits.length >= maxHits) break;
    const matched = matchWork(work, content);
    if (matched) {
      hits.push({
        workTitle: work.title,
        platform: work.platform,
        genre: work.genre,
        matched,
      });
    }
  }

  // 运行时叠加黑名单：实时榜单热书名（标题级，逐字命中）
  if (options.liveTitles && options.liveTitles.length && hits.length < maxHits + 3) {
    const c = normalize(content);
    const addedHere: string[] = [];
    for (const title of options.liveTitles) {
      if (!title || addedHere.includes(title)) continue;
      if (hits.length >= maxHits) break;
      if (c.includes(normalize(title))) {
        hits.push({
          workTitle: title,
          platform: 'live',
          genre: '实时榜单',
          matched: '实时榜单热书',
        });
        addedHere.push(title);
      }
    }
  }

  // 原创度：每命中一个高相似代表作显著扣分
  const hitCount = hits.length;
  let score = 100;
  if (hitCount > 0) score -= Math.min(70, 30 + hitCount * 18);

  if (hitCount === 0) {
    hints.push('未命中内置代表作标志性设定，整体原创度良好，可放心推进。');
  } else {
    for (const h of hits) {
      hints.push(
        `检测到与《${h.workTitle}》（${platformName(h.platform)}）的「${h.matched}」高度相似，建议改写人设名/核心设定或换一个切入角度，避免整体复刻。`
      );
    }
    hints.push('平台热度虽是选题方向，但请在同题材下做差异化设定与差异化人设，切勿直接套用经典作品的框架。');
  }

  const passed = hitCount === 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, passed, hits, hints };
}

/** 归一化：仅保留中文/ASCII 字母数字，忽略标点与空白，便于口诀级匹配 */
function normalize(s: string): string {
  return s.replace(/[^\w\u4e00-\u9fff]/g, '');
}

/** 返回命中的标志性片段；未命中返回空串 */
function matchWork(work: RankedWork, content: string): string {
  const c = normalize(content);
  if (work.title && c.includes(normalize(work.title))) return `作品名「${work.title}」`;
  for (const t of work.tropes) {
    if (t && c.includes(normalize(t))) return `桥段「${t}」`;
  }
  if (work.characters && c.includes(normalize(work.characters))) return `人设「${work.characters}」`;
  return '';
}

function platformName(id: string): string {
  const map: Record<string, string> = {
    qidian: '起点', fanqie: '番茄', jinjiang: '晋江',
    feilu: '飞卢', qimao: '七猫', xiaoxiang: '潇湘',
    hongxiu: '红袖', yuewen: '阅文', zongheng: '纵横', huaben: '话本', live: '实时榜单',
  };
  return map[id] ?? id;
}

export interface AvoidanceInput {
  /** 当前题材（用于筛选相关作品负例） */
  genre?: string;
  /** 目标平台 id（用于附带榜单参考，可选） */
  platformId?: string;
  /** 自填的项目定位/梗（可选），追加在负例前，引导沿自我设定创新 */
  premise?: string;
  /** 运行时叠加黑名单：实时榜单热书名（可选） */
  liveTitles?: string[];
}

export interface AvoidanceBlock {
  /** 注入到 Prompt 的完整文本块 */
  prompt: string;
  /** 仅命中规避负例（代表作名列表） */
  avoid: string[];
  /** 平台榜单参考文本（无 platformId 时为空） */
  rankingHint: string;
}

/**
 * 构建"规避负例 + 榜单参考"Prompt 块。
 * 负例取当前题材下最热门的若干代表作，明确"不要整体复刻"；同时给平台榜单方向，
 * 引导在同热梗方向下做差异化创新。
 */
export function buildAvoidance(input: AvoidanceInput = {}): AvoidanceBlock {
  const { genre, platformId, premise, liveTitles } = input;
  const pool = genre ? WORKS_DB.filter((w) => w.genre === genre) : WORKS_DB;
  const works = pool.length > 0 ? pool : WORKS_DB;
  // 去重后取若干代表作为负例
  const avoidWorks = works.slice(0, 4);
  const avoid = avoidWorks.map((w) => w.title);
  const avoidLine = avoidWorks
    .map((w) => `${w.title}（${w.coreTag}）`)
    .join('、');

  const rankingHint = platformId ? platformRankingHint(platformId) : '';

  const parts: string[] = [];
  if (premise) parts.push(`${premise}`);
  parts.push(`【原创性要求·请务必遵守】
请不要整体复刻下面这些经典/高热作品的核心设定、框架与人设。它们仅作“榜单参考方向”，你应围绕本作设定做差异化创新：
${avoidLine || '（暂无内置代表作品，请保持设定自洽原创）'}`);
  if (rankingHint) {
    parts.push('');
    parts.push(`【目标平台榜单参考】
${rankingHint}`);
  }
  if (liveTitles && liveTitles.length) {
    parts.push('');
    parts.push(`【实时榜单·慎撞】以下为当前平台/全网高热热书名，请勿直接套用同名或同梗设定：${liveTitles.slice(0, 20).join('、')}`);
  }

  return { prompt: parts.join('\n'), avoid, rankingHint };
}
