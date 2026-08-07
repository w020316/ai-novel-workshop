// ============================================================================
// 备份导出测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { createBackup } from './backup';
import type { NovelProject } from '@/types';

const mockProject: NovelProject = {
  id: 'proj-1', title: '测试小说', genre: '玄幻', summary: '',
  targetWords: 100000, stylePresetId: '', llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
  status: 'drafting', currentVolume: 1, currentChapter: 0, createdAt: 0, updatedAt: 0,
};

describe('createBackup', () => {
  it('应包含版本号和导出时间', async () => {
    const backup = await createBackup({
      project: mockProject, worldview: null, characters: [], outline: null,
      foreshadowings: [], chapters: [], chapterSummaries: [],
      consistencyReports: [], plotThreads: [], stylePreset: null,
    });
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeGreaterThan(0);
  });

  it('应包含项目数据', async () => {
    const backup = await createBackup({
      project: mockProject, worldview: null, characters: [], outline: null,
      foreshadowings: [], chapters: [], chapterSummaries: [],
      consistencyReports: [], plotThreads: [], stylePreset: null,
    });
    expect(backup.project.title).toBe('测试小说');
    expect(backup.project.genre).toBe('玄幻');
  });
});