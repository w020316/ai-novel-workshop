import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChapterGenerator } from './ChapterGenerator';
import type { GenerationStage } from '@/types';

function Harness({
  onTitleChange = vi.fn(),
  onPlotPointsChange = vi.fn(),
  onGenerate = vi.fn(),
  onAbort = vi.fn(),
  generating = false,
  stage = null,
  hasExistingContent = false,
}: {
  onTitleChange?: (t: string) => void;
  onPlotPointsChange?: (p: string[]) => void;
  onGenerate?: () => void;
  onAbort?: () => void;
  generating?: boolean;
  stage?: GenerationStage | null;
  hasExistingContent?: boolean;
}) {
  const [title, setTitle] = useState('初始标题');
  const [plots, setPlots] = useState<string[]>(['要点A', '要点B']);

  return (
    <ChapterGenerator
      title={title}
      onTitleChange={(t) => { setTitle(t); onTitleChange(t); }}
      plotPoints={plots}
      onPlotPointsChange={(p) => { setPlots(p); onPlotPointsChange(p); }}
      generating={generating}
      stage={stage}
      onGenerate={onGenerate}
      onAbort={onAbort}
      hasExistingContent={hasExistingContent}
    />
  );
}

describe('ChapterGenerator', () => {
  it('渲染标题输入、剧情要点与生成按钮', () => {
    render(<Harness />);
    expect(screen.getByDisplayValue('初始标题')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('剧情要点 1')).toBeInTheDocument();
    expect(screen.getByText('生成控制')).toBeInTheDocument();
    expect(screen.getByText('开始生成')).toBeInTheDocument();
  });

  it('修改标题触发 onTitleChange', () => {
    const onTitleChange = vi.fn();
    render(<Harness onTitleChange={onTitleChange} />);
    fireEvent.change(screen.getByDisplayValue('初始标题'), { target: { value: '新标题' } });
    expect(onTitleChange).toHaveBeenCalledWith('新标题');
    expect(screen.getByDisplayValue('新标题')).toBeInTheDocument();
  });

  it('编辑剧情要点触发 onPlotPointsChange', () => {
    const onPlotPointsChange = vi.fn();
    render(<Harness onPlotPointsChange={onPlotPointsChange} />);
    fireEvent.change(screen.getByPlaceholderText('剧情要点 1'), { target: { value: '更新A' } });
    expect(onPlotPointsChange).toHaveBeenCalledWith(['更新A', '要点B']);
  });

  it('点击添加要点追加空要点', () => {
    const onPlotPointsChange = vi.fn();
    render(<Harness onPlotPointsChange={onPlotPointsChange} />);
    fireEvent.click(screen.getByText('添加要点'));
    expect(onPlotPointsChange).toHaveBeenCalledWith(['要点A', '要点B', '']);
    expect(screen.getByPlaceholderText('剧情要点 3')).toBeInTheDocument();
  });

  it('点击删除按钮移除对应要点', () => {
    const onPlotPointsChange = vi.fn();
    render(<Harness onPlotPointsChange={onPlotPointsChange} />);
    const removeButtons = screen.getAllByRole('button').filter((b) => b.textContent === '');
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[0]);
    expect(onPlotPointsChange).toHaveBeenCalledWith(['要点B']);
  });

  it('点击开始生成触发 onGenerate', () => {
    const onGenerate = vi.fn();
    render(<Harness onGenerate={onGenerate} />);
    fireEvent.click(screen.getByText('开始生成'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('hasExistingContent 时按钮文案为重新生成', () => {
    render(<Harness hasExistingContent />);
    expect(screen.getByText('重新生成')).toBeInTheDocument();
    expect(screen.queryByText('开始生成')).not.toBeInTheDocument();
  });

  it('generating 时显示生成中与停止按钮并调用 onAbort', () => {
    const onAbort = vi.fn();
    render(<Harness generating stage="writing" onAbort={onAbort} />);
    expect(screen.getByText('生成中...')).toBeInTheDocument();
    const stop = screen.getByText('停止生成');
    fireEvent.click(stop);
    expect(onAbort).toHaveBeenCalledTimes(1);
    // 停止按钮仅在 generating 时存在
    expect(screen.queryByText('开始生成')).not.toBeInTheDocument();
  });

  it('generating 时禁用标题输入', () => {
    render(<Harness generating />);
    expect(screen.getByDisplayValue('初始标题')).toBeDisabled();
  });

  it('展开生成参数并调整温度', () => {
    render(<Harness />);
    expect(screen.queryByText('Top-P')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('生成参数'));
    expect(screen.getByText(/温度 \(Temperature\)/)).toBeInTheDocument();
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
    fireEvent.change(sliders[0], { target: { value: '1.2' } });
    expect(screen.getByText(/温度 \(Temperature\): 1\.2/)).toBeInTheDocument();
  });
});