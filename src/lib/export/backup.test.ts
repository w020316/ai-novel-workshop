// ============================================================================
// 备份导出测试
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBackup, downloadBackup } from './backup';
import type { ProjectBackup } from './backup';
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

function makeBackup(): ProjectBackup {
  return {
    version: 1,
    exportedAt: Date.now(),
    project: mockProject,
    worldview: null,
    characters: [],
    outline: null,
    foreshadowings: [],
    chapters: [],
    chapterSummaries: [],
    consistencyReports: [],
    plotThreads: [
      {
        id: 'p1',
        projectId: 'proj-1',
        name: '主线',
        type: 'main',
        description: '主角成长',
        status: 'active',
        relatedChapters: [],
        embedding: new Float32Array([0.5, 1.5]),
        updatedAt: 0,
      },
    ],
    stylePreset: null,
  };
}

describe('downloadBackup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('应将 Float32Array 序列化为 __type 结构', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:ref');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.fn();
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadBackup(makeBackup());

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const parsed = JSON.parse(await blob.text());
    expect(parsed.plotThreads[0].embedding).toEqual({ __type: 'Float32Array', data: [0.5, 1.5] });
    expect(click).toHaveBeenCalled();
  });

  it('未指定文件名时应生成默认文件名', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn().mockReturnValue('blob:1'), revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadBackup(makeBackup());

    expect(anchor.download).toMatch(/^backup_测试小说_\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('指定文件名时应使用自定义文件名', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn().mockReturnValue('blob:2'), revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadBackup(makeBackup(), '我的备份.json');

    expect(anchor.download).toBe('我的备份.json');
  });
});