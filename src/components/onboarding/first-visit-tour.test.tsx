// ============================================================================
// 首访引导组件单测
// ============================================================================
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FirstVisitTour } from './first-visit-tour';

const KEY = 'ai-novel-tour-done-v1';
// 与组件内延时一致
const DELAY = 900;

describe('FirstVisitTour 首访引导', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('首次访问延时后展示引导', () => {
    render(<FirstVisitTour />);
    // 未到延时：不渲染
    expect(screen.queryByText(/首次上手/)).toBeNull();
    // 推进到延时后
    act(() => {
      vi.advanceTimersByTime(DELAY + 50);
    });
    expect(screen.getByText(/首次上手/)).toBeTruthy();
  });

  it('已完成引导（localStorage 已记录）则不再展示', () => {
    localStorage.setItem(KEY, '1');
    render(<FirstVisitTour />);
    act(() => {
      vi.advanceTimersByTime(DELAY + 50);
    });
    expect(screen.queryByText(/首次上手/)).toBeNull();
  });

  it('可下一步/上一步切换，进度更新', () => {
    render(<FirstVisitTour />);
    act(() => {
      vi.advanceTimersByTime(DELAY + 50);
    });
    expect(screen.getByText(/从灵感与世界观开始/)).toBeTruthy();
    act(() => void fireEvent.click(screen.getByText('下一步')));
    expect(screen.getByText(/分阶段一站式创作/)).toBeTruthy();
    act(() => void fireEvent.click(screen.getByText('下一步')));
    expect(screen.getByText('开始创作')).toBeTruthy();
    act(() => void fireEvent.click(screen.getByText('上一步')));
    expect(screen.getByText(/分阶段一站式创作/)).toBeTruthy();
  });

  it('完成时写入 localStorage 并关闭', () => {
    render(<FirstVisitTour />);
    act(() => {
      vi.advanceTimersByTime(DELAY + 50);
    });
    expect(screen.getByText(/首次上手/)).toBeTruthy();
    act(() => void fireEvent.click(screen.getByText('下一步')));
    act(() => void fireEvent.click(screen.getByText('下一步')));
    act(() => void fireEvent.click(screen.getByText('开始创作')));
    expect(localStorage.getItem(KEY)).toBe('1');
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.queryByText(/首次上手/)).toBeNull();
  });
});