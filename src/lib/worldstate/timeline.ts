// ============================================================================
// 世界时间线（World Timeline）
// 依据：开源补研 v2 P2-7（对标 AI-Novel-Writing-Assistant 时间线 track）——
//       把章节摘要中的关键事件按「卷 → 章」排成全局事件流，一眼看懂故事走到哪。
// 设计：纯函数、确定性、无 LLM/无网络；构建与展示分离，稳定可测。
// ============================================================================

export interface TimelineChapter {
  chapterNo: number;
  volumeNo: number;
  title: string;
}

export interface TimelineSummary {
  chapterNo: number;
  keyEvents: string[];
}

export interface TimelineVolume {
  volumeNo?: number;
  title?: string;
}

export interface TimelineItem {
  chapterNo: number;
  title: string;
  /** 每章最多保留 3 条关键事件 */
  keyEvents: string[];
}

export interface TimelineGroup {
  volumeNo: number;
  volumeTitle?: string;
  items: TimelineItem[];
}

/** 每章保留的关键事件条数上限 */
export const MAX_EVENTS_PER_CHAPTER = 3;

/**
 * 构建「卷 → 章 → 关键事件」时间线。
 * @param chapters 全部章节（有正文的才算站上时间线）
 * @param summaries 章节摘要（keyEvents 为空也能上时间线，仅显示标题）
 * @param volumes 大纲卷（用于卷标题标注，可选）
 */
export function buildTimeline(
  chapters: TimelineChapter[],
  summaries: TimelineSummary[],
  volumes: TimelineVolume[] = []
): TimelineGroup[] {
  const eventsByChapter = new Map<number, string[]>();
  for (const s of summaries) {
    const ev = (s.keyEvents ?? [])
      .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      .slice(0, MAX_EVENTS_PER_CHAPTER);
    eventsByChapter.set(s.chapterNo, ev);
  }
  const titleByVolume = new Map(volumes.map((v) => [v.volumeNo, v.title]));

  const groupMap = new Map<number, TimelineGroup>();
  for (const c of chapters) {
    const g = groupMap.get(c.volumeNo) ?? {
      volumeNo: c.volumeNo,
      volumeTitle: titleByVolume.get(c.volumeNo),
      items: [],
    };
    g.items.push({
      chapterNo: c.chapterNo,
      title: c.title,
      keyEvents: eventsByChapter.get(c.chapterNo) ?? [],
    });
    groupMap.set(c.volumeNo, g);
  }

  return [...groupMap.values()]
    .sort((a, b) => a.volumeNo - b.volumeNo)
    .map((g) => ({
      ...g,
      volumeTitle: g.volumeTitle,
      items: g.items.sort((a, b) => a.chapterNo - b.chapterNo),
    }));
}
