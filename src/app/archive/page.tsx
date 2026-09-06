'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackHomeLink } from '@/components/back-home';
import { useProjectStore } from '@/lib/store/project-store';
import { listArchivedProjects, getProjectStats } from '@/lib/db/queries';
import { formatTime } from '@/lib/utils';
import { Loader2, ArchiveRestore, Trash2, ArchiveX, FileStack } from 'lucide-react';
import { toast } from 'sonner';
import type { NovelProject } from '@/types';

interface StatsMap {
  [projectId: string]: { totalWords: number; totalChapters: number; completedChapters: number };
}

export default function ArchivePage() {
  const { updateProject, deleteProject, purgeProject } = useProjectStore();
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [statsMap, setStatsMap] = useState<StatsMap>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listArchivedProjects();
        if (cancelled) return;
        setProjects(list);
        // 并行加载统计信息
        const entries = await Promise.all(
          list.map(async (p) => [p.id, await getProjectStats(p.id)] as const)
        );
        if (cancelled) return;
        const map: StatsMap = {};
        for (const [id, stats] of entries) map[id] = stats;
        setStatsMap(map);
      } catch {
        if (!cancelled) toast.error('加载归档项目失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    const list = await listArchivedProjects();
    setProjects(list);
  };

  // 取消归档：恢复为草稿状态，回到正常列表
  const handleUnarchive = async (id: string) => {
    setBusyId(id);
    try {
      await updateProject(id, { status: 'drafting' });
      toast.success('已取消归档，项目回到正常列表');
      await reload();
    } catch {
      toast.error('取消归档失败');
    } finally {
      setBusyId(null);
    }
  };

  // 删除：软删除，移入回收站
  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteProject(id);
      toast.success('已移入回收站，可在回收站恢复');
      await reload();
    } catch {
      toast.error('删除失败');
    } finally {
      setBusyId(null);
    }
  };

  // 彻底删除：级联清除全部数据，不可恢复
  const handlePurge = async (project: NovelProject) => {
    if (!confirm(`确认彻底删除「${project.title}」？此操作不可撤销，所有章节与设定将被永久清除。`)) return;
    setBusyId(project.id);
    try {
      await purgeProject(project.id);
      toast.success('项目已彻底删除');
      await reload();
    } catch {
      toast.error('彻底删除失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-800">归档管理</h1>
          <p className="mt-1 text-sm text-stone-500">管理已归档的小说项目，可取消归档、移入回收站或彻底删除</p>
        </div>
        <BackHomeLink />
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-stone-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-paper-50 p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <FileStack className="h-8 w-8 text-brand-500" />
          </div>
          <h3 className="mb-2 text-lg font-serif font-semibold text-stone-800">暂无归档项目</h3>
          <p className="text-sm text-stone-500">在项目卡片或项目配置中选择「归档」，即可将完成阶段的作品收纳到这里。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const stats = statsMap[project.id] ?? { totalWords: 0, totalChapters: 0, completedChapters: 0 };
            const progress =
              project.targetWords > 0
                ? Math.min(100, Math.round((stats.totalWords / project.targetWords) * 100))
                : 0;
            return (
              <Card key={project.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/project/${project.id}`} className="flex-1">
                      <CardTitle className="font-serif text-xl text-brand-800 transition-colors hover:text-brand-600">
                        {project.title}
                      </CardTitle>
                    </Link>
                    <span className="inline-flex shrink-0 rounded-full bg-stone-50 px-2.5 py-0.5 text-xs font-medium text-stone-400">
                      已归档
                    </span>
                  </div>
                  <p className="text-xs text-stone-500">{project.genre}</p>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 line-clamp-2 min-h-[2.5rem] text-sm text-stone-600">
                    {project.summary || '暂无简介'}
                  </p>

                  {/* 字数进度 */}
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

                  <div className="mb-3 text-xs text-stone-400">更新于 {formatTime(project.updatedAt)}</div>

                  {/* 操作区 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === project.id}
                      onClick={() => handleUnarchive(project.id)}
                    >
                      <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                      取消归档
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === project.id}
                      onClick={() => handleDelete(project.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      删除
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-accent-700 hover:text-accent-800"
                      disabled={busyId === project.id}
                      onClick={() => handlePurge(project)}
                    >
                      <ArchiveX className="mr-1 h-3.5 w-3.5" />
                      彻底删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
