// ============================================================================
// TXT 导出测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { exportTxt } from './txt';
import type { NovelProject, Chapter } from '@/types';

const mockProject: NovelProject = {
  id: 'proj-1', title: '测试小说', genre: '玄幻', summary: '一个测试故事',
  targetWords: 100000, stylePresetId: '', llmConfig: { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.8, topP: 0.9, maxTokens: 4096 },
  status: 'drafting', currentVolume: 1, currentChapter: 0, createdAt: 0, updatedAt: 0,
};

const mockChapters: Chapter[] = [
  { id: 'ch1', projectId: 'proj-1', volumeNo: 1, chapterNo: 1, title: '第一章', plotPoints: [], content: '这是第一章的内容。', wordCount: 8, status: 'completed', createdAt: 0, updatedAt: 0 },
  { id: 'ch2', projectId: 'proj-1', volumeNo: 1, chapterNo: 2, title: '第二章', plotPoints: [], content: '这是第二章的内容。', wordCount: 8, status: 'completed', createdAt: 0, updatedAt: 0 },
  { id: 'ch3', projectId: 'proj-1', volumeNo: 1, chapterNo: 3, title: '第三章', plotPoints: [], content: '', wordCount: 0, status: 'pending', createdAt: 0, updatedAt: 0 },
];

describe('exportTxt', () => {
  it('应包含项目标题', () => {
    const result = exportTxt({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('测试小说');
  });

  it('应只包含已完成的章节', () => {
    const result = exportTxt({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('第一章');
    expect(result).toContain('第二章');
    expect(result).not.toContain('第三章');
  });

  it('应包含章节内容', () => {
    const result = exportTxt({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('这是第一章的内容。');
  });

  it('应包含统计信息', () => {
    const result = exportTxt({ project: mockProject, chapters: mockChapters });
    expect(result).toContain('玄幻');
    expect(result).toContain('16'); // 总字数 8+8
  });
});