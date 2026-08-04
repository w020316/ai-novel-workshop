// ============================================================================
// 数据库查询封装
// 依据：spec P0.4
// ============================================================================
import { db } from './schema';
import type {
  NovelProject,
  Worldview,
  Character,
  Outline,
  Foreshadowing,
  Chapter,
  ChapterSummary,
  ConsistencyReport,
  LLMConfig,
} from '@/types';

// ============ 项目 ============
export async function createProject(
  data: Omit<NovelProject, 'id' | 'createdAt' | 'updatedAt' | 'currentVolume' | 'currentChapter'>
): Promise<string> {
  const now = Date.now();
  const id = `proj_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const project: NovelProject = {
    ...data,
    id,
    currentVolume: 1,
    currentChapter: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);
  return id;
}

export async function getProject(projectId: string): Promise<NovelProject | undefined> {
  return db.projects.get(projectId);
}

export async function listProjects(includeArchived = false): Promise<NovelProject[]> {
  const all = await db.projects.orderBy('updatedAt').reverse().toArray();
  return includeArchived ? all : all.filter((p) => p.status !== 'archived');
}

export async function updateProject(
  projectId: string,
  patch: Partial<NovelProject>
): Promise<void> {
  await db.projects.update(projectId, { ...patch, updatedAt: Date.now() });
}

export async function archiveProject(projectId: string): Promise<void> {
  await updateProject(projectId, { status: 'archived' });
}

export async function deleteProject(projectId: string): Promise<void> {
  // 级联删除关联数据（Dexie transaction 最多 7 个表参数，分两步处理）
  // Step 1: 删除关联表数据
  await db.transaction(
    'rw',
    [db.worldviews, db.characters, db.outlines, db.foreshadowings, db.chapters, db.chapterSummaries, db.plotThreads],
    async () => {
      await db.worldviews.where('projectId').equals(projectId).delete();
      await db.characters.where('projectId').equals(projectId).delete();
      await db.outlines.where('projectId').equals(projectId).delete();
      await db.foreshadowings.where('projectId').equals(projectId).delete();
      await db.chapters.where('projectId').equals(projectId).delete();
      await db.chapterSummaries.where('projectId').equals(projectId).delete();
      await db.plotThreads.where('projectId').equals(projectId).delete();
    }
  );
  // Step 2: 删除一致性报告 + 项目本体
  const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
  await db.transaction(
    'rw',
    [db.consistencyReports, db.projects],
    async () => {
      for (const ch of chapters) {
        await db.consistencyReports.where('chapterId').equals(ch.id).delete();
      }
      await db.projects.delete(projectId);
    }
  );
}

// ============ 世界观 ============
export async function getWorldview(projectId: string): Promise<Worldview | undefined> {
  return db.worldviews.where('projectId').equals(projectId).first();
}

export async function saveWorldview(wv: Worldview): Promise<void> {
  await db.worldviews.put({ ...wv, updatedAt: Date.now() });
}

// ============ 人物 ============
export async function listCharacters(projectId: string): Promise<Character[]> {
  return db.characters.where('projectId').equals(projectId).toArray();
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  return db.characters.get(id);
}

export async function saveCharacter(c: Character): Promise<void> {
  await db.characters.put({ ...c, updatedAt: Date.now() });
}

export async function deleteCharacter(id: string): Promise<void> {
  await db.characters.delete(id);
}

// ============ 大纲 ============
export async function getOutline(projectId: string): Promise<Outline | undefined> {
  return db.outlines.where('projectId').equals(projectId).first();
}

export async function saveOutline(o: Outline): Promise<void> {
  await db.outlines.put({ ...o, updatedAt: Date.now() });
}

// ============ 伏笔 ============
export async function listForeshadowings(projectId: string): Promise<Foreshadowing[]> {
  return db.foreshadowings.where('projectId').equals(projectId).toArray();
}

export async function listPendingForeshadowings(projectId: string): Promise<Foreshadowing[]> {
  const all = await listForeshadowings(projectId);
  return all.filter((f) => f.status === 'planted' || f.status === 'pending');
}

export async function saveForeshadowing(f: Foreshadowing): Promise<void> {
  await db.foreshadowings.put(f);
}

export async function markForeshadowingRecovered(
  id: string,
  recoveryChapter: number
): Promise<void> {
  await db.foreshadowings.update(id, {
    status: 'recovered',
    actualRecoveryChapter: recoveryChapter,
  });
}

// ============ 章节 ============
export async function listChapters(projectId: string): Promise<Chapter[]> {
  const all = await db.chapters.where('projectId').equals(projectId).toArray();
  return all.sort((a, b) => a.chapterNo - b.chapterNo);
}

export async function getChapter(projectId: string, chapterNo: number): Promise<Chapter | undefined> {
  const all = await db.chapters.where('projectId').equals(projectId).toArray();
  return all.find((c) => c.chapterNo === chapterNo);
}

export async function getChapterById(id: string): Promise<Chapter | undefined> {
  return db.chapters.get(id);
}

export async function saveChapter(c: Chapter): Promise<void> {
  await db.chapters.put({ ...c, updatedAt: Date.now() });
}

export async function markChapterNeedsRecheck(projectId: string): Promise<number> {
  // 设定修改后标记所有已完成章节需重校验
  const chapters = await db.chapters
    .where('projectId')
    .equals(projectId)
    .filter((c) => c.status === 'completed')
    .toArray();
  for (const ch of chapters) {
    await db.chapters.update(ch.id, { needsRecheck: true });
  }
  return chapters.length;
}

// ============ 章节摘要（中期记忆） ============
export async function listChapterSummaries(projectId: string): Promise<ChapterSummary[]> {
  const all = await db.chapterSummaries.where('projectId').equals(projectId).toArray();
  return all.sort((a, b) => a.chapterNo - b.chapterNo);
}

export async function getPrevChapterSummaries(
  projectId: string,
  currentChapterNo: number,
  count = 3
): Promise<ChapterSummary[]> {
  const all = await listChapterSummaries(projectId);
  return all
    .filter((s) => s.chapterNo < currentChapterNo)
    .slice(-count);
}

export async function saveChapterSummary(s: ChapterSummary): Promise<void> {
  await db.chapterSummaries.put(s);
}

// ============ 一致性报告 ============
export async function getConsistencyReport(chapterId: string): Promise<ConsistencyReport | undefined> {
  return db.consistencyReports.where('chapterId').equals(chapterId).first();
}

export async function saveConsistencyReport(report: ConsistencyReport): Promise<void> {
  await db.consistencyReports.put(report);
}

// ============ 统计 ============
export async function getProjectStats(
  projectId: string
): Promise<{ totalWords: number; totalChapters: number; completedChapters: number }> {
  const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
  return {
    totalWords: chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0),
    totalChapters: chapters.length,
    completedChapters: chapters.filter((c) => c.status === 'completed').length,
  };
}

// ============ LLM 配置 ============
export async function updateProjectLLMConfig(
  projectId: string,
  config: LLMConfig
): Promise<void> {
  await updateProject(projectId, { llmConfig: config });
}
