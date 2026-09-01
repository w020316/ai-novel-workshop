import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('EmptyState', () => {
  it('渲染标题与引导文案', () => {
    render(<EmptyState />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      '还没有任何小说项目'
    );
    expect(
      screen.getByText(/从一个灵感开始吧/)
    ).toBeInTheDocument();
  });

  it('提供跳转新建项目的链接和按钮', () => {
    render(<EmptyState />);
    const link = screen.getByRole('link', { name: /创建第一部小说/ });
    expect(link).toHaveAttribute('href', '/project/new');
    expect(screen.getByRole('button', { name: /创建第一部小说/ })).toBeInTheDocument();
  });
});