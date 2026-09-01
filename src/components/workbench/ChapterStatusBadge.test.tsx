import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChapterStatusBadge } from './ChapterStatusBadge';
import type { ChapterStatus } from '@/types';

describe('ChapterStatusBadge', () => {
  const cases: { status: ChapterStatus; label: string }[] = [
    { status: 'pending', label: '待生成' },
    { status: 'designing', label: '设计中' },
    { status: 'drafting', label: '撰写中' },
    { status: 'reviewing', label: '审核中' },
    { status: 'completed', label: '已完成' },
    { status: 'rewriting', label: '重写中' },
  ];

  it.each(cases)('status=$status 显示 "$label"', ({ status, label }) => {
    render(<ChapterStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('completed 应用绿色样式类', () => {
    render(<ChapterStatusBadge status="completed" />);
    expect(screen.getByText('已完成').closest('span')).toHaveClass('text-green-600');
  });

  it('pending 应用灰色样式类', () => {
    render(<ChapterStatusBadge status="pending" />);
    expect(screen.getByText('待生成').closest('span')).toHaveClass('text-stone-400');
  });
});