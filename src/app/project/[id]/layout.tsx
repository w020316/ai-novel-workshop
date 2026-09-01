'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DatabaseInitializer } from '@/components/providers';
import { ProjectNav } from '@/components/project/project-nav';
import { useProjectStore } from '@/lib/store/project-store';
import { getProject } from '@/lib/db/queries';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { NovelProject } from '@/types';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { setCurrentProject } = useProjectStore();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<NovelProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProject(projectId)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          setNotFound(true);
        } else {
          setProject(p);
          setCurrentProject(p);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <DatabaseInitializer>
      <div className="flex min-h-screen flex-col md:flex-row">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : notFound ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <p className="text-stone-600">项目不存在或已被删除</p>
            <Link
              href="/"
              className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              返回项目列表
            </Link>
          </div>
        ) : project ? (
          <>
            <ProjectNav projectId={projectId} />
            <main className="flex-1 overflow-x-hidden bg-white">
              <div className="border-b border-stone-200 bg-white px-6 py-3">
                <h2 className="font-serif text-lg text-stone-800">{project.title}</h2>
              </div>
              <div className="p-6">{children}</div>
            </main>
          </>
        ) : null}
      </div>
    </DatabaseInitializer>
  );
}
