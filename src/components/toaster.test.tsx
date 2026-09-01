import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from './toaster';

const { ToasterMock } = vi.hoisted(() => ({
  ToasterMock: vi.fn((props: Record<string, unknown>) => (
    <div data-testid="toaster" />
  )),
}));

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => ToasterMock(props),
}));

describe('Toaster', () => {
  it('渲染 sonner Toaster 并配置顶部右侧展示', () => {
    render(<Toaster />);
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
    expect(ToasterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        position: 'top-right',
        richColors: true,
        closeButton: true,
      })
    );
  });

  it('透传自定义 toast 选项', () => {
    render(<Toaster />);
    const props = ToasterMock.mock.calls[0][0] as {
      toastOptions?: { duration?: number; classNames?: Record<string, string> };
    };
    expect(props.toastOptions?.duration).toBe(4000);
    expect(props.toastOptions?.classNames?.toast).toContain('rounded-md');
  });
});