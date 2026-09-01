import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CharacterGenerator } from './CharacterGenerator';
import type { Character, CharacterRole } from '@/types';

const {
  saveCharacterMock,
  generateCharacterTemplateMock,
  getRoleLabelMock,
  toastMock,
  generateCharacterLLMMock,
} = vi.hoisted(() => ({
  saveCharacterMock: vi.fn(),
  generateCharacterTemplateMock: vi.fn(),
  getRoleLabelMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  generateCharacterLLMMock: vi.fn(),
}));

const ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '次要',
};

vi.mock('@/lib/db/queries', () => ({
  saveCharacter: (c: Character) => saveCharacterMock(c),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/character/template', () => ({
  generateCharacterTemplate: (...args: unknown[]) => generateCharacterTemplateMock(...args),
  getRoleLabel: (r: CharacterRole) => getRoleLabelMock(r),
}));

vi.mock('@/lib/llm/generators/character', () => ({
  generateCharacterWithLLM: (args: unknown) => generateCharacterLLMMock(args),
}));

const generatedFixture: Character = {
  id: 'char_new',
  projectId: 'p1',
  name: '冷无痕',
  role: 'protagonist',
  appearance: '外形描述',
  personality: '性格坚韧且隐忍的完整描述内容',
  catchphrase: '我意已决，无需多言。',
  background: '出身寒微',
  motivation: '守护所爱',
  weakness: '过于执着',
  growthArc: '从孤身到信任',
  relationships: [],
  speechStyle: '简短有力',
  behaviorPattern: '行动先于言辞',
  locked: false,
  updatedAt: 1600000000000,
};

describe('CharacterGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveCharacterMock.mockResolvedValue(undefined);
    generateCharacterTemplateMock.mockReturnValue(generatedFixture);
    getRoleLabelMock.mockImplementation((r: CharacterRole) => ROLE_LABELS[r] ?? String(r));
    // 默认：LLM 不可用 → 走本地模板兜底，保证既有测试语义
    generateCharacterLLMMock.mockRejectedValue(new Error('llm down'));
  });

  it('渲染标题与角色定位选项', () => {
    render(<CharacterGenerator projectId="p1" onGenerated={() => {}} />);
    expect(screen.getByText('AI 关键词生成')).toBeInTheDocument();
    expect(screen.getByText('主角')).toBeInTheDocument();
    expect(screen.getByText('反派')).toBeInTheDocument();
    expect(screen.getByText(/支持空格、逗号、顿号分隔/)).toBeInTheDocument();
  });

  it('未输入姓名或关键词时点击生成给出提示', async () => {
    render(<CharacterGenerator projectId="p1" onGenerated={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '生成人物' }));
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith('请至少输入姓名或关键词')
    );
    expect(saveCharacterMock).not.toHaveBeenCalled();
  });

  it('有效输入生成人物并保存、回调 onGenerated、清空输入', async () => {
    const onGenerated = vi.fn();
    render(<CharacterGenerator projectId="p1" onGenerated={onGenerated} />);

    const keywordsInput = screen.getByPlaceholderText(
      '如：冷酷剑修、孤独、复仇、天赋异禀…'
    );
    fireEvent.change(keywordsInput, { target: { value: '冷酷剑修' } });
    fireEvent.click(screen.getByRole('button', { name: '生成人物' }));

    await waitFor(() => expect(generateCharacterTemplateMock).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(generateCharacterTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', keywords: '冷酷剑修', name: '' })
    );
    await waitFor(() => expect(saveCharacterMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(saveCharacterMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'char_new', name: '冷无痕' })
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('人物档案已生成', expect.any(Object))
    );
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(onGenerated).toHaveBeenCalledWith(generatedFixture);
    // 输入被清空
    expect((screen.getByPlaceholderText('如：冷酷剑修、孤独、复仇、天赋异禀…') as HTMLInputElement).value).toBe('');
  });

  it('通过回车键触发生成', async () => {
    const onGenerated = vi.fn();
    render(<CharacterGenerator projectId="p1" onGenerated={onGenerated} />);
    const keywordsInput = screen.getByPlaceholderText(
      '如：冷酷剑修、孤独、复仇、天赋异禀…'
    );
    fireEvent.change(keywordsInput, { target: { value: '腹黑' } });
    fireEvent.keyDown(keywordsInput, { key: 'Enter' });

    await waitFor(() => expect(saveCharacterMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('生成失败时展示错误 toast', async () => {
    saveCharacterMock.mockRejectedValue(new Error('写入失败'));
    const onGenerated = vi.fn();
    render(<CharacterGenerator projectId="p1" onGenerated={onGenerated} />);
    fireEvent.change(screen.getByPlaceholderText('如：冷酷剑修、孤独、复仇、天赋异禀…'), {
      target: { value: '冷酷' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成人物' }));

    await waitFor(
      () =>
        expect(toastMock.error).toHaveBeenCalledWith('生成失败', expect.any(Object)),
      { timeout: 3000 }
    );
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('预览生成不保存', async () => {
    render(<CharacterGenerator projectId="p1" onGenerated={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('如：冷酷剑修、孤独、复仇、天赋异禀…'), {
      target: { value: '冷酷剑修' },
    });
    fireEvent.click(screen.getByRole('button', { name: '预览' }));

    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(
        '预览生成（未保存）：冷无痕',
        expect.any(Object)
      )
    );
    // 预览基于模板名，且不会保存
    expect(generateCharacterTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: '预览' })
    );
    expect(saveCharacterMock).not.toHaveBeenCalled();
  });
});