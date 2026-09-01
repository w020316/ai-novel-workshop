import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input, Textarea, Label } from './input';

describe('Input', () => {
  it('渲染为 input 元素', () => {
    render(<Input placeholder="请输入" />);
    const el = screen.getByPlaceholderText('请输入');
    expect(el.tagName).toBe('INPUT');
    expect(el).toHaveClass('h-10');
  });

  it('受控值渲染与 onChange 回调', () => {
    const onChange = vi.fn();
    render(<Input value="hello" onChange={onChange} />);
    const el = screen.getByDisplayValue('hello') as HTMLInputElement;
    fireEvent.change(el, { target: { value: 'world' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disabled 时禁用', () => {
    render(<Input disabled placeholder="禁用" />);
    expect(screen.getByPlaceholderText('禁用')).toBeDisabled();
  });

  it('合并自定义 className 并透传属性', () => {
    render(<Input className="extra-x" data-testid="ipt" aria-label="输入框" />);
    const el = screen.getByTestId('ipt');
    expect(el).toHaveClass('extra-x');
    expect(el).toHaveAttribute('aria-label', '输入框');
  });
});

describe('Textarea', () => {
  it('渲染为 textarea 元素', () => {
    render(<Textarea placeholder="正文" />);
    const el = screen.getByPlaceholderText('正文');
    expect(el.tagName).toBe('TEXTAREA');
    expect(el).toHaveClass('min-h-[80px]');
  });

  it('onChange 回调与 value 渲染', () => {
    const onChange = vi.fn();
    render(<Textarea value="abc" onChange={onChange} />);
    const el = screen.getByDisplayValue('abc') as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: 'xyz' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(el).toHaveClass('w-full');
  });
});

describe('Label', () => {
  it('渲染为 label 并显示文本', () => {
    render(<Label htmlFor="field">字段名</Label>);
    const el = screen.getByText('字段名');
    expect(el.tagName).toBe('LABEL');
    expect(el).toHaveAttribute('for', 'field');
    expect(el).toHaveClass('text-sm');
  });
});