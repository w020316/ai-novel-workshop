import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { WorldviewGenerator } from './WorldviewGenerator';
import type { Worldview } from '@/types';

const {
  getWorldviewMock,
  saveWorldviewMock,
  generateTemplateMock,
  isWorldviewEmptyMock,
  toastMock,
} = vi.hoisted(() => ({
  getWorldviewMock: vi.fn(),
  saveWorldviewMock: vi.fn(),
  generateTemplateMock: vi.fn(),
  isWorldviewEmptyMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/db/queries', () => ({
  getWorldview: (id: string) => getWorldviewMock(id),
  saveWorldview: (wv: Worldview) => saveWorldviewMock(wv),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/worldview/template', () => ({
  generateWorldviewTemplate: (args: unknown) => generateTemplateMock(args),
  isWorldviewEmpty: (wv: Worldview | null) => isWorldviewEmptyMock(wv),
}));

const baseProps = {
  projectId: 'p1',
  genre: '玄幻' as const,
  title: '星河黎明',
  summary: '一个关于星辰的故事',
};

const existingFixture: Worldview = {
  id: 'existing',
  projectId: 'p1',
  worldStructure: '已有的世界观内容',
  powerSystem: '',
  geography: '',
  era: '',
  factions: '',
  rules: [],
  locked: false,
  updatedAt: 1,
};

describe('WorldviewGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：无已有内容 → getWorldview 返回 null 且视为空（isWorldviewEmpty=true）
    getWorldviewMock.mockResolvedValue(null);
    saveWorldviewMock.mockResolvedValue(undefined);
    isWorldviewEmptyMock.mockReturnValue(true);
    generateTemplateMock.mockReturnValue({ ...existingFixture, id: 'wv_new' });
  });

  it('渲染题材、项目名与简介信息', () => {
    render(<WorldviewGenerator {...baseProps} />);
    expect(screen.getByText('AI 一键生成')).toBeInTheDocument();
    expect(screen.getByText('玄幻')).toBeInTheDocument();
    expect(screen.getByText('星河黎明')).toBeInTheDocument();
    expect(screen.getByText('一个关于星辰的故事')).toBeInTheDocument();
  });

  it('无已有世界观时一键生成并保存、回调 onGenerated', async () => {
    const onGenerated = vi.fn();
    render(<WorldviewGenerator {...baseProps} onGenerated={onGenerated} />);

    fireEvent.click(screen.getByRole('button', { name: '一键生成世界观' }));

    await waitFor(() => expect(generateTemplateMock).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(generateTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', genre: '玄幻', title: '星河黎明' })
    );
    await waitFor(() => expect(saveWorldviewMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(toastMock.success).toHaveBeenCalledWith(
      '世界观已生成',
      expect.any(Object)
    );
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('存在已有内容时弹出覆盖确认，取消后不保存', async () => {
    // 已有非空内容 → isWorldviewEmpty 返回 false（非空）
    getWorldviewMock.mockResolvedValue(existingFixture);
    isWorldviewEmptyMock.mockReturnValue(false);
    const onGenerated = vi.fn();
    render(<WorldviewGenerator {...baseProps} onGenerated={onGenerated} />);

    fireEvent.click(screen.getByRole('button', { name: '一键生成世界观' }));

    // 覆盖确认弹窗在 getWorldview 解析后即时展示（无需等待 600ms 定时器）
    expect(
      await screen.findByText('检测到已有世界观内容，确定要覆盖吗？')
    ).toBeInTheDocument();
    expect(saveWorldviewMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onGenerated).not.toHaveBeenCalled();
    // 已检测到内容，主按钮变为「重新生成」
    expect(
      await screen.findByRole('button', { name: '重新生成' })
    ).toBeInTheDocument();
  });

  it('确认覆盖后执行覆盖保存并保留已有 id 与锁定状态', async () => {
    getWorldviewMock.mockResolvedValue({ ...existingFixture, locked: true });
    isWorldviewEmptyMock.mockReturnValue(false);
    render(<WorldviewGenerator {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '一键生成世界观' }));
    await screen.findByText('检测到已有世界观内容，确定要覆盖吗？');

    fireEvent.click(screen.getByRole('button', { name: '确认覆盖' }));

    await waitFor(() => expect(saveWorldviewMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(saveWorldviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing', locked: true })
    );
    expect(toastMock.success).toHaveBeenCalledWith(
      '世界观已生成',
      expect.any(Object)
    );
  });

  it('生成失败时展示错误 toast', async () => {
    saveWorldviewMock.mockRejectedValue(new Error('写入失败'));
    render(<WorldviewGenerator {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '一键生成世界观' }));

    await waitFor(
      () =>
        expect(toastMock.error).toHaveBeenCalledWith(
          '生成失败',
          expect.any(Object)
        ),
      { timeout: 3000 }
    );
  });
});