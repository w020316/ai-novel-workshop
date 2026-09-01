import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, type ButtonProps } from './button';

function renderButton(props: ButtonProps = {}) {
  return render(<Button {...props}>点击</Button>);
}

describe('Button', () => {
  it('渲染为 button 并显示子内容', () => {
    renderButton();
    const btn = screen.getByRole('button', { name: '点击' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveTextContent('点击');
  });

  it('不同 variant 应用对应样式类', () => {
    const { rerender } = renderButton({ variant: 'default' });
    expect(screen.getByRole('button')).toHaveClass('bg-brand-600');

    rerender(<Button variant="outline">点击</Button>);
    expect(screen.getByRole('button')).toHaveClass('border');
    expect(screen.getByRole('button')).toHaveClass('border-stone-300');

    rerender(<Button variant="ghost">点击</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');

    rerender(<Button variant="destructive">点击</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-accent-600');
  });

  it('不同 size 应用对应尺寸类', () => {
    const { rerender } = renderButton({ size: 'sm' });
    expect(screen.getByRole('button')).toHaveClass('h-8');

    rerender(<Button size="md">点击</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-10');

    rerender(<Button size="lg">点击</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-12');

    rerender(<Button size="icon">点击</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-10');
  });

  it('合并自定义 className', () => {
    renderButton({ className: 'my-custom-class' });
    expect(screen.getByRole('button')).toHaveClass('my-custom-class');
  });

  it('点击触发 onClick 回调', () => {
    const onClick = vi.fn();
    renderButton({ onClick });
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled 时禁用触发并应用禁用类', () => {
    const onClick = vi.fn();
    renderButton({ disabled: true, onClick });
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn).toHaveClass('disabled:opacity-50');
  });

  it('透传原生 button 属性', () => {
    renderButton({ type: 'submit', 'data-testid': 'submit-btn' });
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('type', 'submit');
    expect(btn).toHaveAttribute('data-testid', 'submit-btn');
  });

  it('正确转发 ref', () => {
    let current: HTMLButtonElement | null = null;
    render(<Button ref={(el) => { current = el; }}>点击</Button>);
    expect(current).toBeInstanceOf(HTMLButtonElement);
    current = null;
  });
});