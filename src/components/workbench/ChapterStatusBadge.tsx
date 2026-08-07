'use client';

import type { ChapterStatus } from '@/types';
import { Clock, CheckCircle2, AlertCircle, PenLine, Eye, RefreshCw } from 'lucide-react';

interface ChapterStatusBadgeProps {
  status: ChapterStatus;
}

const STATUS_CONFIG: Record<ChapterStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: '待生成', color: 'text-stone-400 bg-stone-50 border-stone-200', icon: Clock },
  designing: { label: '设计中', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: PenLine },
  drafting: { label: '撰写中', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: RefreshCw },
  reviewing: { label: '审核中', color: 'text-purple-600 bg-purple-50 border-purple-200', icon: Eye },
  completed: { label: '已完成', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 },
  rewriting: { label: '重写中', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertCircle },
};

export function ChapterStatusBadge({ status }: ChapterStatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}