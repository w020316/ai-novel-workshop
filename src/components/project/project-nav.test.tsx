import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProjectNav } from './project-nav';

vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// 在 usePathname 之上提供可变的当前路径
const usePathnameMock = vi.hoisted(() => vi.fn(() => '/project/p1'));
vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

describe('ProjectNav', () => {
  it('渲染全部导航项并生成正确的 href', () => {
    usePathnameMock.mockReturnValue('/project/p1');
    render(<ProjectNav projectId="p1" />);
    expect(screen.getByRole('link', { name: '概览' })).toHaveAttribute(
      'href',
      '/project/p1'
    );
    expect(screen.getByRole('link', { name: '创作工作台' })).toHaveAttribute(
      'href',
      '/project/p1/workbench'
    );
    expect(screen.getByRole('link', { name: '设定工坊' })).toHaveAttribute(
      'href',
      '/project/p1/settings/worldview'
    );
    expect(screen.getByRole('link', { name: '记忆管理' })).toHaveAttribute(
      'href',
      '/project/p1/memory'
    );
    expect(screen.getByRole('link', { name: '导出中心' })).toHaveAttribute(
      'href',
      '/project/p1/export'
    );
  });

  it('概览项在路径匹配时高亮', () => {
    usePathnameMock.mockReturnValue('/project/p1');
    render(<ProjectNav projectId="p1" />);
    expect(screen.getByRole('link', { name: '概览' })).toHaveClass('bg-brand-100');
    expect(screen.getByRole('link', { name: '创作工作台' })).not.toHaveClass(
      'bg-brand-100'
    );
  });

  it('子路径导航项高亮（startsWith 匹配）', () => {
    usePathnameMock.mockReturnValue('/project/p1/workbench/chapter/3');
    render(<ProjectNav projectId="p1" />);
    expect(screen.getByRole('link', { name: '创作工作台' })).toHaveClass(
      'bg-brand-100'
    );
    expect(screen.getByRole('link', { name: '概览' })).not.toHaveClass(
      'bg-brand-100'
    );
  });
});

describe('ProjectNav 移动端抽屉', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/project/p1');
  });

  it('吸顶栏展示书名与当前分区，抽屉默认收起', () => {
    render(<ProjectNav projectId="p1" title="测试书名" />);
    expect(screen.getByText('测试书名')).toBeInTheDocument();
    expect(screen.getAllByText('概览').length).toBeGreaterThan(0); // 分区徽标
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('点击汉堡按钮打开抽屉，抽屉内含全部导航项', () => {
    render(<ProjectNav projectId="p1" title="测试书名" />);
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '健康体检' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '多平台审稿' })).toBeInTheDocument();
    expect(within(dialog).getAllByRole('link')).toHaveLength(8);
  });

  it('点击遮罩关闭抽屉', () => {
    render(<ProjectNav projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭导航' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('按 Esc 关闭抽屉', () => {
    render(<ProjectNav projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('路由变化后抽屉自动收起', () => {
    usePathnameMock.mockReturnValue('/project/p1');
    const { rerender } = render(<ProjectNav projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    usePathnameMock.mockReturnValue('/project/p1/export');
    rerender(<ProjectNav projectId="p1" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('抽屉打开期间锁定背景滚动，关闭后恢复', () => {
    render(<ProjectNav projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: '关闭导航' }));
    expect(document.body.style.overflow).toBe('');
  });
});