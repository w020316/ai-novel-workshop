import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryEditor } from './MemoryEditor';
import * as queries from '@/lib/db/queries';
import * as sonner from 'sonner';
import type { ChapterSummary, Foreshadowing } from '@/types';

vi.mock('@/lib/db/queries', () => ({
  listChapterSummaries: vi.fn(),
  saveChapterSummary: vi.fn(),
  listForeshadowings: vi.fn(),
  saveForeshadowing: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

function mockSummary(overrides: Partial<ChapterSummary> = {}): ChapterSummary {
  return {
    id: 'sum_1',
    projectId: 'proj_1',
    chapterId: 'ch_1',
    chapterNo: 1,
    volumeNo: 1,
    summary: '摘要内容',
    keyEvents: [],
    characterStates: {},
    embedding: new Float32Array(4),
    createdAt: Date.now(),
    ...overrides,
  };
}

function mockForeshadowing(overrides: Partial<Foreshadowing> = {}): Foreshadowing {
  return {
    id: 'fh_1',
    projectId: 'proj_1',
    description: '伏笔内容',
    setupChapter: 2,
    importance: 'medium',
    status: 'pending',
    relatedCharacters: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('MemoryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queries.listChapterSummaries).mockResolvedValue([]);
    vi.mocked(queries.listForeshadowings).mockResolvedValue([]);
    vi.mocked(queries.saveChapterSummary).mockResolvedValue();
    vi.mocked(queries.saveForeshadowing).mockResolvedValue();
  });

  it('默认显示章节摘要 tab，空数据时提示', async () => {
    render(<MemoryEditor projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('章节摘要')).toBeInTheDocument();
    });
    expect(screen.getByText('暂无章节摘要')).toBeInTheDocument();
  });

  it('渲染章节摘要列表', async () => {
    vi.mocked(queries.listChapterSummaries).mockResolvedValue([mockSummary()]);
    render(<MemoryEditor projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('摘要内容')).toBeInTheDocument();
    });
    expect(screen.getByText('第 1 章')).toBeInTheDocument();
  });

  it('编辑章节摘要并保存调用 saveChapterSummary 与 toast', async () => {
    const summary = mockSummary();
    vi.mocked(queries.listChapterSummaries).mockResolvedValue([summary]);
    render(<MemoryEditor projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('摘要内容')).toBeInTheDocument();
    });

    // 点击编辑图标（无文本按钮）进入编辑态
    const editBtn = screen.getAllByRole('button').find((b) => b.textContent === '');
    fireEvent.click(editBtn!);

    fireEvent.change(await screen.findByDisplayValue('摘要内容'), { target: { value: '新摘要' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(queries.saveChapterSummary).toHaveBeenCalledWith(
        expect.objectContaining({ id: summary.id, summary: '新摘要' })
      );
    });
    expect(sonner.toast.success).toHaveBeenCalledWith('章节摘要已更新');
  });

  it('切换伏笔编辑 tab 并渲染伏笔', async () => {
    vi.mocked(queries.listForeshadowings).mockResolvedValue([mockForeshadowing()]);
    render(<MemoryEditor projectId="proj_1" />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('章节摘要');
    });
    fireEvent.click(screen.getByText('伏笔编辑'));
    expect(await screen.findByText('伏笔内容')).toBeInTheDocument();
    expect(screen.getByText('第2章铺设')).toBeInTheDocument();
    expect(screen.getByText(/待回收/)).toBeInTheDocument();
  });

  it('编辑伏笔并保存调用 saveForeshadowing', async () => {
    const fh = mockForeshadowing();
    vi.mocked(queries.listForeshadowings).mockResolvedValue([fh]);
    render(<MemoryEditor projectId="proj_1" />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('章节摘要');
    });
    fireEvent.click(screen.getByText('伏笔编辑'));
    await screen.findByText('伏笔内容');

    const editBtn = screen.getAllByRole('button').find((b) => b.textContent === '');
    fireEvent.click(editBtn!);

    fireEvent.change(await screen.findByDisplayValue('伏笔内容'), { target: { value: '新伏笔' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(queries.saveForeshadowing).toHaveBeenCalledWith(
        expect.objectContaining({ id: fh.id, description: '新伏笔' })
      );
    });
    expect(sonner.toast.success).toHaveBeenCalledWith('伏笔已更新');
  });

  it('伏笔 tab 空数据时提示', async () => {
    render(<MemoryEditor projectId="proj_1" />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('章节摘要');
    });
    fireEvent.click(screen.getByText('伏笔编辑'));
    expect(await screen.findByText('暂无伏笔')).toBeInTheDocument();
  });
});