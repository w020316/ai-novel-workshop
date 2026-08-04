import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore, DEFAULT_LLM_CONFIG } from './project-store';
import * as queries from '@/lib/db/queries';
import type { NovelProject } from '@/types';

// Mock 数据库查询
vi.mock('@/lib/db/queries', () => ({
  createProject: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const mockProject = (overrides: Partial<NovelProject> = {}): NovelProject => ({
  id: 'proj_test_1',
  title: '测试小说',
  genre: '玄幻',
  summary: '一个测试故事',
  targetWords: 300000,
  stylePresetId: 'style-preset-1',
  llmConfig: DEFAULT_LLM_CONFIG,
  status: 'drafting',
  currentVolume: 1,
  currentChapter: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('useProjectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
      error: null,
    });
  });

  describe('loadProjects', () => {
    it('应成功加载项目列表', async () => {
      const mockList = [mockProject(), mockProject({ id: 'proj_2', title: '第二本' })];
      vi.mocked(queries.listProjects).mockResolvedValue(mockList);

      await useProjectStore.getState().loadProjects();

      expect(queries.listProjects).toHaveBeenCalledWith(false);
      expect(useProjectStore.getState().projects).toEqual(mockList);
      expect(useProjectStore.getState().loading).toBe(false);
      expect(useProjectStore.getState().error).toBeNull();
    });

    it('includeArchived=true 应传递参数', async () => {
      vi.mocked(queries.listProjects).mockResolvedValue([]);
      await useProjectStore.getState().loadProjects(true);
      expect(queries.listProjects).toHaveBeenCalledWith(true);
    });

    it('加载失败应设置 error', async () => {
      vi.mocked(queries.listProjects).mockRejectedValue(new Error('DB 错误'));
      await useProjectStore.getState().loadProjects();
      expect(useProjectStore.getState().error).toBe('DB 错误');
      expect(useProjectStore.getState().loading).toBe(false);
    });
  });

  describe('createProject', () => {
    it('应成功创建项目并刷新列表', async () => {
      const newId = 'proj_new_1';
      vi.mocked(queries.createProject).mockResolvedValue(newId);
      vi.mocked(queries.listProjects).mockResolvedValue([mockProject({ id: newId })]);

      const formData = {
        title: '新小说',
        genre: '玄幻' as const,
        summary: '简介',
        targetWords: 200000,
        stylePresetId: 'style-preset-1',
        llmConfig: DEFAULT_LLM_CONFIG,
      };

      const id = await useProjectStore.getState().createProject(formData);

      expect(id).toBe(newId);
      expect(queries.createProject).toHaveBeenCalledWith({
        ...formData,
        status: 'drafting',
      });
      expect(useProjectStore.getState().projects).toHaveLength(1);
    });

    it('创建失败应抛出并设置 error', async () => {
      vi.mocked(queries.createProject).mockRejectedValue(new Error('创建失败'));
      const formData = {
        title: '新小说',
        genre: '玄幻' as const,
        summary: '',
        targetWords: 100000,
        stylePresetId: 'style-preset-1',
        llmConfig: DEFAULT_LLM_CONFIG,
      };
      await expect(useProjectStore.getState().createProject(formData)).rejects.toThrow('创建失败');
      expect(useProjectStore.getState().error).toBe('创建失败');
    });
  });

  describe('updateProject', () => {
    it('应更新并刷新当前项目', async () => {
      const current = mockProject({ id: 'proj_1', title: '原标题' });
      useProjectStore.setState({ currentProject: current });
      vi.mocked(queries.updateProject).mockResolvedValue();
      vi.mocked(queries.listProjects).mockResolvedValue([]);
      vi.mocked(queries.getProject).mockResolvedValue({ ...current, title: '新标题' });

      await useProjectStore.getState().updateProject('proj_1', { title: '新标题' });

      expect(queries.updateProject).toHaveBeenCalledWith('proj_1', { title: '新标题' });
      expect(useProjectStore.getState().currentProject?.title).toBe('新标题');
    });

    it('当前项目不匹配时不应更新 currentProject', async () => {
      useProjectStore.setState({ currentProject: mockProject({ id: 'proj_a' }) });
      vi.mocked(queries.updateProject).mockResolvedValue();
      vi.mocked(queries.listProjects).mockResolvedValue([]);

      await useProjectStore.getState().updateProject('proj_b', { title: '其他' });
      expect(queries.getProject).not.toHaveBeenCalled();
    });
  });

  describe('archiveProject', () => {
    it('应归档项目并刷新列表', async () => {
      vi.mocked(queries.archiveProject).mockResolvedValue();
      vi.mocked(queries.listProjects).mockResolvedValue([]);
      await useProjectStore.getState().archiveProject('proj_1');
      expect(queries.archiveProject).toHaveBeenCalledWith('proj_1');
      expect(queries.listProjects).toHaveBeenCalled();
    });
  });

  describe('deleteProject', () => {
    it('应删除项目并清空 currentProject', async () => {
      useProjectStore.setState({ currentProject: mockProject({ id: 'proj_1' }) });
      vi.mocked(queries.deleteProject).mockResolvedValue();
      vi.mocked(queries.listProjects).mockResolvedValue([]);

      await useProjectStore.getState().deleteProject('proj_1');

      expect(queries.deleteProject).toHaveBeenCalledWith('proj_1');
      expect(useProjectStore.getState().currentProject).toBeNull();
    });

    it('删除非当前项目不应清空 currentProject', async () => {
      const current = mockProject({ id: 'proj_a' });
      useProjectStore.setState({ currentProject: current });
      vi.mocked(queries.deleteProject).mockResolvedValue();
      vi.mocked(queries.listProjects).mockResolvedValue([]);

      await useProjectStore.getState().deleteProject('proj_b');
      expect(useProjectStore.getState().currentProject).toEqual(current);
    });
  });

  describe('setCurrentProject', () => {
    it('应设置当前项目', () => {
      const project = mockProject();
      useProjectStore.getState().setCurrentProject(project);
      expect(useProjectStore.getState().currentProject).toEqual(project);
    });

    it('null 应清空当前项目', () => {
      useProjectStore.setState({ currentProject: mockProject() });
      useProjectStore.getState().setCurrentProject(null);
      expect(useProjectStore.getState().currentProject).toBeNull();
    });
  });

  describe('refreshCurrentProject', () => {
    it('无当前项目时应为 no-op', async () => {
      await useProjectStore.getState().refreshCurrentProject();
      expect(queries.getProject).not.toHaveBeenCalled();
    });

    it('应从 DB 重新读取当前项目', async () => {
      useProjectStore.setState({ currentProject: mockProject({ id: 'proj_1', title: '旧' }) });
      vi.mocked(queries.getProject).mockResolvedValue(mockProject({ id: 'proj_1', title: '新' }));

      await useProjectStore.getState().refreshCurrentProject();

      expect(queries.getProject).toHaveBeenCalledWith('proj_1');
      expect(useProjectStore.getState().currentProject?.title).toBe('新');
    });

    it('项目被删除后应清空 currentProject', async () => {
      useProjectStore.setState({ currentProject: mockProject({ id: 'proj_1' }) });
      vi.mocked(queries.getProject).mockResolvedValue(undefined);

      await useProjectStore.getState().refreshCurrentProject();
      expect(useProjectStore.getState().currentProject).toBeNull();
    });
  });

  describe('clearError', () => {
    it('应清空 error', () => {
      useProjectStore.setState({ error: '某错误' });
      useProjectStore.getState().clearError();
      expect(useProjectStore.getState().error).toBeNull();
    });
  });
});

describe('DEFAULT_LLM_CONFIG', () => {
  it('应使用 DeepSeek 作为默认 provider', () => {
    expect(DEFAULT_LLM_CONFIG.provider).toBe('deepseek');
  });

  it('应有合理的默认温度', () => {
    expect(DEFAULT_LLM_CONFIG.temperature).toBeGreaterThan(0);
    expect(DEFAULT_LLM_CONFIG.temperature).toBeLessThanOrEqual(1);
  });
});
