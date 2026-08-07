'use client';

import type { GenerationStage } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface GenerationProgressProps {
  stage: GenerationStage;
}

const STAGES: { key: GenerationStage; label: string }[] = [
  { key: 'memory_assembling', label: '记忆装配' },
  { key: 'plot_designing', label: '剧情设计' },
  { key: 'writing', label: '文笔创作' },
  { key: 'consistency_checking', label: '一致性校验' },
  { key: 'memory_updating', label: '记忆更新' },
];

export function GenerationProgress({ stage }: GenerationProgressProps) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage);
  const isFailed = stage === 'failed';
  const isCompleted = stage === 'completed';

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <h3 className="text-sm font-medium text-stone-700">
          {isCompleted ? '生成完成' : isFailed ? '生成失败' : '正在生成...'}
        </h3>
        <div className="space-y-2">
          {STAGES.map((s, i) => {
            const isActive = i === currentIndex && !isCompleted && !isFailed;
            const isDone = i < currentIndex || isCompleted;
            const isError = isFailed && i === currentIndex;

            return (
              <div key={s.key} className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                ) : isError ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-xs text-red-500">!</span>
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-stone-100 text-xs text-stone-400">
                    {i + 1}
                  </span>
                )}
                <span
                  className={`text-sm ${
                    isDone
                      ? 'text-stone-500'
                      : isActive
                        ? 'font-medium text-brand-600'
                        : isError
                          ? 'text-red-500'
                          : 'text-stone-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}