// ============================================================================
// 项目备份导出（JSON）
// ============================================================================
import type {
  NovelProject, Worldview, Character, Outline, Foreshadowing,
  Chapter, ChapterSummary, ConsistencyReport, PlotThread, StylePreset,
} from '@/types';

export interface ProjectBackup {
  version: 1;
  exportedAt: number;
  project: NovelProject;
  worldview: Worldview | null;
  characters: Character[];
  outline: Outline | null;
  foreshadowings: Foreshadowing[];
  chapters: Chapter[];
  chapterSummaries: ChapterSummary[];
  consistencyReports: ConsistencyReport[];
  plotThreads: PlotThread[];
  stylePreset: StylePreset | null;
}

export async function createBackup(data: Omit<ProjectBackup, 'version' | 'exportedAt'>): Promise<ProjectBackup> {
  return {
    version: 1,
    exportedAt: Date.now(),
    ...data,
  };
}

export function downloadBackup(backup: ProjectBackup, filename?: string): void {
  const json = JSON.stringify(backup, (_key, value) => {
    // 处理 Float32Array（embedding 向量）
    if (value instanceof Float32Array) {
      return { __type: 'Float32Array', data: Array.from(value) };
    }
    return value;
  }, 2);

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `backup_${backup.project.title}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}