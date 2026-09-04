import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ProjectForm } from './project-form';

const { createProjectMock, pushMock, toastMock, toArrayMock } =
  vi.hoisted(() => ({
    createProjectMock: vi.fn(),
    pushMock: vi.fn(),
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
    toArrayMock: vi.fn(),
  }));

vi.mock('@/lib/store/project-store', () => ({
  DEFAULT_LLM_CONFIG: { provider: 'gemini', temperature: 0.8, topP: 0.9 },
  useProjectStore: () => ({ createProject: createProjectMock }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/db/schema', () => ({
  db: { stylePresets: { toArray: () => toArrayMock() } },
}));

/** 走到第 2 步（填标题+简介 → 点下一步；简介属第 1 步，过后字段卸载） */
async function goStep2() {
  fireEvent.change(screen.getByPlaceholderText('如：星河黎明'), {
    target: { value: '星河黎明' },
  });
  fireEvent.change(screen.getByLabelText('一句话简介'), {
    target: { value: '一个关于星辰的故事' },
  });
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  await screen.findByLabelText('目标字数 *');
}

/** 走到第 3 步（AI 配置）：内部含完整 1→2→3 前进，调用方勿先调 goStep2 */
async function goStep3() {
  await goStep2();
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
  await screen.findByText('AI 模型配置');
}

describe('ProjectForm（三步向导）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.scrollTo = vi.fn();
    createProjectMock.mockResolvedValue('proj-1');
    toArrayMock.mockResolvedValue([
      { id: 'style-preset-1', name: '硬核爽文' },
      { id: 'style-preset-2', name: '细腻言情' },
    ]);
  });

  it('第 1 步渲染故事想法字段；前进到第 2 步可见文风预设选项', async () => {
    render(<ProjectForm />);
    expect(screen.getByLabelText('小说标题 *')).toBeInTheDocument();
    // 第 2 步字段尚未渲染
    expect(screen.queryByLabelText('目标字数 *')).not.toBeInTheDocument();

    await goStep2();
    const preset = await screen.findByText('硬核爽文');
    expect(preset).toBeInTheDocument();
    expect(screen.getByText('细腻言情')).toBeInTheDocument();
  });

  it('标题为空点下一步：拦截在本步并展示校验错误', async () => {
    render(<ProjectForm />);
    await screen.findByText(/不知道写什么？/);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('请输入小说标题')).toBeInTheDocument();
    // 仍停留在第 1 步（未出现第 2 步字段）
    expect(screen.queryByLabelText('目标字数 *')).not.toBeInTheDocument();
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it('三步填写完成后提交成功并跳转', async () => {
    render(<ProjectForm />);
    await goStep3();
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    await waitFor(() => expect(createProjectMock).toHaveBeenCalledTimes(1));
    expect(createProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '星河黎明',
        genre: '玄幻',
        summary: '一个关于星辰的故事',
        targetWords: 300000,
        stylePresetId: 'style-preset-1',
        llmConfig: expect.objectContaining({
          provider: 'gemini',
          model: 'gemini-3.6-flash',
          temperature: 0.8,
          topP: 0.9,
        }),
      })
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/project/proj-1'));
    expect(toastMock.success).toHaveBeenCalledWith('项目创建成功');
  });

  it('向导导航：第 1 步无上一步；回跳已完成步保留已填值', async () => {
    render(<ProjectForm />);
    // 第 1 步没有「上一步」
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument();
    await goStep2();
    // 第 2 步出现「上一步」，点它回跳
    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    // 回跳后已填标题保留（react-hook-form 卸载字段不丢值）
    expect(
      await screen.findByDisplayValue('星河黎明')
    ).toBeInTheDocument();
    // 已完成步可点击回跳（步骤 ✓ 按钮）
    expect(screen.getByRole('button', { name: /篇幅与文风/ })).toBeInTheDocument();
  });

  it('切换模型供应商后更新首选提示', async () => {
    render(<ProjectForm />);
    await goStep3();
    fireEvent.click(screen.getByRole('radio', { name: '智谱 GLM' }));
    expect(
      screen.getByText('首选：GLM-4 Flash (免费，128K)')
    ).toBeInTheDocument();
  });

  it('创建失败时展示错误 toast', async () => {
    createProjectMock.mockRejectedValue(new Error('数据库写入失败'));
    render(<ProjectForm />);
    await goStep3();
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
  });

  it('第 2 步点百万长篇快选 → 预估更新为 7 卷 / 400 章，提交带入 100 万', async () => {
    render(<ProjectForm />);
    await goStep2();
    expect(screen.getByText(/预估：4 卷 \/ 120 章/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '100 万（百万长篇）' }));
    expect(screen.getByText(/预估：7 卷 \/ 400 章/)).toBeInTheDocument();
    // 前进到第 3 步（此时已在第 2 步，只点一次下一步）
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    await screen.findByText('AI 模型配置');
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() =>
      expect(createProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ targetWords: 1_000_000 })
      )
    );
  });

  it('输入标题后自动保存草稿，供中途离开恢复', async () => {
    render(<ProjectForm />);
    fireEvent.change(screen.getByPlaceholderText('如：星河黎明'), {
      target: { value: '半城烟火' },
    });
    // 等待 300ms 防抖落库
    await waitFor(() => {
      const raw = localStorage.getItem('ai-novel-project-draft-v1');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).title).toBe('半城烟火');
    });
  });

  it('存在草稿时自动恢复标题并提示', async () => {
    localStorage.setItem(
      'ai-novel-project-draft-v1',
      JSON.stringify({ title: '星河黎明', genre: '科幻', summary: '一段星空的冒险' })
    );
    render(<ProjectForm />);
    expect(screen.getByDisplayValue('星河黎明')).toBeInTheDocument();
    expect(toastMock.info).toHaveBeenCalledWith(
      '已恢复上次未提交的内容，可直接修改后创建'
    );
  });
});
