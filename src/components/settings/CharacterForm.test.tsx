import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CharacterForm } from './CharacterForm';
import type { Character, CharacterRole, CharacterRelation } from '@/types';

const {
  saveCharacterMock,
  listCharactersMock,
  markChapterNeedsRecheckMock,
  suggestRelationsMock,
  getRoleLabelMock,
  getRoleBadgeClassMock,
  toastMock,
} = vi.hoisted(() => ({
  saveCharacterMock: vi.fn(),
  listCharactersMock: vi.fn(),
  markChapterNeedsRecheckMock: vi.fn(),
  suggestRelationsMock: vi.fn(),
  getRoleLabelMock: vi.fn(),
  getRoleBadgeClassMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '次要',
};

vi.mock('@/lib/db/queries', () => ({
  saveCharacter: (c: Character) => saveCharacterMock(c),
  listCharacters: (id: string) => listCharactersMock(id),
  markChapterNeedsRecheck: (id: string) => markChapterNeedsRecheckMock(id),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/character/template', () => ({
  suggestRelations: (...args: unknown[]) => suggestRelationsMock(...args),
  getRoleLabel: (r: CharacterRole) => getRoleLabelMock(r),
  getRoleBadgeClass: (r: CharacterRole) => getRoleBadgeClassMock(r),
}));

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    projectId: 'p1',
    name: '李云渊',
    role: 'protagonist',
    appearance: '长身玉立',
    personality: '冷静沉着的剑修主角性格',
    catchphrase: '我意已决',
    background: '出身寒微',
    motivation: '守护所爱',
    weakness: '过于执着',
    growthArc: '从孤身到信任',
    relationships: [],
    speechStyle: '简短有力',
    behaviorPattern: '行动先于言辞',
    locked: false,
    updatedAt: 1600000000000,
    ...overrides,
  };
}

const charB: Character = makeChar({
  id: 'c2',
  name: '王小二',
  role: 'supporting',
  catchphrase: '别急，慢慢来',
});

const relationFixture: CharacterRelation = {
  targetId: 'c2',
  targetName: '王小二',
  relation: '师徒',
};

