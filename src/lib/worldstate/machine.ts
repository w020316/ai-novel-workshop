// ============================================================================
// 世界状态机（World State Machine）
// 背景：参考笔枢亮点 —— 把分散在 情节线/伏笔/章节摘要 中的跨章状态聚合为一张
//       「世界状态快照」：时间线进度、各情节线状态、伏笔埋/收进度、人物在场统计，
//       并给出确定性风险提示（逾期伏笔 / 主线停滞 / 章号空洞）。
// 设计：纯函数、确定性、无 LLM/无网络（与全书避撞体检同模式），注入数据即可测；
//       百万字规模下聚合成本 O(N)，UI 侧一次生成即可展示。
// ============================================================================

/** 情节线停滞判定：最近 N 章未推进即视为停滞 */
export const THREAD_STAGNANT_GAP = 15;

export interface WorldStateChapter {
  chapterNo: number;
  volumeNo: number;
  title: string;
  wordCount: number;
}

export interface WorldStateThread {
  id: string;
  name: string;
  type: 'main' | 'subplot';
  status: 'active' | 'resolved' | 'abandoned';
  relatedChapters: number[];
}

export interface WorldStateForeshadowing {
  id: string;
  description: string;
  setupChapter: number;
  status: 'planted' | 'pending' | 'recovered' | 'abandoned';
  plannedRecoveryChapter?: number;
  actualRecoveryChapter?: number;
}

export interface WorldStateSummary {
  chapterNo: number;
  characterStates: Record<string, string>;
}

export interface WorldStateInput {
  chapters: WorldStateChapter[];
  plotThreads: WorldStateThread[];
  foreshadowings: WorldStateForeshadowing[];
  summaries: WorldStateSummary[];
  /** 计划完结章号（来自大纲卷章节范围的最大值，可选，用于进度百分比） */
  plannedEndChapter?: number;
}

export interface WorldStateThreadRow {
  id: string;
  name: string;
  type: 'main' | 'subplot';
  status: 'active' | 'resolved' | 'abandoned';
  /** 首次出现章号（无则 0） */
  firstChapter: number;
  /** 最近推进章号（无则 0） */
  lastChapter: number;
  /** active 线最近 THREAD_STAGNANT_GAP 章未推进 */
  stagnant: boolean;
}

export interface OverdueForeshadowing {
  id: string;
  description: string;
  setupChapter: number;
  plannedRecoveryChapter?: number;
}

export interface CharacterPresence {
  name: string;
  /** 出场章数（按摘要计） */
  appearances: number;
  lastChapterNo: number;
  lastState: string;
}

export interface WorldStateSnapshot {
  /** 已写章数（含空章节） */
  totalChapters: number;
  latestChapterNo: number;
  latestVolumeNo: number;
  totalWords: number;
  /** 最新章号相对计划完结章号的进度百分比（无计划则 undefined） */
  progressPct?: number;
  /** 1..latest 中缺失的章号（删除留下的洞） */
  holes: number[];
  volumeProgress: Array<{ volumeNo: number; chapters: number; words: number }>;
  threads: WorldStateThreadRow[];
  foreshadowProgress: {
    planted: number;
    pending: number;
    recovered: number;
    abandoned: number;
    /** 已到/过计划回收章仍未收的伏笔 */
    overdue: OverdueForeshadowing[];
  };
  /** 按出场章数降序，最多 12 人 */
  characterPresence: CharacterPresence[];
  /** 确定性风险提示 */
  risks: string[];
}

/**
 * 聚合世界状态快照。纯函数：相同输入永远得到相同输出。
 */
