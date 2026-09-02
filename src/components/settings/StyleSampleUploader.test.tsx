import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { StyleSampleUploader } from './StyleSampleUploader';
import type { StylePreset } from '@/types';

const {
  getProjectStylePresetMock,
  saveStylePresetMock,
  updateProjectMock,
  analyzeTextStyleMock,
  sampleToPresetMock,
  validateSampleTextMock,
  toastMock,
} = vi.hoisted(() => ({
  getProjectStylePresetMock: vi.fn(),
  saveStylePresetMock: vi.fn(),
  updateProjectMock: vi.fn(),
  analyzeTextStyleMock: vi.fn(),
  sampleToPresetMock: vi.fn(),
  validateSampleTextMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/db/queries', () => ({
  saveStylePreset: (p: StylePreset) => saveStylePresetMock(p),
  updateProject: (id: string, patch: unknown) => updateProjectMock(id, patch),
  getProjectStylePreset: (id: string) => getProjectStylePresetMock(id),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/style/profile', () => ({
  analyzeTextStyle: (t: string) => analyzeTextStyleMock(t),
  sampleToPreset: (...args: unknown[]) => sampleToPresetMock(...args),
  validateSampleText: (t: string) => validateSampleTextMock(t),
}));

vi.mock('@/lib/style/clone', () => ({
  generateStyleGuide: (t: string) =>
    Promise.resolve({
      summary: `指南:${String(t).slice(0, 6)}`,
      rhythm: '节奏',
      tone: '语气',
      wordPreferences: '用词',
      taboos: '禁忌',
    }),
  styleGuideToPrompt: (g: { summary: string }) => `指南:${g.summary}`,
}));

const statsFixture = {
  sentenceCount: 5,
  avgSentenceLength: 12,
  dialogueCount: 2,
  dialogueRatio: 0.4,
  totalChineseChars: 60,
  topBigrams: ['双字词'],
  topTrigrams: ['三字组'],
};

const presetFixture: StylePreset = {
  id: 'style-proj-p1',
  name: '基于样本的自定义文风',
  narrativePerspective: 'first',
  pacing: 'fast',
  descriptionDensity: 'sparse',
  dialogueRatio: 0.4,
  sampleText: '这是样本文本',
  vocabularyProfile: { avgSentenceLength: 12, commonPhrases: ['三字组'] },
};

describe('StyleSampleUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectStylePresetMock.mockResolvedValue(null);
    saveStylePresetMock.mockResolvedValue(undefined);
    updateProjectMock.mockResolvedValue(undefined);
    analyzeTextStyleMock.mockReturnValue(statsFixture);
    sampleToPresetMock.mockReturnValue(presetFixture);
    validateSampleTextMock.mockReturnValue({ ok: true, chineseChars: 600 });
  });

  it('加载已有预设时回填文本、展示统计与专属预设标识', async () => {
    getProjectStylePresetMock.mockResolvedValue({ ...presetFixture, sampleText: '这是样本文本' });
    render(<StyleSampleUploader projectId="p1" onSaved={() => {}} />);

    expect(await screen.findByText('已有专属预设')).toBeInTheDocument();
    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textbox.value).toBe('这是样本文本');
    // 统计已基于回填样本分析
    expect(screen.getByText('文风分析结果')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(analyzeTextStyleMock).toHaveBeenCalledWith('这是样本文本');
  });

  it('无内容时分析按钮禁用，输入后可启用', () => {
    render(<StyleSampleUploader projectId="p1" onSaved={() => {}} />);
    const analyzeBtn = screen.getByRole('button', { name: '分析' });
    expect(analyzeBtn).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '一段样本文本内容' } });
    expect(analyzeBtn).toBeEnabled();
  });

  it('点击分析展示统计结果并提示', async () => {
    render(<StyleSampleUploader projectId="p1" onSaved={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '样本文本内容' } });
    fireEvent.click(screen.getByRole('button', { name: '分析' }));

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('分析完成', {
        description: '5 句 · 平均 12 字/句',
      })
    );
    expect(analyzeTextStyleMock).toHaveBeenCalledWith('样本文本内容');
    expect(screen.getByText('文风分析结果')).toBeInTheDocument();
    expect(screen.getByText('三字组')).toBeInTheDocument();
  });

  it('样本文本不足时阻止保存并提示', async () => {
    validateSampleTextMock.mockReturnValue({
      ok: false,
      message: '样本至少 100 个中文字符',
      chineseChars: 50,
    });
    render(<StyleSampleUploader projectId="p1" onSaved={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '样本' } });
    fireEvent.click(screen.getByRole('button', { name: '生成并应用' }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('样本至少 100 个中文字符')
    );
    expect(saveStylePresetMock).not.toHaveBeenCalled();
  });

  it('样本达标时保存预设、更新项目并回调 onSaved', async () => {
    const onSaved = vi.fn();
    render(<StyleSampleUploader projectId="p1" onSaved={onSaved} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '这是一段达到要求的样本文本内容' } });
    fireEvent.click(screen.getByRole('button', { name: '生成并应用' }));

    await waitFor(() => expect(saveStylePresetMock).toHaveBeenCalledTimes(1));
    const saved = saveStylePresetMock.mock.calls[0][0] as StylePreset;
    expect(saved.styleGuide?.summary).toContain('指南:');
    expect(updateProjectMock).toHaveBeenCalledWith('p1', { stylePresetId: 'style-proj-p1' });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        '项目专属文风已生成并应用',
        expect.any(Object)
      )
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    // 保存后显示专属预设标识与文风仿写指南
    expect(screen.getByText('已有专属预设')).toBeInTheDocument();
    expect(screen.getByText('文风仿写指南')).toBeInTheDocument();
  });

  it('样本偏少但有警告时仍可继续保存', async () => {
    validateSampleTextMock.mockReturnValue({
      ok: true,
      message: '样本字数偏少（建议 500 字以上以保证统计准确）',
      chineseChars: 200,
    });
    render(<StyleSampleUploader projectId="p1" onSaved={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '一段样本文本内容' } });
    fireEvent.click(screen.getByRole('button', { name: '生成并应用' }));

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        '样本字数偏少（建议 500 字以上以保证统计准确）',
        expect.any(Object)
      )
    );
    await waitFor(() => expect(saveStylePresetMock).toHaveBeenCalledTimes(1));
  });

  it('清空按钮会清空文本', async () => {
    render(<StyleSampleUploader projectId="p1" onSaved={() => {}} />);
    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textbox, { target: { value: '内容' } });
    expect(screen.getByText('清空')).toBeInTheDocument();

    fireEvent.click(screen.getByText('清空'));
    expect(textbox.value).toBe('');
    expect(screen.queryByText('清空')).not.toBeInTheDocument();
  });
});