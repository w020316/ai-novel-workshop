import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
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
  await screen.findByLabelText('目标章节数 *');
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
      { id: 'style-preset-3', name: '悬疑冷峻' },
      { id: 'style-preset-4', name: '女频甜宠' },
      { id: 'style-preset-5', name: '热血升级' },
    ]);
  });

  afterEach(() => {
    // 清理 URL 参数，避免影响其他用例（灵感带入用例会写入 query）
    window.history.replaceState(null, '', '/');
  });

  it('第 1 步渲染故事想法字段；前进到第 2 步可见文风预设选项', async () => {
    render(<ProjectForm />);
    expect(screen.getByLabelText('小说标题 *')).toBeInTheDocument();
    // 第 2 步字段尚未渲染
    expect(screen.queryByLabelText('目标章节数 *')).not.toBeInTheDocument();

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
    expect(screen.queryByLabelText('目标章节数 *')).not.toBeInTheDocument();
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
    expect(screen.getByText(/预估 4 卷 \/ 120 章/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '100 万（百万长篇）' }));
    expect(screen.getByText(/预估 7 卷 \/ 400 章/)).toBeInTheDocument();
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

  // ===== 需求 3：目标卷数可调 =====
  it('第 2 步指定目标卷数 → 黏性条按指定卷数预估，提交透传 volumeCount', async () => {
    render(<ProjectForm />);
    await goStep2();
    // 留空 → 自动推算（30 万字 → 4 卷）
    expect(screen.getByText(/预估 4 卷 \/ 120 章/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8 卷' }));
    // 卷数变 8，总章数不变（改卷数不影响字数）
    expect(screen.getByText(/预估 8 卷 \/ 120 章/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    await screen.findByText('AI 模型配置');
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() =>
      expect(createProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ volumeCount: 8 })
      )
    );
  });

  it('卷数留空 → 提交对象不含 volumeCount（按字数自动推算）', async () => {
    render(<ProjectForm />);
    await goStep3();
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await waitFor(() => expect(createProjectMock).toHaveBeenCalled());
    expect(createProjectMock.mock.calls[0][0]).not.toHaveProperty('volumeCount');
  });

  it('卷数输入超上限 20 → 点下一步被拦截并提示', async () => {
    render(<ProjectForm />);
    await goStep2();
    fireEvent.change(screen.getByLabelText('目标卷数（可调）'), {
      target: { value: '21' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('目标卷数不超过 20')).toBeInTheDocument();
    // 仍停留在第 2 步
    expect(screen.getByLabelText('目标卷数（可调）')).toBeInTheDocument();
  });

  // ===== 需求 4：题材 → 推荐文风自动匹配（来自灵感场景） =====
  it('URL 带灵感题材进入 → 文风自动匹配推荐预设（悬疑 → 悬疑冷峻）', async () => {
    window.history.replaceState(null, '', '/project/new?title=长夜谜案&genre=悬疑');
    render(<ProjectForm />);
    await goStep2();
    expect(screen.getByLabelText('文风预设 *')).toHaveValue('style-preset-3');
  });

  it('点选题起点 chip → 按题材自动匹配文风（甜宠 → 女频甜宠）', async () => {
    // 用已喜欢的起点保证 chip 固定出现（精选池是随机的）
    localStorage.setItem(
      'ai-novel-liked-starts-v1',
      JSON.stringify([{ title: '重生宠妻', genre: '甜宠' }])
    );
    render(<ProjectForm />);
    fireEvent.click(await screen.findByRole('button', { name: /重生宠妻 · 甜宠/ }));
    await goStep2();
    expect(screen.getByLabelText('文风预设 *')).toHaveValue('style-preset-4');
  });

  it('无灵感场景（直接填写）→ 文风保持默认不自动匹配', async () => {
    render(<ProjectForm />);
    await goStep2();
    expect(screen.getByLabelText('文风预设 *')).toHaveValue('style-preset-1');
  });

  it('用户手动改过文风后，改题材不再自动覆盖手动选择', async () => {
    window.history.replaceState(null, '', '/project/new?title=长夜谜案&genre=悬疑');
    render(<ProjectForm />);
    await goStep2();
    // 灵感带入 → 自动匹配悬疑冷峻
    expect(screen.getByLabelText('文风预设 *')).toHaveValue('style-preset-3');
    // 手动把文风改为硬核爽文（记录 touched）
    fireEvent.change(screen.getByLabelText('文风预设 *'), {
      target: { value: 'style-preset-1' },
    });
    expect(screen.getByLabelText('文风预设 *')).toHaveValue('style-preset-1');
    // 回第 1 步把题材改为玄幻，再前进到第 3 步提交
    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    fireEvent.click(screen.getByRole('radio', { name: '玄幻' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    await screen.findByText('AI 模型配置');
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    // 手动选择优先：文风仍是硬核爽文，不被玄幻的推荐（热血升级）覆盖
    await waitFor(() =>
      expect(createProjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ genre: '玄幻', stylePresetId: 'style-preset-1' })
      )
    );
  });
});
