import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DatabaseInitializer } from './providers';

const { seedMock } = vi.hoisted(() => ({ seedMock: vi.fn() }));
vi.mock('@/lib/db/seed', () => ({
  seedDatabase: () => seedMock(),
}));

const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('DatabaseInitializer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始化完成前展示加载指示器', () => {
    seedMock.mockReturnValue(new Promise(() => {}));
    render(
      <DatabaseInitializer>
        <div>应用内容</div>
      </DatabaseInitializer>
    );
    expect(screen.queryByText('应用内容')).not.toBeInTheDocument();
  });

  it('seedDatabase 成功后渲染子内容', async () => {
    seedMock.mockResolvedValue(undefined);
    render(
      <DatabaseInitializer>
        <div>应用内容</div>
      </DatabaseInitializer>
    );
    expect(await screen.findByText('应用内容')).toBeInTheDocument();
    expect(seedMock).toHaveBeenCalledTimes(1);
  });

  it('seedDatabase 失败时仍渲染子内容', async () => {
    seedMock.mockRejectedValue(new Error('注入失败'));
    render(
      <DatabaseInitializer>
        <div>降级内容</div>
      </DatabaseInitializer>
    );
    expect(await screen.findByText('降级内容')).toBeInTheDocument();
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());
  });
});