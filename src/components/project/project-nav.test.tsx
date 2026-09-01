import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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