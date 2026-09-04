'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { NovelProject } from '@/types';
import { formatTime } from '@/lib/utils';
import { summarizePlan } from '@/lib/outline/volume-plan';

interface ProjectCardProps {
  project: NovelProject;
  stats: { totalWords: number; totalChapters: number; completedChapters: number };
  onArchive?: (id: string) => void;
}

const STATUS_LABEL: Record<NovelProject['status'], string> = {
  drafting: '草稿',
  ongoing: '连载中',
  completed: '已完结',
  archived: '已归档',
};

const STATUS_CLASS: Record<NovelProject['status'], string> = {
  drafting: 'bg-stone-100 text-stone-600',
  ongoing: 'bg-brand-50 text-brand-700',
  completed: 'bg-green-50 text-green-700',
  archived: 'bg-stone-50 text-stone-400',
};

export function ProjectCard({ project, stats, onArchive }: ProjectCardProps) {
  const progress =
    project.targetWords > 0
      ? Math.min(100, Math.round((stats.totalWords / project.targetWords) * 100))
      : 0;
  // 按目标字数预估最终卷/章规模（百万字长篇预期管理）
  const plan = summarizePlan(project.targetWords, project.genre);

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <Link href={`/project/${project.id}`} className="flex-1">
            <CardTitle className="font-serif text-xl text-brand-800 transition-colors group-hover:text-brand-600">
              {project.title}
            </CardTitle>
          </Link>
          <span
            className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[project.status]}`}
          >
            {STATUS_LABEL[project.status]}
          </span>
        </div>
        <p className="text-xs text-stone-500">{project.genre}</p>
      </CardHeader>
      <CardContent>
        <p className="mb-3 line-clamp-2 min-h-[2.5rem] text-sm text-stone-600">
          {project.summary || '暂无简介'}
        </p>

        {/* 进度 */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
            <span>{stats.totalWords.toLocaleString()} 字</span>
            <span>目标 {project.targetWords.toLocaleString()} 字</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-stone-400">
            <span>{stats.completedChapters} 章已完结 / {stats.totalChapters} 章</span>
            <span>{progress}%</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-stone-400">
            预估 {plan.volumeCount} 卷 · {plan.totalChapters} 章 · 更新于 {formatTime(project.updatedAt)}
          </span>
          <div className="flex gap-1">
            <Link href={`/project/${project.id}`}>
              <Button variant="ghost" size="sm">进入</Button>
            </Link>
            {onArchive && project.status !== 'archived' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onArchive(project.id)}
              >
                归档
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
