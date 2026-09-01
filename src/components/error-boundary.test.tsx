import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';

const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(() => {
  consoleSpy.mockClear();
});

function GoodChild() {
  return <div>正常内容</div>;
}

describe('ErrorBoundary', () => {
  it('子组件正常渲染时不触发错误态', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('子组件抛错时展示错误信息与重试按钮', () => {
    const Bomb = () => {
      throw new Error('崩溃了');
    };
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('崩溃了')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('点击重试后恢复渲染子组件', () => {
    let shouldThrow = true;
    const ToggleBomb = () => {
      if (shouldThrow) throw new Error('第一次异常');
      return <div>已恢复</div>;
    };
    render(
      <ErrorBoundary>
        <ToggleBomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('第一次异常')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.getByText('已恢复')).toBeInTheDocument();
  });

  it('支持自定义 fallback 渲染', () => {
    const Bomb = () => {
      throw new Error('boom');
    };
    render(
      <ErrorBoundary fallback={<div>自定义兜底</div>}>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('自定义兜底')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  });
});