'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackHomeLink } from '@/components/back-home';
import { useProjectStore } from '@/lib/store/project-store';
import { listDeletedProjects, purgeProject } from '@/lib/db/queries';
import { formatTime } from '@/lib/utils';
import { Loader2, Trash2, Undo2, Trash } from 'lucide-react';
import { toast } from 'sonner';
import type { NovelProject } from '@/types';

export default function TrashPage() {
  const { restoreProject, purgeProject } = useProjectStore();
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listDeletedProjects();
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) toast.error('加载回收站失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    const list = await listDeletedProjects();
    setProjects(list);
  };

  // 恢复：清空删除标记，项目回到正常列表
  const handleRestore = async (id: string) => {
    setBusyId(id);
    try {
      await restoreProject(id);
      toast.success('项目已恢复，回到正常列表');
      await reload();
    } catch {
      toast.error('恢复失败');
    } finally {
      setBusyId(null);
    }
  };

  // 彻底删除：级联清除全部数据，不可恢复
  const handlePurge = async (project: NovelProject) => {
    if (!confirm(`确认彻底删除「${project.title}」？此操作不可恢复，所有章节与设定将被永久清除。`)) return;
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

  // 清空回收站：逐个级联彻底删除
  const handleEmptyTrash = async () => {
    if (projects.length === 0) return;
    if (!confirm(`确认清空回收站？共 ${projects.length} 个项目将被彻底删除，此操作不可恢复。`)) return;
    setEmptying(true);
    try {
      for (const p of projects) {
        await purgeProject(p.id);
      }
      toast.success('回收站已清空');
      await reload();
    } catch {
      toast.error('清空回收站失败');
      await reload();
    } finally {
      setEmptying(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-800">回收站</h1>
          <p className="mt-1 text-sm text-stone-500">已删除的项目保留在此，可恢复或彻底删除</p>
        </div>
        <div className="flex items-center gap-4">
          {projects.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleEmptyTrash} disabled={emptying}>
              {emptying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  清空中…
                </>
              ) : (
                <>
                  <Trash className="mr-2 h-4 w-4" />
                  清空回收站
                </>
              )}
            </Button>
          )}
          <BackHomeLink />
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-stone-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-paper-50 p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <Trash2 className="h-8 w-8 text-brand-500" />
          </div>
          <h3 className="mb-2 text-lg font-serif font-semibold text-stone-800">回收站是空的</h3>
          <p className="text-sm text-stone-500">删除的项目会先移入这里，确认不再需要时再彻底删除。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-serif text-xl text-stone-700">{project.title}</CardTitle>
                  <span className="inline-flex shrink-0 rounded-full bg-accent-600/10 px-2.5 py-0.5 text-xs font-medium text-accent-700">
                    已删除
                  </span>
                </div>
                <p className="text-xs text-stone-500">{project.genre}</p>
              </CardHeader>
              <CardContent>
                <p className="mb-3 line-clamp-2 min-h-[2.5rem] text-sm text-stone-600">
                  {project.summary || '暂无简介'}
                </p>

                {/* 删除时间 */}
                <div className="mb-3 text-xs text-stone-400">
                  删除于 {project.deletedAt ? formatTime(project.deletedAt) : '未知时间'}
                </div>

                {/* 操作区 */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === project.id || emptying}
                    onClick={() => handleRestore(project.id)}
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    恢复
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-accent-700 hover:text-accent-800"
                    disabled={busyId === project.id || emptying}
                    onClick={() => handlePurge(project)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    彻底删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
