// ============================================================================
// 灵感起点「换一批」生成器（AI 优先）
// 职责：LLM 按题材多样性产出 5 个选题起点（标题 + 题材）；LLM 不可用 /
//       返回不合法时，回退到内置精选池随机换一批（确定性可测）。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';

/** 单个选题起点：点击后填入向导的标题与题材 */
export interface InspirationStart {
  title: string;
  genre: string;
}

/** 合法题材白名单（与向导 GENRE_OPTIONS 对齐，LLM 越界题材回退「其他」） */
const GENRES = ['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他'] as const;

/** 内置精选池：LLM 不可用时的兜底选题（覆盖各题材、可多轮换出不重复批次） */
export const FALLBACK_STARTS: InspirationStart[] = [
  { title: '星河黎明', genre: '科幻' },
  { title: '赘婿归来', genre: '都市' },
  { title: '废柴逆袭', genre: '玄幻' },
  { title: '幕后黑手', genre: '悬疑' },
  { title: '宫廷嫡女', genre: '宫斗' },
  { title: '末世囤货', genre: '末世' },
  { title: '长安密卷', genre: '历史' },
  { title: '全职进阶', genre: '游戏' },
  { title: '甜宠邻居', genre: '言情' },
  { title: '深渊回响', genre: '悬疑' },
  { title: '上古剑魂', genre: '玄幻' },
  { title: '星际农场', genre: '科幻' },
  { title: '离婚快乐', genre: '都市' },
  { title: '冷宫签到', genre: '宫斗' },
  { title: '规则怪谈', genre: '悬疑' },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 归一化 LLM 返回的起点列表：过滤非法项、题材越界归「其他」、去重、排除上一批。
 * 不合法（非数组/不足 3 条）返回 null，供上层兜底。
 */
export function normalizeStarts(raw: unknown, excludeTitles: string[] = []): InspirationStart[] | null {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { starts?: unknown }).starts)
      ? (raw as { starts: unknown[] }).starts
      : null;
  if (!list) return null;

  const excluded = new Set(excludeTitles.map((t) => t.trim()).filter(Boolean));
  const seen = new Set<string>();
  const result: InspirationStart[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const title = String((item as { title?: unknown }).title ?? '').trim().slice(0, 20);
    const rawGenre = String((item as { genre?: unknown }).genre ?? '').trim();
    const genre = (GENRES as readonly string[]).includes(rawGenre) ? rawGenre : '其他';
    if (!title || excluded.has(title) || seen.has(title)) continue;
    seen.add(title);
    result.push({ title, genre });
    if (result.length >= 5) break;
  }
  return result.length >= 3 ? result : null;
}

/**
 * AI 换一批选题起点：LLM 产出 5 个与上一批不重复的题材多样起点；
 * LLM 不可用或返回不合法时，内置池随机兜底。
 */
export async function generateInspirationStarts(
  excludeTitles: string[] = []
): Promise<{ starts: InspirationStart[]; usedFallback: boolean }> {
  try {
    const result = await chat(
      [
        {
          role: 'system',
          content:
            '你是网文选题策划。输出 JSON：{"starts":[{"title":"书名","genre":"题材"}]}。要求：1) 5 条；2) 书名 2-6 个字、有画面感与钩子，像热门网文书名；3) genre 从「玄幻/言情/悬疑/科幻/都市/历史/末世/游戏/宫斗/其他」中选，尽量彼此不同；4) 不要输出 JSON 以外的解释。',
        },
        {
          role: 'user',
          content: `换一批新的选题起点${excludeTitles.length ? `，避开这些已有书名：${excludeTitles.join('、')}` : ''}。`,
        },
      ],
      { responseFormat: 'json', temperature: 1.1, maxTokens: 600 }
    );
    const starts = normalizeStarts(safeParseJSON(result.content, {}), excludeTitles);
    if (starts) return { starts, usedFallback: false };
  } catch {
    // LLM 不可用 → 走内置池兜底
  }
  const pool = shuffle(FALLBACK_STARTS.filter((s) => !excludeTitles.includes(s.title)));
  const starts = (pool.length >= 5 ? pool : shuffle(FALLBACK_STARTS)).slice(0, 5);
  return { starts, usedFallback: true };
}
