import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChapterList } from './ChapterList';
import type { Chapter, ChapterStatus } from '@/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function mockChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch_1',
    projectId: 'proj_1',
    volumeNo: 1,
    chapterNo: 1,
    title: '第一章',
    plotPoints: [],
    content: '',
    wordCount: 0,
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('ChapterList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无章节时显示空状态', () => {
    render(<ChapterList chapters={[]} projectId="proj_1" />);
    expect(screen.getByText('还没有任何章节')).toBeInTheDocument();
    expect(screen.getByText(/点击.*新建章节.*开始创作/)).toBeInTheDocument();
  });

  it('渲染章节列表并显示状态徽章', () => {
    const chapters = [
      mockChapter({ title: '引子', chapterNo: 1, status: 'completed' }),
      mockChapter({ id: 'ch_2', title: '第二章', chapterNo: 2, status: 'drafting' }),
    ];
    render(<ChapterList chapters={chapters} projectId="proj_1" />);
    expect(screen.getByText('引子')).toBeInTheDocument();
    expect(screen.getByText('第二章')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('撰写中')).toBeInTheDocument();
  });

  it('点击章节卡片跳转到对应路由', () => {
    const chapters = [mockChapter({ chapterNo: 3 })];
    render(<ChapterList chapters={chapters} projectId="proj_9" />);
    fireEvent.click(screen.getByText('第一章'));
    expect(push).toHaveBeenCalledWith('/project/proj_9/workbench/chapter/3');
  });

  it('显示章节字数统计', () => {
    const chapters = [mockChapter({ wordCount: 1234 })];
    render(<ChapterList chapters={chapters} projectId="proj_1" />);
    expect(screen.getByText(/1,234 字/)).toBeInTheDocument();
  });

  it('有内容时显示内容预览', () => {
    const chapters = [mockChapter({ content: '这是第一章的内容段落' })];
    render(<ChapterList chapters={chapters} projectId="proj_1" />);
    expect(screen.getByText(/这是第一章的内容段落/)).toBeInTheDocument();
  });

  it('分页：多页时显示页码并切换', () => {
    const chapters = Array.from({ length: 12 }, (_, i) =>
      mockChapter({ id: `ch_${i}`, chapterNo: i + 1, title: `第${i + 1}章` })
    );
    render(<ChapterList chapters={chapters} projectId="proj_1" pageSize={10} />);
    // 第一页显示 1-10
    expect(screen.getByText('第1章')).toBeInTheDocument();
    expect(screen.getByText('第10章')).toBeInTheDocument();
    expect(screen.queryByText('第11章')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // 第一页时上一页按钮禁用
    const prev = screen.getAllByRole('button')[0];
    expect(prev).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button')[1]); // 下一页
    expect(screen.getByText('第11章')).toBeInTheDocument();
    expect(screen.getByText('第12章')).toBeInTheDocument();
    expect(screen.queryByText('第1章')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});