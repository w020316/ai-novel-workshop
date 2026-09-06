import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVersionHistory } from './use-version-history';

describe('useVersionHistory（润色版本历史）', () => {
  it('record 记录快照，undo 回退上一版', () => {
    const { result } = renderHook(() => useVersionHistory<string>());
    expect(result.current.undo()).toBeNull();

    act(() => result.current.record('v1', '润色前'));
    act(() => result.current.record('v2', '润色前'));
    expect(result.current.history).toHaveLength(2);

    let restored: string | null = null;
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBe('v2');
    expect(result.current.history).toHaveLength(1);

    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBe('v1');
    expect(result.current.history).toHaveLength(0);
    expect(result.current.undo()).toBeNull();
  });

  it('restoreAt 回退到任意历史版本，并清除该版本之后的记录', () => {
    const { result } = renderHook(() => useVersionHistory<string>());
    act(() => {
      result.current.record('v1');
      result.current.record('v2');
      result.current.record('v3');
    });

    let restored: string | null = null;
    act(() => {
      restored = result.current.restoreAt(0); // 回退到最早的 v1
    });
    expect(restored).toBe('v1');
    expect(result.current.history).toHaveLength(0); // v1 之后的记录全部清除

    act(() => {
      result.current.record('v1-again');
      result.current.record('v2-again');
    });
    act(() => {
      restored = result.current.restoreAt(0);
    });
    expect(restored).toBe('v1-again');
  });

  it('restoreAt 越界索引返回 null', () => {
    const { result } = renderHook(() => useVersionHistory<string>());
    act(() => result.current.record('v1'));
    expect(result.current.restoreAt(5)).toBeNull();
    expect(result.current.restoreAt(-1)).toBeNull();
    expect(result.current.history).toHaveLength(1); // 越界不影响历史
  });

  it('超出上限时丢弃最早的记录', () => {
    const { result } = renderHook(() => useVersionHistory<number>(3));
    act(() => {
      for (const v of [1, 2, 3, 4, 5]) result.current.record(v);
    });
    expect(result.current.history).toHaveLength(3);
    expect(result.current.history.map((s) => s.value)).toEqual([3, 4, 5]);
    expect(result.current.history[0].label).toBe('润色前');
  });

  it('clear 清空历史', () => {
    const { result } = renderHook(() => useVersionHistory<string>());
    act(() => result.current.record('v1'));
    act(() => result.current.clear());
    expect(result.current.history).toHaveLength(0);
    expect(result.current.undo()).toBeNull();
  });
});
