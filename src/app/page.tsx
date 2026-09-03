'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProjectStore } from '@/lib/store/project-store';
import { getProjectStats } from '@/lib/db/queries';
import { ProjectCard } from '@/components/project/project-card';
import { EmptyState } from '@/components/project/empty-state';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectStatsMap {
  [projectId: string]: { totalWords: number; totalChapters: number; completedChapters: number };
}

export default function Home() {
  const { projects, loading, error, loadProjects, archiveProject, clearError } = useProjectStore();
  const [statsMap, setStatsMap] = useState<ProjectStatsMap>({});

  useEffect(() => {
    loadProjects().catch(() => {});
  }, [loadProjects]);

  // 并行加载所有项目的统计
  useEffect(() => {
    if (projects.length === 0) {
      setStatsMap({});
      return;
    }
    let cancelled = false;
    Promise.all(
      projects.map(async (p) => [p.id, await getProjectStats(p.id)] as const)
    ).then((entries) => {
      if (cancelled) return;
      const map: ProjectStatsMap = {};
      for (const [id, stats] of entries) map[id] = stats;
      setStatsMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleArchive = async (id: string) => {
    try {
      await archiveProject(id);
      toast.success('项目已归档');
    } catch {
      toast.error('归档失败');
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      {/* 顶部 */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="seal" aria-hidden="true">砚</span>
          <div>
            <h1 className="font-serif text-3xl font-bold text-brand-800">
              AI 小说制作工坊
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              AI 全流程高质量小说生成器 · 人工轻度介入
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/inspiration" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <TrendingUp className="h-4 w-4" />
            找灵感
          </Link>
          {projects.length > 0 && (
            <Link href="/project/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建小说
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* 内容区 */}
      {loading && projects.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-stone-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              stats={statsMap[project.id] ?? { totalWords: 0, totalChapters: 0, completedChapters: 0 }}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {/* 底部 */}
      <footer className="mt-16 border-t border-paper-200 pt-6 text-center text-xs text-ink-300">
        <p>所有数据存储在浏览器本地 · 隐私 100% 安全 · 数据不离机</p>
      </footer>
    </main>
  );
}
