import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CharacterRelationGraph } from './CharacterRelationGraph';
import type { Character, CharacterRole } from '@/types';

const { getRoleLabelMock } = vi.hoisted(() => ({ getRoleLabelMock: vi.fn() }));

vi.mock('@/lib/character/template', () => ({
  getRoleLabel: (r: CharacterRole) => getRoleLabelMock(r),
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
    appearance: 'a',
    personality: 'p',
    catchphrase: 'c',
    background: 'b',
    motivation: 'm',
    weakness: 'w',
    growthArc: 'g',
    relationships: [],
    speechStyle: 's',
    behaviorPattern: 'b',
    locked: false,
    updatedAt: 1,
    ...overrides,
  };
}

describe('CharacterRelationGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRoleLabelMock.mockImplementation((r: CharacterRole) => ROLE_LABELS[r] ?? String(r));
  });

  it('无人物时不渲染任何内容', () => {
    const { container } = render(<CharacterRelationGraph characters={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('渲染关系图标题、节点与关系计数、图例', () => {
    const a = makeChar({
      id: 'a',
      name: '李云渊',
      relationships: [{ targetId: 'b', targetName: '王小二', relation: '伙伴' }],
    });
    const b = makeChar({ id: 'b', name: '王小二', role: 'supporting' });
    render(<CharacterRelationGraph characters={[a, b]} />);

    expect(screen.getByRole('img', { name: '人物关系图' })).toBeInTheDocument();
    expect(screen.getByText('关系图')).toBeInTheDocument();
    expect(screen.getByText('2 节点 · 1 关系')).toBeInTheDocument();
    // 角色名与关系标签
    expect(screen.getByText('李云渊')).toBeInTheDocument();
    expect(screen.getByText('王小二')).toBeInTheDocument();
    expect(screen.getByText('伙伴')).toBeInTheDocument();
    // 图例（角色名在节点与图例中可能出现多次）
    expect(screen.getAllByText('主角').length).toBeGreaterThan(0);
    expect(screen.getAllByText('反派').length).toBeGreaterThan(0);
    expect(screen.getAllByText('配角').length).toBeGreaterThan(0);
    expect(screen.getAllByText('次要').length).toBeGreaterThan(0);
  });

  it('双向重复关系去重只统计一次', () => {
    const a = makeChar({
      id: 'a',
      name: '李云渊',
      relationships: [{ targetId: 'b', targetName: '王小二', relation: '宿敌' }],
    });
    const b = makeChar({
      id: 'b',
      name: '王小二',
      role: 'antagonist',
      relationships: [{ targetId: 'a', targetName: '李云渊', relation: '宿敌' }],
    });
    render(<CharacterRelationGraph characters={[a, b]} />);
    expect(screen.getByText('2 节点 · 1 关系')).toBeInTheDocument();
  });

  it('点击节点调用 onSelect 并传入人物 id', () => {
    const a = makeChar({ id: 'a', name: '李云渊' });
    const b = makeChar({ id: 'b', name: '王小二', role: 'supporting' });
    const onSelect = vi.fn();
    render(<CharacterRelationGraph characters={[a, b]} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('王小二'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('无关系连线时给出提示', () => {
    const a = makeChar({ id: 'a', name: '李云渊' });
    render(<CharacterRelationGraph characters={[a]} />);
    expect(screen.getByText('1 节点 · 0 关系')).toBeInTheDocument();
    expect(
      screen.getByText('暂无关系连线 · 在人物编辑表单中可添加')
    ).toBeInTheDocument();
  });
});