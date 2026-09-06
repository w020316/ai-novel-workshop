import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { WorldviewEditor } from './WorldviewEditor';
import type { Worldview } from '@/types';

const {
  getWorldviewMock,
  saveWorldviewMock,
  markChapterNeedsRecheckMock,
  toastMock,
  refineWorldviewWithSummaryMock,
} = vi.hoisted(() => ({
  getWorldviewMock: vi.fn(),
  saveWorldviewMock: vi.fn(),
  markChapterNeedsRecheckMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  refineWorldviewWithSummaryMock: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  getWorldview: (id: string) => getWorldviewMock(id),
  saveWorldview: (wv: Worldview) => saveWorldviewMock(wv),
  markChapterNeedsRecheck: (id: string) => markChapterNeedsRecheckMock(id),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/llm/generators/worldview', () => ({
  refineWorldviewWithSummary: (args: unknown) => refineWorldviewWithSummaryMock(args),
}));

vi.mock('@/lib/worldview/template', () => ({
  normalizeRules: (rules: string[]) => rules,
  parseRulesInput: (s: string) =>
    s.split(/\r?\n+/).map((x) => x.trim()).filter((x) => x.length > 0),
  generateWorldviewTemplate: () => ({
    worldStructure: '模板世界架构',
    powerSystem: '模板力量体系',
    geography: '模板地理',
    era: '模板时代',
    factions: '模板势力',
    rules: ['模板规则一', '模板规则二', '模板规则三'],
  }),
}));

const wvFixture: Worldview = {
  id: 'wv1',
  projectId: 'p1',
  worldStructure: '这是一个足够长的世界架构与运行法则的描述',
  powerSystem: '',
  geography: '',
  era: '',
  factions: '',
  rules: [],
  locked: false,
  updatedAt: 1600000000000,
};

const worldStructurePlaceholder = '描述世界的整体结构与运行法则…';

