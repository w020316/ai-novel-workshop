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
  Deconstruction,
  InspirationCard,
  ChapterVersion,
  LiveRankedWork,
  BatchJob,
  WritingSkill,
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
  deconstructions!: Table<Deconstruction, string>;
  inspirationCards!: Table<InspirationCard, string>;
  chapterVersions!: Table<ChapterVersion, string>;
  liveRankedWorks!: Table<LiveRankedWork, string>;
  batchJobs!: Table<BatchJob, string>;
  skills!: Table<WritingSkill, string>;

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
    // 拆书工坊表：作为独立索引字段追加，避免影响既有 version(1) 数据
    this.version(2).stores({
      deconstructions: 'id, projectId, createdAt',
      inspirationCards: 'id, projectId, kind, sourceDeconstructionId',
    });
    // 章节版本：正文历史快照（阶段二·版本回滚）
    this.version(3).stores({
      chapterVersions: 'id, chapterId, projectId, chapterNo, createdAt',
    });
    // 实时榜单动态查重库（阶段十七）
    this.version(4).stores({
      liveRankedWorks: 'id, sourceId, title, fetchedAt',
    });
    // 批量续写任务（断点续写·暂停恢复）
    this.version(5).stores({
      batchJobs: 'id, projectId, updatedAt',
    });
    // 写作技能库（Skills，跨项目全局）
    this.version(6).stores({
      skills: 'id, name, category, source, builtin, enabled',
    });
  }
}

export const db = new NovelDB();