describe('CharacterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveCharacterMock.mockResolvedValue(undefined);
    markChapterNeedsRecheckMock.mockResolvedValue(0);
    listCharactersMock.mockResolvedValue([]);
    getRoleLabelMock.mockImplementation((r: CharacterRole) => ROLE_LABELS[r] ?? String(r));
    getRoleBadgeClassMock.mockReturnValue('');
    suggestRelationsMock.mockReturnValue([]);
  });

  it('新建模式渲染标题、字段区与未锁定提示', async () => {
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('新建人物')).toBeInTheDocument();
    expect(screen.getByText('未锁定')).toBeInTheDocument();
    // 姓名与性格占位符
    expect(screen.getByPlaceholderText('如：李云渊')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('至少 10 字描述其核心性格…')).toBeInTheDocument();
    // 字数统计初始为 0
    expect(screen.getByText(/当前共\s*0\s*字/)).toBeInTheDocument();
    // 角色选项
    expect(screen.getByText('主角')).toBeInTheDocument();
    expect(screen.getByText('反派')).toBeInTheDocument();
  });

  it('编辑模式显示人物姓名标题，已锁定则禁用字段与保存', () => {
    const locked = makeChar({ id: 'existing', name: '李四', locked: true });
    render(
      <CharacterForm projectId="p1" initial={locked} onClose={() => {}} onSaved={() => {}} />
    );
    expect(screen.getByText('编辑：李四')).toBeInTheDocument();
    expect(screen.getByText(/已锁定/)).toBeInTheDocument();
    // 保存按钮被禁用
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    // 详情字段禁用
    expect(screen.getByPlaceholderText('至少 10 字描述其核心性格…')).toBeDisabled();
  });

  it('姓名为空时点击保存弹错且不调用 saveCharacter', async () => {
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('请输入人物姓名')
    );
    expect(saveCharacterMock).not.toHaveBeenCalled();
  });

  it('性格描述不足 10 字时保存报错', async () => {
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('如：李云渊'), {
      target: { value: '阿飞' },
    });
    fireEvent.change(screen.getByPlaceholderText('至少 10 字描述其核心性格…'), {
      target: { value: '过短' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('性格描述至少 10 字')
    );
    expect(saveCharacterMock).not.toHaveBeenCalled();
  });

  it('有效输入保存人物并回调 onSaved', async () => {
    const onSaved = vi.fn();
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('如：李云渊'), {
      target: { value: '  李云渊 ' },
    });
    fireEvent.change(screen.getByPlaceholderText('至少 10 字描述其核心性格…'), {
      target: { value: '冷静沉着的剑修主角性格' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(saveCharacterMock).toHaveBeenCalledTimes(1));
    expect(saveCharacterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        name: '李云渊',
        personality: '冷静沉着的剑修主角性格',
      })
    );
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('人物已创建', expect.any(Object)));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('保存失败时展示错误 toast 且不触发 onSaved', async () => {
    saveCharacterMock.mockRejectedValue(new Error('写入失败'));
    const onSaved = vi.fn();
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText('如：李云渊'), {
      target: { value: '阿飞' },
    });
    fireEvent.change(screen.getByPlaceholderText('至少 10 字描述其核心性格…'), {
      target: { value: '性格坚韧且隐忍的完整描述内容' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('保存失败', expect.any(Object))
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('添加人物关系：选择目标与描述后出现在列表', async () => {
    listCharactersMock.mockResolvedValue([charB]);
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);

    // 等待目标人物被加载
    await waitFor(() => expect(screen.getByText('王小二（配角）')).toBeInTheDocument());

    const targetSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(targetSelect, { target: { value: 'c2' } });
    fireEvent.change(screen.getByPlaceholderText('如：师徒 / 恋人 / 仇敌'), {
      target: { value: '师徒' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(await screen.findByText('师徒')).toBeInTheDocument();
    expect(screen.getByText('王小二')).toBeInTheDocument();
  });

  it('未选择目标人物时提示请选择目标人物', async () => {
    listCharactersMock.mockResolvedValue([charB]);
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByText('王小二（配角）')).toBeInTheDocument());
    // 目标为空，在描述框按回车触发 addRelation
    fireEvent.keyDown(screen.getByPlaceholderText('如：师徒 / 恋人 / 仇敌'), {
      key: 'Enter',
    });
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith('请选择目标人物')
    );
  });

  it('已存在目标人物关系时提示重复', async () => {
    listCharactersMock.mockResolvedValue([charB]);
    render(
      <CharacterForm
        projectId="p1"
        initial={makeChar({ id: 'c1', relationships: [relationFixture] })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByText('王小二（配角）')).toBeInTheDocument());

    const targetSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(targetSelect, { target: { value: 'c2' } });
    fireEvent.change(screen.getByPlaceholderText('如：师徒 / 恋人 / 仇敌'), {
      target: { value: '师徒' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith('已存在该人物的关系')
    );
  });

  it('删除已添加的关系', async () => {
    render(
      <CharacterForm
        projectId="p1"
        initial={makeChar({ id: 'c1', relationships: [relationFixture] })}
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    expect(screen.getByText('师徒')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('删除关系'));
    expect(screen.queryByText('师徒')).not.toBeInTheDocument();
  });

  it('自动推荐关系并提示添加数量', async () => {
    listCharactersMock.mockResolvedValue([charB]);
    suggestRelationsMock.mockReturnValue([relationFixture]);
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByText('王小二（配角）')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '自动推荐' }));

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('已添加 1 段推荐关系')
    );
    expect(await screen.findByText('师徒')).toBeInTheDocument();
  });

  it('无可用推荐关系时提示', async () => {
    listCharactersMock.mockResolvedValue([charB]);
    suggestRelationsMock.mockReturnValue([]);
    render(<CharacterForm projectId="p1" onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByText('王小二（配角）')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '自动推荐' }));

    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith('已无可自动推荐的关系')
    );
  });

  it('点击取消调用 onClose', () => {
    const onClose = vi.fn();
    render(<CharacterForm projectId="p1" onClose={onClose} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});