import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StyleSelector } from './StyleSelector';
import type { StylePreset } from '@/types';

const { listStylePresetsMock, updateProjectMock, getProjectMock, saveStylePresetMock, toastMock } =
  vi.hoisted(() => ({
    listStylePresetsMock: vi.fn(),
    updateProjectMock: vi.fn(),
    getProjectMock: vi.fn(),
    saveStylePresetMock: vi.fn(),
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }));

vi.mock('@/lib/db/queries', () => ({
  listStylePresets: () => listStylePresetsMock(),
  updateProject: (id: string, patch: unknown) => updateProjectMock(id, patch),
  getProject: (id: string) => getProjectMock(id),
  saveStylePreset: (preset: unknown) => saveStylePresetMock(preset),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

const builtinPreset: StylePreset = {
  id: 's1',
  name: '细腻言情',
  narrativePerspective: 'third-limited',
  pacing: 'medium',
  descriptionDensity: 'detailed',
  dialogueRatio: 0.3,
  vocabularyProfile: { avgSentenceLength: 15, commonPhrases: ['婉约', '含蓄'] },
};

const customPreset: StylePreset = {
  id: 'style-proj-p1',
  name: '基于样本的自定义文风',
  narrativePerspective: 'first',
  pacing: 'fast',
  descriptionDensity: 'sparse',
  dialogueRatio: 0.5,
  sampleText: '样本文本内容',
  vocabularyProfile: { avgSentenceLength: 10, commonPhrases: ['利落'] },
};

describe('StyleSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listStylePresetsMock.mockResolvedValue([builtinPreset, customPreset]);
    updateProjectMock.mockResolvedValue(undefined);
    getProjectMock.mockResolvedValue({ id: 'p1', genre: '玄幻' });
    saveStylePresetMock.mockResolvedValue(undefined);
  });

  it('加载中显示加载状态', () => {
    let resolveList!: (v: StylePreset[]) => void;
    listStylePresetsMock.mockReturnValue(
      new Promise<StylePreset[]>((r) => {
        resolveList = r;
      })
    );
    render(<StyleSelector projectId="p1" currentStylePresetId="" onSelected={() => {}} />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    resolveList([builtinPreset]);
  });

  it('无预设时显示提示', async () => {
    listStylePresetsMock.mockResolvedValue([]);
    render(<StyleSelector projectId="p1" currentStylePresetId="" onSelected={() => {}} />);
    expect(
      await screen.findByText(
        '暂无预设，请先在样本上传区上传样本生成项目专属预设'
      )
    ).toBeInTheDocument();
  });

  it('渲染内置与项目专属预设信息', async () => {
    render(<StyleSelector projectId="p1" currentStylePresetId="s1" onSelected={() => {}} />);
    const name = await screen.findByText('细腻言情');
    expect(name).toBeInTheDocument();
    expect(screen.getByText('第三人称有限')).toBeInTheDocument();
    expect(screen.getByText('中节奏 · 详尽')).toBeInTheDocument();
    expect(screen.getByText('对话占比 30%')).toBeInTheDocument();
    expect(screen.getByText('句长 15 字')).toBeInTheDocument();
    expect(screen.getByText('婉约')).toBeInTheDocument();
    // 项目专属预设（id 以 style-proj- 开头）展示标识
    expect(screen.getByText('项目专属')).toBeInTheDocument();
  });

  it('当前激活预设应用选中样式', async () => {
    render(<StyleSelector projectId="p1" currentStylePresetId="s1" onSelected={() => {}} />);
    const activeCard = await screen.findByText('细腻言情');
    expect(activeCard.closest('button')?.className).toContain('border-brand-600');
  });

  it('选择预设调用 updateProject 与 onSelected，并弹出成功提示', async () => {
    const onSelected = vi.fn();
    render(<StyleSelector projectId="p1" currentStylePresetId="s1" onSelected={onSelected} />);
    await screen.findByText('细腻言情');

    fireEvent.click(screen.getByRole('button', { name: /自定义文风/ }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalledTimes(1));
    expect(updateProjectMock).toHaveBeenCalledWith('p1', { stylePresetId: 'style-proj-p1' });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('已选择「基于样本的自定义文风」文风')
    );
    expect(onSelected).toHaveBeenCalledTimes(1);
  });

  it('选择失败时弹出错误提示', async () => {
    updateProjectMock.mockRejectedValue(new Error('写入失败'));
    const onSelected = vi.fn();
    render(<StyleSelector projectId="p1" currentStylePresetId="s1" onSelected={onSelected} />);
    await screen.findByText('细腻言情');

    fireEvent.click(screen.getByRole('button', { name: /自定义文风/ }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('选择失败', expect.any(Object))
    );
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('仅项目专属预设显示叙述者人格选择器，并按题材标注推荐', async () => {
    render(<StyleSelector projectId="p1" currentStylePresetId="style-proj-p1" onSelected={() => {}} />);
    // 选择器标题仅出现一次（项目专属卡）
    expect(await screen.findByText('叙述者人格')).toBeInTheDocument();
    // 玄幻 → 推荐「硬朗凌厉者」（★ 标注）
    const recommendedChip = screen.getByRole('button', { name: /硬朗凌厉者/ });
    expect(recommendedChip.textContent).toContain('★');
    // 非推荐人格不带 ★
    expect(screen.getByRole('button', { name: /温柔细腻者/ }).textContent).not.toContain('★');
  });

  it('点击人格芯片绑定人格并保存预设', async () => {
    render(<StyleSelector projectId="p1" currentStylePresetId="style-proj-p1" onSelected={() => {}} />);
    await screen.findByText('叙述者人格');

    fireEvent.click(screen.getByRole('button', { name: /冷峻观察者/ }));

    await waitFor(() => expect(saveStylePresetMock).toHaveBeenCalledTimes(1));
    const saved = saveStylePresetMock.mock.calls[0][0] as StylePreset;
    expect(saved.id).toBe('style-proj-p1');
    expect(saved.persona?.id).toBe('persona-cold');
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('已将叙述者人格「冷峻观察者」绑定到「基于样本的自定义文风」')
    );
  });

  it('点击「不绑定」保存预设时清除人格', async () => {
    const withPersona: StylePreset = {
      ...customPreset,
      persona: {
        id: 'persona-cold',
        name: '冷峻观察者',
        summary: '白描克制',
        narration: '白描为主',
        dialogue: '台词克制',
        emotion: '只写生理信号',
        avoid: '感叹号堆砌',
      },
    };
    listStylePresetsMock.mockResolvedValue([builtinPreset, withPersona]);
    render(<StyleSelector projectId="p1" currentStylePresetId="style-proj-p1" onSelected={() => {}} />);
    await screen.findByText('叙述者人格');

    fireEvent.click(screen.getByRole('button', { name: '不绑定' }));

    await waitFor(() => expect(saveStylePresetMock).toHaveBeenCalledTimes(1));
    const saved = saveStylePresetMock.mock.calls[0][0] as StylePreset;
    expect(saved.persona).toBeUndefined();
  });

  // ============ 按题材智能推荐（需求 8） ============
  it('点击智能推荐展示推荐结果与理由，点「应用」才切换', async () => {
    const onSelected = vi.fn();
    render(<StyleSelector projectId="p1" currentStylePresetId="" onSelected={onSelected} />);
    await screen.findByText('细腻言情');

    // 玄幻映射（热血升级/硬核爽文）未在库中 → 兜底第一个预设「细腻言情」
    fireEvent.click(screen.getByRole('button', { name: '按题材智能推荐' }));

    expect(await screen.findByText('推荐文风：细腻言情')).toBeInTheDocument();
    expect(screen.getByText(/题材「玄幻」的经典文风搭配/)).toBeInTheDocument();
    // 展示阶段不写入
    expect(updateProjectMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '应用' }));

    await waitFor(() => expect(updateProjectMock).toHaveBeenCalledWith('p1', { stylePresetId: 's1' }));
    await waitFor(() => expect(onSelected).toHaveBeenCalledTimes(1));
  });

  it('推荐结果可取消，取消后不切换', async () => {
    render(<StyleSelector projectId="p1" currentStylePresetId="" onSelected={() => {}} />);
    await screen.findByText('细腻言情');
    fireEvent.click(screen.getByRole('button', { name: '按题材智能推荐' }));
    await screen.findByText('推荐文风：细腻言情');

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByText('推荐文风：细腻言情')).not.toBeInTheDocument();
    expect(updateProjectMock).not.toHaveBeenCalled();
  });

  it('推荐与当前一致时 toast 说明已是推荐文风', async () => {
    render(<StyleSelector projectId="p1" currentStylePresetId="s1" onSelected={() => {}} />);
    await screen.findByText('细腻言情');
    fireEvent.click(screen.getByRole('button', { name: '按题材智能推荐' }));

    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith('当前文风「细腻言情」已是推荐文风')
    );
    expect(screen.queryByText('推荐文风：细腻言情')).not.toBeInTheDocument();
  });

  it('简介含「甜/宠」关键词时按简介微调推荐并给出对应理由', async () => {
    getProjectMock.mockResolvedValue({ id: 'p1', genre: '言情', summary: '先婚后爱的高甜宠爱日常' });
    render(<StyleSelector projectId="p1" currentStylePresetId="" onSelected={() => {}} />);
    await screen.findByText('细腻言情');

    fireEvent.click(screen.getByRole('button', { name: '按题材智能推荐' }));

    // 库中无「女频甜宠」→ 简介微调取第二优先级「细腻言情」
    expect(await screen.findByText('推荐文风：细腻言情')).toBeInTheDocument();
    expect(screen.getByText(/项目简介中的题材关键词与该文风匹配/)).toBeInTheDocument();
  });
});