import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenerationProgress } from './GenerationProgress';
import type { GenerationStage } from '@/types';

describe('GenerationProgress', () => {
  it('非完成状态显示"正在生成..."', () => {
    render(<GenerationProgress stage="plot_designing" />);
    expect(screen.getByText('正在生成...')).toBeInTheDocument();
  });

  it('渲染全部阶段标签', () => {
    render(<GenerationProgress stage="memory_assembling" />);
    expect(screen.getByText('记忆装配')).toBeInTheDocument();
    expect(screen.getByText('剧情设计')).toBeInTheDocument();
    expect(screen.getByText('文笔创作')).toBeInTheDocument();
    expect(screen.getByText('一致性校验')).toBeInTheDocument();
    expect(screen.getByText('记忆更新')).toBeInTheDocument();
  });

  it('当前阶段高亮为进行中', () => {
    render(<GenerationProgress stage="writing" />);
    // writing 是第 3 个阶段，index 2
    expect(screen.getByText('文笔创作')).toHaveClass('text-brand-600');
  });

  it('completed 显示"生成完成"，全部阶段为完成态', () => {
    render(<GenerationProgress stage="completed" />);
    expect(screen.getByText('生成完成')).toBeInTheDocument();
    expect(screen.queryByText('正在生成...')).not.toBeInTheDocument();
  });

  it('failed 显示"生成失败"', () => {
    render(<GenerationProgress stage="failed" />);
    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.queryByText('正在生成...')).not.toBeInTheDocument();
  });
});