describe('WorldviewEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveWorldviewMock.mockResolvedValue(undefined);
    getWorldviewMock.mockResolvedValue(null);
  });

  it('加载完成后渲染表单与锁定状态', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    render(<WorldviewEditor projectId="p1" />);
    expect(screen.getByText('加载世界观…')).toBeInTheDocument();

    const label = await screen.findByText('世界架构');
    expect(label).toBeInTheDocument();
    expect(screen.getByText('未锁定')).toBeInTheDocument();
    expect(screen.getByText('0 条规则', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('更新于', { exact: false })).toBeInTheDocument();
    // 无修改时保存按钮禁用
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('编辑字段后保存按钮可用并调用 saveWorldview', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    render(<WorldviewEditor projectId="p1" />);
    const textarea = await screen.findByPlaceholderText(worldStructurePlaceholder);
    fireEvent.change(textarea, {
      target: { value: '这是一个被编辑后的更长的新世界架构描述内容' },
    });

    const saveBtn = screen.getByRole('button', { name: '保存' });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(saveWorldviewMock).toHaveBeenCalledTimes(1));
    expect(saveWorldviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wv1',
        worldStructure: '这是一个被编辑后的更长的新世界架构描述内容',
      })
    );
    expect(toastMock.success).toHaveBeenCalledWith('世界观已保存');
  });

  it('世界架构为空时保存抛出必填错误', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    render(<WorldviewEditor projectId="p1" />);
    const textarea = await screen.findByPlaceholderText(worldStructurePlaceholder);
    // 清空以触发脏状态 + 空值校验
    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('世界架构为必填项')
    );
    expect(saveWorldviewMock).not.toHaveBeenCalled();
  });

  it('通过回车添加核心规则并显示', async () => {
    render(<WorldviewEditor projectId="p1" />);
    const input = await screen.findByPlaceholderText(/输入一条规则，或一次粘贴多行/);
    fireEvent.change(input, { target: { value: '凡人不可飞升' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('凡人不可飞升')).toBeInTheDocument();
    expect(screen.getByText('1 条规则', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('有未保存的修改')).toBeInTheDocument();
  });

  it('重复规则会给出警告', async () => {
    getWorldviewMock.mockResolvedValue({ ...wvFixture, rules: ['凡人不可飞升'] });
    render(<WorldviewEditor projectId="p1" />);
    const input = await screen.findByPlaceholderText(/输入一条规则，或一次粘贴多行/);
    fireEvent.change(input, { target: { value: '凡人不可飞升' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith('这些规则已存在'));
  });

  it('一次粘贴多行会拆分为多条规则', async () => {
    render(<WorldviewEditor projectId="p1" />);
    const input = await screen.findByPlaceholderText(/输入一条规则，或一次粘贴多行/);
    fireEvent.change(input, { target: { value: '规则一\n规则二\n规则三' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('规则一')).toBeInTheDocument();
    expect(screen.getByText('规则二')).toBeInTheDocument();
    expect(screen.getByText('规则三')).toBeInTheDocument();
    expect(screen.getByText('3 条规则', { exact: false })).toBeInTheDocument();
  });

  it('从题材模板填充空白设定与规则', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WorldviewEditor projectId="p1" genre="玄幻" />);
    fireEvent.click(await screen.findByRole('button', { name: /从题材模板填充/ }));

    expect(screen.getByDisplayValue('模板世界架构')).toBeInTheDocument();
    expect(screen.getByText('模板规则一')).toBeInTheDocument();
    expect(screen.getByText('3 条规则', { exact: false })).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('删除已添加的规则', async () => {
    getWorldviewMock.mockResolvedValue({ ...wvFixture, rules: ['规则A', '规则B'] });
    render(<WorldviewEditor projectId="p1" />);
    const ruleA = await screen.findByText('规则A');
    expect(ruleA).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText('删除规则')[0]);
    expect(screen.queryByText('规则A')).not.toBeInTheDocument();
    expect(screen.getByText('规则B')).toBeInTheDocument();
    expect(screen.getByText('有未保存的修改')).toBeInTheDocument();
  });

  it('已锁定世界观:字段禁用、显示锁定提示、保存禁用', async () => {
    getWorldviewMock.mockResolvedValue({ ...wvFixture, locked: true });
    render(<WorldviewEditor projectId="p1" />);
    const textarea = await screen.findByPlaceholderText(worldStructurePlaceholder);
    expect(screen.getByText('已锁定')).toBeInTheDocument();
    expect(screen.getByText('世界观已锁定')).toBeInTheDocument();
    expect(textarea).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '解锁' })).toBeEnabled();
  });

  it('点击解锁将保存锁定状态为 false', async () => {
    getWorldviewMock.mockResolvedValue({ ...wvFixture, locked: true });
    render(<WorldviewEditor projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '解锁' }));

    await waitFor(() => expect(saveWorldviewMock).toHaveBeenCalledTimes(1));
    expect(saveWorldviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ locked: false, rules: [] })
    );
    expect(toastMock.success).toHaveBeenCalledWith('世界观已解锁', expect.any(Object));
  });

  it('点击锁定将保存锁定状态为 true', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    render(<WorldviewEditor projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: '锁定' }));

    await waitFor(() => expect(saveWorldviewMock).toHaveBeenCalledTimes(1));
    expect(saveWorldviewMock).toHaveBeenCalledWith(expect.objectContaining({ locked: true }));
    expect(toastMock.success).toHaveBeenCalledWith('世界观已锁定', expect.any(Object));
  });

  it('无简介时不展示「按简介完善世界观」入口', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    render(<WorldviewEditor projectId="p1" genre="玄幻" />);
    await screen.findByRole('button', { name: /从题材模板填充/ });
    expect(screen.queryByRole('button', { name: /按简介完善世界观/ })).not.toBeInTheDocument();
  });

  it('按简介完善世界观：结果填入表单且不直接保存（需用户确认）', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    refineWorldviewWithSummaryMock.mockResolvedValue({
      worldStructure: 'AI 完善后的世界架构',
      powerSystem: 'AI 完善后的力量体系',
      geography: 'AI 完善后的地理',
      era: 'AI 完善后的时代',
      factions: 'AI 完善后的势力',
      rules: ['AI 规则一', 'AI 规则二'],
    });
    render(
      <WorldviewEditor projectId="p1" genre="玄幻" title="星河黎明" summary="灵气复苏与星辰修道" />
    );

    fireEvent.click(await screen.findByRole('button', { name: /按简介完善世界观/ }));

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        '已按简介完善世界观',
        expect.any(Object)
      )
    );
    // 结果填入表单
    expect(screen.getByDisplayValue('AI 完善后的世界架构')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AI 完善后的时代')).toBeInTheDocument();
    expect(screen.getByText('AI 规则一')).toBeInTheDocument();
    // 未直接保存，但保存按钮已可用（dirty）
    expect(saveWorldviewMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    // LLM 输入包含简介与当前字段
    expect(refineWorldviewWithSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        genre: '玄幻',
        title: '星河黎明',
        summary: '灵气复苏与星辰修道',
        current: expect.objectContaining({ worldStructure: wvFixture.worldStructure }),
      })
    );
  });

  it('按简介完善失败：提示错误且不改动表单数据', async () => {
    getWorldviewMock.mockResolvedValue(wvFixture);
    refineWorldviewWithSummaryMock.mockRejectedValue(new Error('LLM 不可用'));
    render(
      <WorldviewEditor projectId="p1" genre="玄幻" title="星河黎明" summary="灵气复苏与星辰修道" />
    );

    fireEvent.click(await screen.findByRole('button', { name: /按简介完善世界观/ }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('按简介完善失败', expect.any(Object))
    );
    // 表单数据未变、未触发保存
    expect(screen.getByDisplayValue(wvFixture.worldStructure)).toBeInTheDocument();
    expect(saveWorldviewMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });
});