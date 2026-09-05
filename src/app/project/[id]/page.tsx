'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProjectStore } from '@/lib/store/project-store';
import { getProjectStats } from '@/lib/db/queries';
import { generateBookPackage, bookPackageToSummary } from '@/lib/llm/generators/book-package';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PenLine, Settings, Download, BarChart3, RefreshCw, Loader2 } from 'lucide-react';
import { formatTime } from '@/lib/utils';

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { currentProject, updateProject } = useProjectStore();
  const [stats, setStats] = useState({ totalWords: 0, totalChapters: 0, completedChapters: 0 });
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    getProjectStats(projectId).then(setStats);
  }, [projectId]);

  if (!currentProject) return null;

  /** 不满意当前设定：以书名+题材+现有简介为灵感，AI 重出一版（LLM 不可用时自动启发式兜底） */
  const handleRegenerateSetting = async () => {
    if (!window.confirm('将根据书名与题材重新生成一版设定（替换现有简介），确定？')) return;
    setRegenerating(true);
    try {
      const idea = [currentProject.title, currentProject.genre, currentProject.summary.slice(0, 120)]
        .filter(Boolean)
        .join('，');
      const bp = await generateBookPackage(idea);
      const summary = bookPackageToSummary(bp);
      await updateProject(projectId, { summary });
      toast.success('已换一版设定', {
        description: summary.slice(0, 80) + (summary.length > 80 ? '…' : ''),
      });
    } catch (e) {
      toast.error('重新生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRegenerating(false);
    }
  };

  const progress =
    currentProject.targetWords > 0
      ? Math.min(100, Math.round((stats.totalWords / currentProject.targetWords) * 100))
      : 0;

  const cards = [
    {
      label: '总字数',
      value: stats.totalWords.toLocaleString(),
      sub: `目标 ${currentProject.targetWords.toLocaleString()}`,
    },
    {
      label: '章节',
      value: stats.totalChapters,
      sub: `${stats.completedChapters} 章已完结`,
    },
    {
      label: '当前进度',
      value: `${progress}%`,
      sub: `第 ${currentProject.currentChapter} 章`,
    },
    {
      label: '题材',
      value: currentProject.genre,
      sub: currentProject.status,
    },
  ];

  const actions = [
    { href: `/project/${projectId}/settings/worldview`, label: '设定世界观', icon: Settings, desc: '构建世界规则与人物' },
    { href: `/project/${projectId}/workbench`, label: '开始创作', icon: PenLine, desc: '生成大纲与章节正文' },
    { href: `/project/${projectId}/dashboard`, label: '数据看板', icon: BarChart3, desc: '字数/进度/逐章趋势' },
    { href: `/project/${projectId}/export`, label: '导出作品', icon: Download, desc: 'TXT / EPUB / JSON 备份' },
  ];

  return (
    <div className="space-y-6">
      {/* 简介卡（设定） */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-stone-700">故事设定</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleRegenerateSetting}
                disabled={regenerating}
              >
                {regenerating ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AI 重出设定中…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    不满意？换一版设定
                  </>
                )}
              </Button>
              <Link href={`/project/${projectId}/config`}>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <PenLine className="h-3 w-3" />
                  手动编辑
                </Button>
              </Link>
            </div>
          </div>
          <p className="mb-4 text-sm text-stone-600">
            {currentProject.summary || '暂无简介，前往设定工坊补充世界观与人物档案'}
          </p>
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>创建于 {formatTime(currentProject.createdAt)}</span>
            <span>更新于 {formatTime(currentProject.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-5">
              <p className="text-xs text-stone-500">{c.label}</p>
              <p className="mt-1 text-2xl font-bold text-stone-800">{c.value}</p>
              <p className="mt-1 text-xs text-stone-400">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 进度条 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">写作进度</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-stone-500">
            {stats.totalWords.toLocaleString()} / {currentProject.targetWords.toLocaleString()} 字
          </p>
        </CardContent>
      </Card>

      {/* 快速入口 */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-stone-700">快速入口</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-3 pt-5">
                    <div className="rounded-md bg-brand-50 p-2">
                      <Icon className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-800">{a.label}</p>
                      <p className="text-xs text-stone-500">{a.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
