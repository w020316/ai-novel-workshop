'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listChapters } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { ChapterList } from '@/components/workbench/ChapterList';
import type { Chapter } from '@/types';
import { Plus, Loader2 } from 'lucide-react';

export default function WorkbenchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listChapters(projectId)
      .then(setChapters)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreateChapter = () => {
    const nextChapterNo = chapters.length + 1;
    router.push(`/project/${projectId}/workbench/chapter/${nextChapterNo}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">章节管理</h1>
          <p className="text-sm text-stone-500">
            共 {chapters.length} 章，{chapters.filter((c) => c.status === 'completed').length} 章已完成
          </p>
        </div>
        <Button onClick={handleCreateChapter}>
          <Plus className="mr-1 h-4 w-4" />
          新建章节
        </Button>
      </div>

      {/* 章节列表 */}
      <ChapterList chapters={chapters} projectId={projectId} />
    </div>
  );
}