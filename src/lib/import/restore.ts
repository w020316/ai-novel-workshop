// ============================================================================
// 项目备份导入恢复
// ============================================================================
import type { ProjectBackup } from '@/lib/export/backup';
import { db } from '@/lib/db/schema';
import { toast } from 'sonner';

/**
 * 从 JSON 字符串解析备份
 */
export function parseBackup(json: string): ProjectBackup {
  const data = JSON.parse(json, (_key, value) => {
    // 恢复 Float32Array
    if (value && typeof value === 'object' && value.__type === 'Float32Array') {
      return new Float32Array(value.data);
    }
    return value;
  });

  if (!data.version || !data.project) {
    throw new Error('无效的备份文件');
  }
  return data as ProjectBackup;
}

/**
 * 恢复备份到 IndexedDB
 * 返回恢复的项目 ID
 */
export async function restoreBackup(data: ProjectBackup): Promise<string> {
  const projectId = data.project.id;

  // 检查是否已存在同名项目
  const existing = await db.projects.get(projectId);
  if (existing) {
    throw new Error(`项目 "${data.project.title}" 已存在，请先删除现有项目再恢复`);
  }

  await db.transaction(
    'rw',
    [
      db.projects, db.worldviews, db.characters, db.outlines,
      db.foreshadowings, db.chapters, db.chapterSummaries,
      db.consistencyReports, db.plotThreads, db.stylePresets,
    ],
    async () => {
      await db.projects.add(data.project);
      if (data.worldview) await db.worldviews.add(data.worldview);
      for (const c of data.characters) await db.characters.add(c);
      if (data.outline) await db.outlines.add(data.outline);
      for (const f of data.foreshadowings) await db.foreshadowings.add(f);
      for (const ch of data.chapters) await db.chapters.add(ch);
      for (const s of data.chapterSummaries) await db.chapterSummaries.add(s);
      for (const r of data.consistencyReports) await db.consistencyReports.add(r);
      for (const t of data.plotThreads) await db.plotThreads.add(t);
      if (data.stylePreset) await db.stylePresets.add(data.stylePreset);
    }
  );

  return projectId;
}

/**
 * 从文件读取备份
 */
export function readBackupFile(file: File): Promise<ProjectBackup> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        resolve(parseBackup(text));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}