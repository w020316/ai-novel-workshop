// ============================================================================
// 项目状态管理（Zustand）
// 依据：spec P1.1
// ============================================================================
import { create } from 'zustand';
import * as queries from '@/lib/db/queries';
import type { NovelProject, LLMConfig, Genre } from '@/types';

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  temperature: 0.8,
  topP: 0.9,
  maxTokens: 4096,
};

export interface ProjectFormData {
  title: string;
  genre: Genre;
  summary: string;
  targetWords: number;
  /** 每章目标字数；缺省按 2500 估算 */
  chapterWords?: number;
  /** 用户指定的目标卷数；缺省按目标字数自动推算（合法范围 1-20） */
  volumeCount?: number;
  stylePresetId: string;
  llmConfig: LLMConfig;
}

interface ProjectState {
  projects: NovelProject[];
  currentProject: NovelProject | null;
  loading: boolean;
  error: string | null;

  loadProjects: (includeArchived?: boolean) => Promise<void>;
  createProject: (data: ProjectFormData) => Promise<string>;
  updateProject: (id: string, patch: Partial<NovelProject>) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  /** 删除项目（软删除，移入回收站，可恢复） */
  deleteProject: (id: string) => Promise<void>;
  /** 从回收站恢复项目 */
  restoreProject: (id: string) => Promise<void>;
  /** 彻底删除项目（级联清除所有关联数据，不可恢复） */
  purgeProject: (id: string) => Promise<void>;
  setCurrentProject: (project: NovelProject | null) => void;
  refreshCurrentProject: () => Promise<void>;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,

  loadProjects: async (includeArchived = false) => {
    set({ loading: true, error: null });
    try {
      const projects = await queries.listProjects(includeArchived);
      set({ projects, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '加载项目列表失败',
      });
    }
  },

  createProject: async (data) => {
    set({ loading: true, error: null });
    try {
      const id = await queries.createProject({
        ...data,
        status: 'drafting',
      });
      await get().loadProjects();
      set({ loading: false });
      return id;
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '创建项目失败',
      });
      throw e;
    }
  },

  updateProject: async (id, patch) => {
    set({ loading: true, error: null });
    try {
      await queries.updateProject(id, patch);
      await get().loadProjects();
      if (get().currentProject?.id === id) {
        const updated = await queries.getProject(id);
        set({ currentProject: updated ?? null });
      }
      set({ loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '更新项目失败',
      });
      throw e;
    }
  },

  archiveProject: async (id) => {
    set({ loading: true, error: null });
    try {
      await queries.archiveProject(id);
      await get().loadProjects();
      set({ loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '归档项目失败',
      });
      throw e;
    }
  },

  deleteProject: async (id) => {
    set({ loading: true, error: null });
    try {
      // 软删除：仅移入回收站，保留全部数据以便恢复
      await queries.softDeleteProject(id);
      await get().loadProjects();
      if (get().currentProject?.id === id) {
        set({ currentProject: null });
      }
      set({ loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '删除项目失败',
      });
      throw e;
    }
  },

  restoreProject: async (id) => {
    set({ loading: true, error: null });
    try {
      await queries.restoreProject(id);
      await get().loadProjects();
      set({ loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '恢复项目失败',
      });
      throw e;
    }
  },

  purgeProject: async (id) => {
    set({ loading: true, error: null });
    try {
      // 彻底删除：级联清除所有关联数据，不可恢复
      await queries.purgeProject(id);
      await get().loadProjects();
      if (get().currentProject?.id === id) {
        set({ currentProject: null });
      }
      set({ loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '彻底删除项目失败',
      });
      throw e;
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  refreshCurrentProject: async () => {
    const { currentProject } = get();
    if (!currentProject) return;
    set({ loading: true, error: null });
    try {
      const refreshed = await queries.getProject(currentProject.id);
      set({ currentProject: refreshed ?? null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '刷新项目失败' });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
