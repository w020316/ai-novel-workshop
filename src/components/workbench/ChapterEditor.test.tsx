import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChapterEditor } from './ChapterEditor';

describe('ChapterEditor', () => {
  it('渲染正文内容与字数统计', () => {
    render(<ChapterEditor content="你好世界" onChange={vi.fn()} onRewrite={vi.fn()} />);
    expect(screen.getByDisplayValue('你好世界')).toBeInTheDocument();
    // 字数只统计中文字符
    expect(screen.getByText('4 字')).toBeInTheDocument();
  });

  it('编辑内容触发 onChange', () => {
    const onChange = vi.fn();
    render(<ChapterEditor content="旧内容" onChange={onChange} onRewrite={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('旧内容'), { target: { value: '新内容' } });
    expect(onChange).toHaveBeenCalledWith('新内容');
  });

  it('点击重写段落展开面板，再次点击收起', () => {
    render(<ChapterEditor content="正文" onChange={vi.fn()} onRewrite={vi.fn()} />);
    expect(screen.queryByText('请在正文中选中要重写的段落')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('重写段落'));
    expect(screen.getByText('请在正文中选中要重写的段落')).toBeInTheDocument();

    fireEvent.click(screen.getByText('重写段落'));
    expect(screen.queryByText('请在正文中选中要重写的段落')).not.toBeInTheDocument();
  });

  it('未选中文本时确认重写按钮禁用', () => {
    render(<ChapterEditor content="正文内容" onChange={vi.fn()} onRewrite={vi.fn()} />);
    fireEvent.click(screen.getByText('重写段落'));
    expect(screen.getByText('请在正文中选中要重写的段落')).toBeInTheDocument();
    const confirm = screen.getByText('确认重写') as HTMLButtonElement;
    expect(confirm).toBeDisabled();
  });

  it('选中文本并填写指令后提交 onRewrite', () => {
    const onRewrite = vi.fn();
    render(<ChapterEditor content="这是待重写的一段文字" onChange={vi.fn()} onRewrite={onRewrite} />);
    const textarea = screen.getByDisplayValue('这是待重写的一段文字') as HTMLTextAreaElement;

    fireEvent.click(screen.getByText('重写段落'));
    // 模拟选中前 4 个字符
    Object.defineProperty(textarea, 'selectionStart', { value: 0, configurable: true });
    Object.defineProperty(textarea, 'selectionEnd', { value: 4, configurable: true });
    fireEvent.select(textarea);
    fireEvent.mouseUp(textarea);

    expect(screen.getByText('已选中 4 个字符')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/输入重写要求/), { target: { value: '让人物更幽默' } });
    fireEvent.click(screen.getByText('确认重写'));

    expect(onRewrite).toHaveBeenCalledWith({ start: 0, end: 4, instruction: '让人物更幽默' });
    // 提交后面板关闭、指令清空
    expect(screen.queryByText('已选中 4 个字符')).not.toBeInTheDocument();
  });

  it('取消按钮关闭面板', () => {
    render(<ChapterEditor content="正文" onChange={vi.fn()} onRewrite={vi.fn()} />);
    fireEvent.click(screen.getByText('重写段落'));
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('请在正文中选中要重写的段落')).not.toBeInTheDocument();
  });

  it('disabled 时正文与重写按钮均禁用', () => {
    render(<ChapterEditor content="正文" onChange={vi.fn()} onRewrite={vi.fn()} disabled />);
    expect(screen.getByDisplayValue('正文')).toBeDisabled();
    expect(screen.getByText('重写段落').closest('button')).toBeDisabled();
  });

  it('内容为空时字数为 0', () => {
    render(<ChapterEditor content="" onChange={vi.fn()} onRewrite={vi.fn()} />);
    expect(screen.getByText('0 字')).toBeInTheDocument();
  });
});