import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectCard } from './project-card';
import type { NovelProject } from '@/types';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const baseProject: NovelProject = {
  id: 'p1',
  title: '星河黎明',
  genre: '玄幻',
  summary: '一个关于星辰与成长的故事',
  targetWords: 300000,
  stylePresetId: 'sp1',
  llmConfig: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    temperature: 0.8,
    topP: 0.9,
    maxTokens: 4096,
  },
  status: 'ongoing',
  currentVolume: 1,
  currentChapter: 1,
  createdAt: 1,
  updatedAt: 1600000000000,
};

const stats = { totalWords: 150000, totalChapters: 5, completedChapters: 2 };

describe('ProjectCard', () => {
  it('渲染项目标题、题材、状态与统计信息', () => {
    render(<ProjectCard project={baseProject} stats={stats} />);
    expect(screen.getByRole('link', { name: '星河黎明' })).toHaveAttribute(
      'href',
      '/project/p1'
    );
    expect(screen.getByText('玄幻')).toBeInTheDocument();
    expect(screen.getByText('连载中')).toBeInTheDocument();
    expect(screen.getByText('150,000 字')).toBeInTheDocument();
    expect(screen.getByText('目标 300,000 字')).toBeInTheDocument();
    expect(screen.getByText('2 章已完结 / 5 章')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
  });

  it('无简介时展示默认文案', () => {
    const p = { ...baseProject, summary: '' };
    render(<ProjectCard project={p} stats={stats} />);
    expect(screen.getByText('暂无简介')).toBeInTheDocument();
  });

  it('targetWords 为 0 时进度为 0', () => {
    const p = { ...baseProject, targetWords: 0 };
    render(<ProjectCard project={p} stats={stats} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('点击归档按钮触发 onArchive', () => {
    const onArchive = vi.fn();
    render(<ProjectCard project={baseProject} stats={stats} onArchive={onArchive} />);
    fireEvent.click(screen.getByRole('button', { name: '归档' }));
    expect(onArchive).toHaveBeenCalledWith('p1');
  });

  it('已归档项目不显示归档按钮', () => {
    const p = { ...baseProject, status: 'archived' as const };
    render(<ProjectCard project={p} stats={stats} onArchive={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument();
  });

  it('未提供 onArchive 时不显示归档按钮', () => {
    render(<ProjectCard project={baseProject} stats={stats} />);
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument();
  });
});