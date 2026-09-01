import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForeshadowingBoard } from './ForeshadowingBoard';
import * as queries from '@/lib/db/queries';
import * as sonner from 'sonner';
import type { Foreshadowing, ForeshadowingStatus } from '@/types';

vi.mock('@/lib/db/queries', () => ({
  listForeshadowings: vi.fn(),
  saveForeshadowing: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

function mockForeshadowing(overrides: Partial<Foreshadowing> = {}): Foreshadowing {
  return {
    id: 'fh_1',
    projectId: 'proj_1',
    description: '神秘玉佩',
    setupChapter: 1,
    importance: 'high',
    status: 'planted',
    relatedCharacters: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ForeshadowingBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queries.listForeshadowings).mockResolvedValue([]);
    vi.mocked(queries.saveForeshadowing).mockResolvedValue();
  });

  it('渲染四列分组标题', async () => {
    render(<ForeshadowingBoard projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('已铺设')).toBeInTheDocument();
    });
    expect(screen.getByText('待回收')).toBeInTheDocument();
    expect(screen.getByText('已回收')).toBeInTheDocument();
    expect(screen.getByText('已废弃')).toBeInTheDocument();
  });

  it('空列显示暂无', async () => {
    render(<ForeshadowingBoard projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('已铺设')).toBeInTheDocument();
    });
    expect(screen.getAllByText('暂无')).toHaveLength(4);
  });

  it('按状态分组渲染伏笔并显示数量与重要标记', async () => {
    vi.mocked(queries.listForeshadowings).mockResolvedValue([
      mockForeshadowing({ id: 'fh_planted', status: 'planted' }),
      mockForeshadowing({ id: 'fh_pending', status: 'pending', description: '待回收伏笔', importance: 'high' }),
      mockForeshadowing({ id: 'fh_recovered', status: 'recovered', description: '已回收伏笔', importance: 'low' }),
      mockForeshadowing({ id: 'fh_abandoned', status: 'abandoned', description: '已废弃伏笔', importance: 'medium' }),
    ]);
    render(<ForeshadowingBoard projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('神秘玉佩')).toBeInTheDocument();
    });
    expect(screen.getByText('待回收伏笔')).toBeInTheDocument();
    expect(screen.getByText('已回收伏笔')).toBeInTheDocument();
    expect(screen.getByText('已废弃伏笔')).toBeInTheDocument();
    // 数量徽标（每列各有 1 条）
    expect(screen.getAllByText('(1)')).toHaveLength(4);
    // high 重要性显示"重要"
    expect(screen.getAllByText('重要')).toHaveLength(2);
    expect(screen.getByText('中等')).toBeInTheDocument();
  });

  it('点击标记待回收调用 saveForeshadowing 并 toast', async () => {
    vi.mocked(queries.listForeshadowings).mockResolvedValue([
      mockForeshadowing({ id: 'fh_1', status: 'planted' }),
    ]);
    render(<ForeshadowingBoard projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('标记待回收')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('标记待回收'));

    await waitFor(() => {
      expect(queries.saveForeshadowing).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' })
      );
    });
    expect(sonner.toast.success).toHaveBeenCalledWith('伏笔状态已更新');
  });

  it('pending 态提供标记已回收与废弃按钮', async () => {
    vi.mocked(queries.listForeshadowings).mockResolvedValue([
      mockForeshadowing({ id: 'fh_p', status: 'pending' }),
    ]);
    render(<ForeshadowingBoard projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('标记已回收')).toBeInTheDocument();
    });
    expect(screen.getByText('废弃')).toBeInTheDocument();
    fireEvent.click(screen.getByText('标记已回收'));
    await waitFor(() => {
      expect(queries.saveForeshadowing).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'recovered' })
      );
    });
  });

  it('abandoned 态提供恢复按钮', async () => {
    vi.mocked(queries.listForeshadowings).mockResolvedValue([
      mockForeshadowing({ id: 'fh_a', status: 'abandoned' }),
    ]);
    render(<ForeshadowingBoard projectId="proj_1" />);
    await waitFor(() => {
      expect(screen.getByText('恢复')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('恢复'));
    await waitFor(() => {
      expect(queries.saveForeshadowing).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'planted' })
      );
    });
  });

  it('加载期间不渲染内容', async () => {
    let resolve!: (v: Foreshadowing[]) => void;
    vi.mocked(queries.listForeshadowings).mockReturnValue(
      new Promise((r) => { resolve = r; })
    );
    render(<ForeshadowingBoard projectId="proj_1" />);
    expect(screen.queryByText('已铺设')).not.toBeInTheDocument();
    resolve([mockForeshadowing({ status: 'planted' })]);
    await waitFor(() => {
      expect(screen.getByText('已铺设')).toBeInTheDocument();
    });
  });
});