// ============================================================================
// 短期记忆 Store（Zustand）
// 依据：spec 5.5 节 / 计划 P4.4
// 职责：管理当前写作 session 的短期记忆
// ============================================================================
import { create } from 'zustand';
import type { ChapterSummary } from '@/types';

export interface ShortTermMemoryState {
  /** 前几章的摘要（最多 3 章） */
  prevChapters: ChapterSummary[];
  /** 当前章节的草稿 */
  currentDraft: string;
  /** 当前剧情要点 */
  currentPlotPoints: string[];
  /** 当前出场人物 ID 列表 */
  activeCharacterIds: string[];

  // === Actions ===
  setPrevChapters: (chapters: ChapterSummary[]) => void;
  addPrevChapter: (chapter: ChapterSummary) => void;
  setCurrentDraft: (draft: string) => void;
  appendToCurrentDraft: (text: string) => void;
  setCurrentPlotPoints: (points: string[]) => void;
  setActiveCharacterIds: (ids: string[]) => void;
  clear: () => void;
}

const MAX_PREV_CHAPTERS = 3;

export const useShortTermMemory = create<ShortTermMemoryState>((set) => ({
  prevChapters: [],
  currentDraft: '',
  currentPlotPoints: [],
  activeCharacterIds: [],

  setPrevChapters: (chapters) =>
    set({ prevChapters: chapters.slice(-MAX_PREV_CHAPTERS) }),

  addPrevChapter: (chapter) =>
    set((state) => ({
      prevChapters: [...state.prevChapters, chapter].slice(-MAX_PREV_CHAPTERS),
    })),

  setCurrentDraft: (draft) => set({ currentDraft: draft }),

  appendToCurrentDraft: (text) =>
    set((state) => ({ currentDraft: state.currentDraft + text })),

  setCurrentPlotPoints: (points) => set({ currentPlotPoints: points }),

  setActiveCharacterIds: (ids) => set({ activeCharacterIds: ids }),

  clear: () =>
    set({
      prevChapters: [],
      currentDraft: '',
      currentPlotPoints: [],
      activeCharacterIds: [],
    }),
}));