export function buildWorldState(input: WorldStateInput): WorldStateSnapshot {
  const { chapters, plotThreads, foreshadowings, summaries } = input;

  // ---- 时间线进度 ----
  const sortedChapters = [...chapters].sort((a, b) => a.chapterNo - b.chapterNo);
  const latest = sortedChapters[sortedChapters.length - 1];
  const latestChapterNo = latest?.chapterNo ?? 0;
  const latestVolumeNo = latest?.volumeNo ?? 0;
  const totalWords = chapters.reduce((s, c) => s + (c.wordCount || 0), 0);

  const writtenNos = new Set(chapters.map((c) => c.chapterNo));
  const holes: number[] = [];
  for (let n = 1; n <= latestChapterNo; n++) {
    if (!writtenNos.has(n)) holes.push(n);
  }

  const volMap = new Map<number, { volumeNo: number; chapters: number; words: number }>();
  for (const c of chapters) {
    const row = volMap.get(c.volumeNo) ?? { volumeNo: c.volumeNo, chapters: 0, words: 0 };
    row.chapters++;
    row.words += c.wordCount || 0;
    volMap.set(c.volumeNo, row);
  }
  const volumeProgress = [...volMap.values()].sort((a, b) => a.volumeNo - b.volumeNo);

  const plannedEnd = input.plannedEndChapter;
  const progressPct =
    plannedEnd && plannedEnd > 0 && latestChapterNo > 0
      ? Math.min(100, Math.round((latestChapterNo / plannedEnd) * 100))
      : undefined;

  // ---- 情节线状态 ----
  const threads: WorldStateThreadRow[] = plotThreads.map((t) => {
    const rel = [...t.relatedChapters].sort((a, b) => a - b);
    const firstChapter = rel[0] ?? 0;
    const lastChapter = rel[rel.length - 1] ?? 0;
    const stagnant =
      t.status === 'active' &&
      latestChapterNo > 0 &&
      (latestChapterNo - lastChapter >= THREAD_STAGNANT_GAP || lastChapter === 0);
    return { id: t.id, name: t.name, type: t.type, status: t.status, firstChapter, lastChapter, stagnant };
  });

  // ---- 伏笔埋/收进度 ----
  const fs = { planted: 0, pending: 0, recovered: 0, abandoned: 0 };
  const overdue: OverdueForeshadowing[] = [];
  for (const f of foreshadowings) {
    fs[f.status] = (fs[f.status] ?? 0) + 1;
    const planned = f.plannedRecoveryChapter;
    const notRecovered = f.status === 'planted' || f.status === 'pending';
    if (notRecovered && planned !== undefined && planned > 0 && planned <= latestChapterNo) {
      overdue.push({
        id: f.id,
        description: f.description,
        setupChapter: f.setupChapter,
        plannedRecoveryChapter: planned,
      });
    }
  }
  overdue.sort((a, b) => (a.plannedRecoveryChapter ?? 0) - (b.plannedRecoveryChapter ?? 0));

  // ---- 人物在场统计（按章节摘要的 characterStates） ----
  const sortedSummaries = [...summaries].sort((a, b) => a.chapterNo - b.chapterNo);
  const presence = new Map<string, CharacterPresence>();
  for (const s of sortedSummaries) {
    for (const [name, state] of Object.entries(s.characterStates ?? {})) {
      if (!name.trim()) continue;
      const row = presence.get(name) ?? { name, appearances: 0, lastChapterNo: s.chapterNo, lastState: '' };
      row.appearances++;
      row.lastChapterNo = s.chapterNo;
      if (state.trim()) row.lastState = state.trim();
      presence.set(name, row);
    }
  }
  const characterPresence = [...presence.values()]
    .sort((a, b) => b.appearances - a.appearances || b.lastChapterNo - a.lastChapterNo)
    .slice(0, 12);

  // ---- 风险提示（确定性规则） ----
  const risks: string[] = [];
  if (holes.length > 0) {
    const preview = holes.slice(0, 8).join('、');
    risks.push(`章号空洞：第 ${preview}${holes.length > 8 ? ' 等' : ''} 章缺失，补写或核查后可消除。`);
  }
  if (overdue.length > 0) {
    risks.push(
      `${overdue.length} 处伏笔已到/过计划回收章仍未收回，最新一处计划于第 ${overdue[0].plannedRecoveryChapter} 章回收。`
    );
  }
  const stagnantMain = threads.filter((t) => t.stagnant && t.type === 'main');
  if (stagnantMain.length > 0) {
    risks.push(
      `主线「${stagnantMain[0].name}」已 ${latestChapterNo - stagnantMain[0].lastChapter} 章未推进（最近第 ${stagnantMain[0].lastChapter} 章），注意主线锚定。`
    );
  }
  const stagnantSub = threads.filter((t) => t.stagnant && t.type === 'subplot');
  if (stagnantSub.length > 0) {
    risks.push(
      `${stagnantSub.length} 条支线长期未推进（${stagnantSub.slice(0, 3).map((t) => t.name).join('、')}），考虑收束或明确弃置。`
    );
  }

  return {
    totalChapters: chapters.length,
    latestChapterNo,
    latestVolumeNo,
    totalWords,
    progressPct,
    holes,
    volumeProgress,
    threads,
    foreshadowProgress: { ...fs, overdue },
    characterPresence,
    risks,
  };
}
