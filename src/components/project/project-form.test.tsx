import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ProjectForm } from './project-form';

const { createProjectMock, pushMock, backMock, toastMock, toArrayMock } =
  vi.hoisted(() => ({
    createProjectMock: vi.fn(),
    pushMock: vi.fn(),
    backMock: vi.fn(),
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
  useRouter: () => ({ push: pushMock, back: backMock }),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/db/schema', () => ({
  db: { stylePresets: { toArray: () => toArrayMock() } },
}));

describe('ProjectForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProjectMock.mockResolvedValue('proj-1');
    toArrayMock.mockResolvedValue([
      { id: 'style-preset-1', name: '硬核爽文' },
      { id: 'style-preset-2', name: '细腻言情' },
    ]);
  });

  it('渲染表单字段并在文风预设加载后显示选项', async () => {
    render(<ProjectForm />);
    expect(screen.getByLabelText('小说标题 *')).toBeInTheDocument();
    expect(screen.getByText('加载文风预设中…')).toBeInTheDocument();

    const preset = await screen.findByText('硬核爽文');
    expect(preset).toBeInTheDocument();
    expect(screen.getByText('细腻言情')).toBeInTheDocument();
    expect(
      screen.getByText('首选：Gemini 3.6 Flash (免费推荐，最新)')
    ).toBeInTheDocument();
    // 等待文风预设异步加载完成，避免未包裹 act 的更新
    await screen.findByRole('option', { name: '细腻言情' });
  });

  it('标题为空时提交展示校验错误', async () => {
    render(<ProjectForm />);
    await screen.findByRole('option', { name: '硬核爽文' });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    expect(await screen.findByText('请输入小说标题')).toBeInTheDocument();
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it('填写并提交成功创建项目并跳转', async () => {
    render(<ProjectForm />);
    await screen.findByRole('option', { name: '硬核爽文' });
    fireEvent.change(screen.getByPlaceholderText('如：星河黎明'), {
      target: { value: '星河黎明' },
    });
    fireEvent.change(screen.getByLabelText('一句话简介'), {
      target: { value: '一个关于星辰的故事' },
    });
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

  it('点击取消触发 router.back', async () => {
    render(<ProjectForm />);
    await screen.findByRole('option', { name: '硬核爽文' });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(backMock).toHaveBeenCalled();
  });

  it('切换模型供应商后更新首选提示', async () => {
    render(<ProjectForm />);
    await screen.findByRole('option', { name: '硬核爽文' });
    fireEvent.click(screen.getByRole('radio', { name: '智谱 GLM' }));
    expect(
      screen.getByText('首选：GLM-4 Flash (免费，128K)')
    ).toBeInTheDocument();
  });

  it('创建失败时展示错误 toast', async () => {
    createProjectMock.mockRejectedValue(new Error('数据库写入失败'));
    render(<ProjectForm />);
    await screen.findByRole('option', { name: '硬核爽文' });
    fireEvent.change(screen.getByPlaceholderText('如：星河黎明'), {
      target: { value: '新项目' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
  });

  it('点击百万长篇快选 → 预估更新为 7 卷 / 400 章，提交带入 100 万', async () => {
    render(<ProjectForm />);
    await screen.findByRole('option', { name: '硬核爽文' });
    expect(screen.getByText(/预估：4 卷 \/ 120 章/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '100 万（百万长篇）' }));
    expect(screen.getByText(/预估：7 卷 \/ 400 章/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('如：星河黎明'), {
      target: { value: '百万纪元' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() =>
      expect(createProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ targetWords: 1_000_000 })
      )
    );
  });
});