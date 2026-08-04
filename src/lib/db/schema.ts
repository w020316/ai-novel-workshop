// ============================================================================
// Dexie 数据库定义
// 依据：spec 5.6 节
// ============================================================================
import Dexie, { type Table } from 'dexie';
import type {
  NovelProject,
  Worldview,
  Character,
  Outline,
  Foreshadowing,
  Chapter,
  ChapterSummary,
  PlotThread,
  StylePreset,
  GenreTemplate,
  ConsistencyReport,
} from '@/types';

export class NovelDB extends Dexie {
  projects!: Table<NovelProject, string>;
  worldviews!: Table<Worldview, string>;
  characters!: Table<Character, string>;
  outlines!: Table<Outline, string>;
  foreshadowings!: Table<Foreshadowing, string>;
  chapters!: Table<Chapter, string>;
  chapterSummaries!: Table<ChapterSummary, string>;
  plotThreads!: Table<PlotThread, string>;
  stylePresets!: Table<StylePreset, string>;
  genreTemplates!: Table<GenreTemplate, string>;
  consistencyReports!: Table<ConsistencyReport, string>;

  constructor() {
    super('ai_novel_workshop');
    this.version(1).stores({
      projects: 'id, title, status, updatedAt',
      worldviews: 'id, projectId, locked',
      characters: 'id, projectId, name, role',
      outlines: 'id, projectId',
      foreshadowings: 'id, projectId, status, setupChapter',
      chapters: 'id, projectId, [volumeNo+chapterNo], status',
      chapterSummaries: 'id, projectId, chapterNo, volumeNo',
      plotThreads: 'id, projectId, status',
      stylePresets: 'id, name',
      genreTemplates: 'id, genre',
      consistencyReports: 'chapterId',
    });
  }
}

export const db = new NovelDB();
