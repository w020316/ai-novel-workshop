// ============================================================================
// 项目备份导入恢复测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseBackup, restoreBackup, readBackupFile } from './restore';
import { db } from '@/lib/db/schema';
import type { ProjectBackup } from '@/lib/export/backup';
import type {
  NovelProject,
  Worldview,
  Character,
  Outline,
  Foreshadowing,
  Chapter,
  ChapterSummary,
  ConsistencyReport,
  PlotThread,
  StylePreset,
} from '@/types';

// restore.ts 引入了 sonner 的 toast，这里 mock 掉避免副作用
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockProject: NovelProject = {
  id: 'proj-1',
  title: '测试小说',
  genre: '玄幻',
  summary: '',
  targetWords: 100000,
  stylePresetId: '',
  llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
  status: 'drafting',
  currentVolume: 1,
  currentChapter: 0,
  createdAt: 0,
  updatedAt: 0,
};

const mockWorldview: Worldview = {
  id: 'w1', projectId: 'proj-1', worldStructure: '九州仙侠设定', powerSystem: '灵气', geography: '东荒',
  era: '万古', factions: '宗门', rules: ['禁法'], locked: false, updatedAt: 0,
};

const mockCharacters: Character[] = [
  {
    id: 'c1', projectId: 'proj-1', name: '林玄', role: 'protagonist', appearance: '白衣',
    personality: '坚韧', catchphrase: '', background: '', motivation: '', weakness: '',
    growthArc: '', relationships: [], speechStyle: '', behaviorPattern: '', locked: false, updatedAt: 0,
  },
];

const mockOutline: Outline = {
  id: 'o1', projectId: 'proj-1', volumes: [], mainPlotline: '主角成神', climaxNodes: [],
  ending: '大道归一', updatedAt: 0,
};

const mockForeshadowings: Foreshadowing[] = [
  {
    id: 'f1', projectId: 'proj-1', description: '神秘封印', setupChapter: 1, importance: 'high',
    status: 'pending', relatedCharacters: [], createdAt: 0,
  },
];

const mockChapters: Chapter[] = [
  {
    id: 'ch1', projectId: 'proj-1', volumeNo: 1, chapterNo: 1, title: '序章', plotPoints: [],
    content: '正文', wordCount: 10, status: 'completed', createdAt: 0, updatedAt: 0,
  },
];

const mockChapterSummaries: ChapterSummary[] = [
  {
    id: 'cs1', projectId: 'proj-1', chapterId: 'ch1', chapterNo: 1, volumeNo: 1,
    summary: '摘要', keyEvents: [], characterStates: {},
    embedding: new Float32Array([0.1, 0.2]), createdAt: 0,
  },
];

const mockConsistencyReports: ConsistencyReport[] = [
  { chapterId: 'ch1', passed: true, issues: [], checkedAt: 0 },
];

const mockPlotThreads: PlotThread[] = [
  {
    id: 'pt1', projectId: 'proj-1', name: '主线', type: 'main', description: '成长', status: 'active',
    relatedChapters: [], embedding: new Float32Array([0.3]), updatedAt: 0,
  },
];

const mockStylePreset: StylePreset = {
  id: 'sp1', name: '古风', narrativePerspective: 'third-limited', pacing: 'medium',
  descriptionDensity: 'medium', dialogueRatio: 0.4,
};

function makeBackup(): ProjectBackup {
  return {
    version: 1,
    exportedAt: Date.now(),
    project: mockProject,
    worldview: mockWorldview,
    characters: mockCharacters,
    outline: mockOutline,
    foreshadowings: mockForeshadowings,
    chapters: mockChapters,
    chapterSummaries: mockChapterSummaries,
    consistencyReports: mockConsistencyReports,
    plotThreads: mockPlotThreads,
    stylePreset: mockStylePreset,
  };
}

describe('import/restore', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe('parseBackup', () => {
    it('应解析合法备份并恢复 Float32Array', () => {
      const json = JSON.stringify({
        version: 1,
        project: mockProject,
        plotThreads: [
          {
            id: 'pt1', projectId: 'proj-1', name: '主线', type: 'main', description: 'd',
            status: 'active', relatedChapters: [],
            embedding: { __type: 'Float32Array', data: [0.1, 0.2, 0.3] },
            updatedAt: 0,
          },
        ],
      });
      const backup = parseBackup(json);
      expect(backup.version).toBe(1);
      expect(backup.project.id).toBe('proj-1');
      const vec = (backup.plotThreads![0] as { embedding: Float32Array }).embedding;
      expect(Object.prototype.toString.call(vec)).toBe('[object Float32Array]');
      expect(vec.length).toBe(3);
      expect(Math.round(vec[0] * 10) / 10).toBe(0.1);
      expect(Math.round(vec[2] * 10) / 10).toBe(0.3);
    });

    it('缺少版本号或项目时应抛出错误', () => {
      expect(() => parseBackup(JSON.stringify({ project: mockProject }))).toThrow('无效的备份文件');
      expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow('无效的备份文件');
    });

    it('非法 JSON 时应抛出错误', () => {
      expect(() => parseBackup('not-json{{{')).toThrow();
    });
  });

  describe('restoreBackup', () => {
    it('应恢复全部数据并返回项目 ID', async () => {
      const id = await restoreBackup(makeBackup());
      expect(id).toBe('proj-1');

      expect(await db.projects.get('proj-1')).toMatchObject({ title: '测试小说' });
      expect(await db.worldviews.get('w1')).toBeDefined();
      expect(await db.characters.count()).toBe(1);
      expect(await db.outlines.get('o1')).toBeDefined();
      expect(await db.foreshadowings.count()).toBe(1);
      expect(await db.chapters.get('ch1')).toBeDefined();
      expect(await db.chapterSummaries.count()).toBe(1);
      expect(await db.consistencyReports.count()).toBe(1);
      expect(await db.plotThreads.count()).toBe(1);
      expect(await db.stylePresets.get('sp1')).toBeDefined();

      // 向量应为 Float32Array（跨域 realm 使用 toString 判别）
      const report = await db.plotThreads.get('pt1');
      const embedding = (report as { embedding: unknown }).embedding;
      expect(Object.prototype.toString.call(embedding)).toBe('[object Float32Array]');
      expect(Math.round((embedding as Float32Array)[0] * 10) / 10).toBe(0.3);
    });

    it('已存在同名项目时应抛出错误', async () => {
      await db.projects.add(mockProject);
      await expect(restoreBackup(makeBackup())).rejects.toThrow('已存在');
    });
  });

  describe('readBackupFile', () => {
    it('应读取文件并解析备份', async () => {
      const file = new File([JSON.stringify({ version: 1, project: mockProject })], 'backup.json');
      const backup = await readBackupFile(file);
      expect(backup.project.id).toBe('proj-1');
    });

    it('文件内容无效时应 reject', async () => {
      const file = new File(['not-json'], 'backup.json');
      await expect(readBackupFile(file)).rejects.toThrow();
    });

    it('文件读取失败时应 reject', async () => {
      vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
        this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
      });
      const file = new File(['x'], 'backup.json');
      await expect(readBackupFile(file)).rejects.toThrow('文件读取失败');
    });
  });
});