import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CharacterList } from './CharacterList';
import type { Character, CharacterRole } from '@/types';

const {
  getRoleLabelMock,
  getRoleBadgeClassMock,
} = vi.hoisted(() => ({
  getRoleLabelMock: vi.fn(),
  getRoleBadgeClassMock: vi.fn(),
}));

vi.mock('@/lib/character/template', () => ({
  getRoleLabel: (r: CharacterRole) => getRoleLabelMock(r),
  getRoleBadgeClass: (r: CharacterRole) => getRoleBadgeClassMock(r),
}));

const ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '次要',
};

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    projectId: 'p1',
    name: '李云渊',
    role: 'protagonist',
    appearance: '长身玉立',
    personality: '冷静沉着的剑修主角性格',
    catchphrase: '我意已决',
    background: '出身寒微的宗门天才',
    motivation: '守护所爱',
    weakness: '过于执着',
    growthArc: '从孤身到信任',
    relationships: [
      { targetId: 'c2', targetName: '王小二', relation: '师徒' },
    ],
    speechStyle: '简短有力',
    behaviorPattern: '行动先于言辞',
    locked: false,
    updatedAt: 1600000000000,
    ...overrides,
  };
}

const baseProps = {
  onEdit: () => {},
  onDelete: () => {},
  onToggleLock: () => {},
  onAdd: () => {},
};

describe('CharacterList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRoleLabelMock.mockImplementation((r: CharacterRole) => ROLE_LABELS[r] ?? String(r));
    getRoleBadgeClassMock.mockReturnValue('bg-brand-100 text-brand-700');
  });

  it('加载中显示加载状态', () => {
    render(<CharacterList characters={[]} loading {...baseProps} />);
    expect(screen.getByText('加载人物列表…')).toBeInTheDocument();
  });

  it('空列表显示空态与提示词，点击新增调用 onAdd', () => {
    const onAdd = vi.fn();
    render(
      <CharacterList
        characters={[]}
        loading={false}
        onEdit={() => {}}
        onDelete={() => {}}
        onToggleLock={() => {}}
        onAdd={onAdd}
        emptyHint="自定义空态提示"
      />
    );
    expect(screen.getByText('还没有人物档案')).toBeInTheDocument();
    expect(screen.getByText('自定义空态提示')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新增人物' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('渲染人物卡片信息（姓名/口头禅/性格/字数/关系数/时间）', () => {
    // 字数 = appearance + personality + background = 4 + 10 + 4 = 18
    const c = makeChar({
      appearance: '外貌特征',
      personality: '冷静沉着剑修主角性格',
      background: '宗门背景',
      catchphrase: '我意已决',
    });
    render(<CharacterList characters={[c]} loading={false} {...baseProps} />);
    expect(screen.getByText('李云渊')).toBeInTheDocument();
    expect(screen.getByText('主角')).toBeInTheDocument();
    expect(screen.getByText('我意已决')).toBeInTheDocument();
    expect(screen.getByText('冷静沉着剑修主角性格')).toBeInTheDocument();
    expect(screen.getByText('18 字')).toBeInTheDocument();
    expect(screen.getByText('1 段关系')).toBeInTheDocument();
    expect(screen.getByText('2020-09-13 20:26')).toBeInTheDocument();
  });

  it('按角色等级排序：主角在前、次要在后', () => {
    const minor = makeChar({ id: 'm1', name: '路人甲', role: 'minor' });
    const protagonist = makeChar({ id: 'p1', name: '李云渊', role: 'protagonist' });
    render(
      <CharacterList characters={[minor, protagonist]} loading={false} {...baseProps} />
    );
    const headings = screen
      .getAllByText(/李云渊|路人甲/)
      .filter((el) => el.tagName === 'H3');
    expect(headings[0]).toHaveTextContent('李云渊');
    expect(headings[1]).toHaveTextContent('路人甲');
  });

  it('无口头禅时显示默认提示，锁定人物显示锁定按钮', () => {
    const c = makeChar({ catchphrase: '', locked: true });
    render(<CharacterList characters={[c]} loading={false} {...baseProps} />);
    expect(screen.getByText('（暂无口头禅）')).toBeInTheDocument();
    // 已锁定 → 显示解锁按钮
    expect(screen.getByRole('button', { name: '解锁' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '锁定' })).not.toBeInTheDocument();
  });

  it('点击编辑/删除/锁定/解锁按钮触发对应回调', () => {
    const c = makeChar({ locked: true });
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggleLock = vi.fn();
    render(
      <CharacterList
        characters={[c]}
        loading={false}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleLock={onToggleLock}
        onAdd={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(onEdit).toHaveBeenCalledWith(c);

    fireEvent.click(screen.getByRole('button', { name: '解锁' }));
    expect(onToggleLock).toHaveBeenCalledWith('c1');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it('未锁定人物显示锁定按钮', () => {
    const c = makeChar({ locked: false });
    render(<CharacterList characters={[c]} loading={false} {...baseProps} />);
    expect(screen.getByRole('button', { name: '锁定' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '解锁' })).not.toBeInTheDocument();
  });
});