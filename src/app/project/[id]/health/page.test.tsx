// ============================================================================
// 健康体检页面测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HealthPage from './page';

const mockRun = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'p1' }),
}));
vi.mock('@/lib/health/health-check', async () => {
  const actual = await vi.importActual<typeof import('@/lib/health/health-check')>(
    '@/lib/health/health-check'
  );
  return { ...actual, runHealthCheck: mockRun };
});

describe('HealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应展示健康项目的指标与通过状态', async () => {
    mockRun.mockResolvedValue({
      projectId: 'p1',
      generatedAt: Date.now(),
      summary: '《问剑》主线进度约 50%。共 30 章 / 75,000 字。',
      metrics: {
        totalWords: 75000,
        totalChapters: 30,
        completedChapters: 30,
        plannedChapters: 60,
        mainlineProgress: 50,
        foreshadowingBacklog: 0,
        overdrawnForeshadowings: 0,
        inactiveMainCharacters: 0,
        avgWordsPerChapter: 2500,
      },
      issues: [],
    });

    render(<HealthPage />);
    await waitFor(() => expect(screen.getByText('整体健康')).toBeInTheDocument());
    expect(screen.getByText('主线进度')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('75,000')).toBeInTheDocument();
  });

  it('应展示问题列表与严重级别', async () => {
    mockRun.mockResolvedValue({
      projectId: 'p1',
      generatedAt: Date.now(),
      summary: '《问剑》共 30 章。',
      metrics: {
        totalWords: 1000,
        totalChapters: 30,
        completedChapters: 30,
        plannedChapters: 60,
        mainlineProgress: 50,
        foreshadowingBacklog: 1,
        overdrawnForeshadowings: 1,
        inactiveMainCharacters: 1,
        avgWordsPerChapter: 33,
      },
      issues: [
        {
          dimension: 'foreshadowing',
          severity: 'warning',
          title: '伏笔超期未回收',
          detail: '某关键线索超期',
          suggestion: '尽快回收',
        },
        {
          dimension: 'mainline',
          severity: 'error',
          title: '缺少大纲规划',
          detail: '尚未创建大纲',
          suggestion: '先规划大纲',
        },
      ],
    });

    render(<HealthPage />);
    await waitFor(() => expect(screen.getByText('伏笔超期未回收')).toBeInTheDocument());
    expect(screen.getByText('缺少大纲规划')).toBeInTheDocument();
    expect(screen.getByText('2 项待关注')).toBeInTheDocument();
    expect(screen.getByText(/建议：尽快回收/)).toBeInTheDocument();
  });

  it('应能重新体检', async () => {
    mockRun.mockResolvedValue({
      projectId: 'p1',
      generatedAt: Date.now(),
      summary: 'ok',
      metrics: {
        totalWords: 0,
        totalChapters: 0,
        completedChapters: 0,
        plannedChapters: null,
        mainlineProgress: null,
        foreshadowingBacklog: 0,
        overdrawnForeshadowings: 0,
        inactiveMainCharacters: 0,
        avgWordsPerChapter: 0,
      },
      issues: [],
    });
    render(<HealthPage />);
    await waitFor(() => expect(screen.getByText('整体健康')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /重新体检/ })).toBeInTheDocument();
  });
});