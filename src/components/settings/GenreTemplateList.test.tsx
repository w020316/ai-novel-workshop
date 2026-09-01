import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GenreTemplateList } from './GenreTemplateList';
import type { GenreTemplate } from '@/types';

const { listGenreTemplatesMock, toastMock } = vi.hoisted(() => ({
  listGenreTemplatesMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/db/queries', () => ({
  listGenreTemplates: () => listGenreTemplatesMock(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

// 与 fixture 顺序一致的种子（variant 由 template 在列表中的 index 决定）
vi.mock('@/lib/db/seed', () => ({
  GENRE_TEMPLATE_SEEDS: [
    { variant: '传统修真' },
    { variant: '霸总甜宠' },
  ],
}));

const t1: GenreTemplate = {
  id: 'g1',
  genre: '玄幻',
  pacingRule: '前30章慢热铺世界观',
  highlightDesign: '境界突破',
  readerPreference: '爽感优先',
  typicalArcs: ['废柴逆袭', '血脉觉醒'],
};

const t2: GenreTemplate = {
  id: 'g2',
  genre: '言情',
  pacingRule: '情感线为主轴每章小高潮',
  highlightDesign: '甜蜜互动',
  readerPreference: '细腻温情',
  typicalArcs: ['霸总娇妻'],
};

describe('GenreTemplateList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listGenreTemplatesMock.mockResolvedValue([t1, t2]);
  });

  it('加载完成后渲染模板卡片与变体名、计数', async () => {
    render(<GenreTemplateList currentGenre="玄幻" />);
    // 默认按当前题材过滤仅显示玄幻模板
    expect(await screen.findByText('传统修真')).toBeInTheDocument();
    expect(screen.getByText(/共 2 个题材模板/)).toBeInTheDocument();
    expect(screen.getByText(/当前显示 1 个/)).toBeInTheDocument();
    expect(screen.getByText('废柴逆袭')).toBeInTheDocument();

    // 切到全部后可看到言情模板的变体名
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(await screen.findByText('霸总甜宠')).toBeInTheDocument();
    expect(screen.getByText(/当前显示 2 个/)).toBeInTheDocument();
  });

  it('默认按当前题材过滤，并能切换到全部', async () => {
    render(<GenreTemplateList currentGenre="玄幻" />);
    // 默认只显示玄幻模板
    await screen.findByText('传统修真');
    expect(screen.queryByText('霸总甜宠')).not.toBeInTheDocument();
    expect(screen.getByText(/当前显示 1 个/)).toBeInTheDocument();

    // 点击"全部"显示两条
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    await waitFor(() => expect(screen.getByText('霸总甜宠')).toBeInTheDocument());
    expect(screen.getByText(/当前显示 2 个/)).toBeInTheDocument();
  });

  it('按题材按钮筛选', async () => {
    render(<GenreTemplateList currentGenre="玄幻" />);
    await screen.findByText('传统修真');

    fireEvent.click(screen.getByRole('button', { name: '言情' }));
    await waitFor(() => expect(screen.getByText('霸总甜宠')).toBeInTheDocument());
    expect(screen.queryByText('传统修真')).not.toBeInTheDocument();
  });

  it('关键词搜索过滤模板', async () => {
    render(<GenreTemplateList currentGenre="玄幻" />);
    await screen.findByText('传统修真');
    // 先切到全部，避免题材过滤干扰关键词验证
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    await waitFor(() => expect(screen.getByText('霸总甜宠')).toBeInTheDocument());

    const search = screen.getByPlaceholderText('搜索节奏、爽点、读者偏好或典型弧线…');
    fireEvent.change(search, { target: { value: '情感' } });
    await waitFor(() => expect(screen.queryByText('传统修真')).not.toBeInTheDocument());
    expect(screen.getByText('霸总甜宠')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '不存在的词' } });
    await waitFor(() =>
      expect(screen.getByText('无匹配结果，试试调整关键词或题材筛选')).toBeInTheDocument()
    );
  });

  it('选择模板调用 onSelect 并显示已选择状态', async () => {
    const onSelect = vi.fn();
    render(<GenreTemplateList currentGenre="玄幻" onSelect={onSelect} />);
    await screen.findByText('传统修真');

    fireEvent.click(screen.getByRole('button', { name: '应用此模板' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(t1));
    expect(await screen.findByRole('button', { name: '已选择' })).toBeInTheDocument();
  });

  it('匹配当前项目的题材显示标签', async () => {
    render(<GenreTemplateList currentGenre="玄幻" />);
    await screen.findByText('传统修真');
    expect(screen.getByText('匹配当前项目')).toBeInTheDocument();
  });

  it('未提供 onSelect 时不渲染应用按钮', async () => {
    render(<GenreTemplateList currentGenre="玄幻" />);
    await screen.findByText('传统修真');
    expect(screen.queryByRole('button', { name: '应用此模板' })).not.toBeInTheDocument();
  });

  it('加载失败时弹出错误 toast', async () => {
    listGenreTemplatesMock.mockRejectedValue(new Error('读取失败'));
    render(<GenreTemplateList currentGenre="玄幻" />);
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('加载题材模板失败', expect.any(Object))
    );
  });
});