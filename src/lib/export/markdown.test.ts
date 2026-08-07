// ============================================================================
// Markdown 导出测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { exportMarkdown } from './markdown';
import type { NovelProject, Chapter } from '@/types';

const mockProject: NovelProject = {
  id: 'proj-1', title: '测试小说', genre: '玄幻', summary: '一个测试故事',
  targetWords: 100000, stylePresetId: '', llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
  status: 'drafting', currentVolume: 1, currentChapter: 0, createdAt: 0, updatedAt: 0,
};

const mockChapters: Chapter[] = [
  { id: 'ch1', projectId: 'proj-1', volumeNo: 1, chapterNo: 1, title: '第一章', plotPoints: [], content: '内容一', wordCount: 3, status: 'completed', createdAt: 0, updatedAt: 0 },
  { id: 'ch2', projectId: 'proj-1', volumeNo: 1, chapterNo: 2, title: '第二章', plotPoints: [], content: '内容二', wordCount: 3, status: 'completed', createdAt: 0, updatedAt: 0 },
];

describe('exportMarkdown', () => {
  it('应包含 Markdown 标题', () => {
    const result = exportMarkdown({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('# 测试小说');
  });

  it('应包含目录', () => {
    const result = exportMarkdown({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('## 目录');
    expect(result).toContain('[第1章 第一章]');
  });

  it('应包含章节正文', () => {
    const result = exportMarkdown({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('## 第1章 第一章');
    expect(result).toContain('内容一');
  });

  it('应包含元数据', () => {
    const result = exportMarkdown({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('**题材**：玄幻');
  });
});