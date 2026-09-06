// ============================================================================
// 润色版本历史 Hook（可复用）
// 职责：为 AI 润色/完善类操作提供「快照 → 回退」能力：
// 1. 应用 AI 结果前调用 record() 记录当前值；
// 2. undo() 回退上一版；restoreAt(i) 回退到历史中任意版本；
// 3. 回退到某个版本后，该版本之后的记录移除（可重新润色生成新记录）。
// ============================================================================
'use client';

import { useCallback, useState } from 'react';

export interface VersionSnapshot<T> {
  /** 快照值 */
  value: T;
  /** 记录时间戳 */
  at: number;
  /** 来源说明（如「AI 润色前」） */
  label: string;
}

export function useVersionHistory<T>(max = 20) {
  const [history, setHistory] = useState<VersionSnapshot<T>[]>([]);

  /** 在应用新结果前记录当前值快照（超出上限时丢弃最早的记录） */
  const record = useCallback(
    (value: T, label = '润色前') => {
      setHistory((prev) => [...prev, { value, at: Date.now(), label }].slice(-max));
    },
    [max]
  );

  /** 回退上一版：移除并返回最近的快照；无历史时返回 null */
  const undo = useCallback((): T | null => {
    if (history.length === 0) return null;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    return last.value;
  }, [history]);

  /** 回退到历史中任意版本：返回该快照值，并清除该快照及其后的记录 */
  const restoreAt = useCallback(
    (index: number): T | null => {
      if (index < 0 || index >= history.length) return null;
      const snap = history[index];
      setHistory((prev) => prev.slice(0, index));
      return snap.value;
    },
    [history]
  );

  /** 清空历史（保存成功后可调用） */
  const clear = useCallback(() => setHistory([]), []);

  return { history, record, undo, restoreAt, clear };
}
