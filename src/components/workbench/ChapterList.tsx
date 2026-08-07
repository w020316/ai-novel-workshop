'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChapterStatusBadge } from './ChapterStatusBadge';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import type { Chapter } from '@/types';

interface ChapterListProps {
  chapters: Chapter[];
  projectId: string;
  pageSize?: number;
}

export function ChapterList({ chapters, projectId, pageSize = 10 }: ChapterListProps) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(chapters.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageChapters = chapters.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <div className="space-y-3">
      {pageChapters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-3 h-12 w-12 text-stone-300" />
            <p className="mb-2 text-sm text-stone-500">还没有任何章节</p>
            <p className="text-xs text-stone-400">点击&ldquo;新建章节&rdquo;开始创作</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {pageChapters.map((ch) => (
              <Card
                key={ch.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(`/project/${projectId}/workbench/chapter/${ch.chapterNo}`)}
              >
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-600">
                      {ch.chapterNo}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-800">{ch.title}</p>
                      <p className="text-xs text-stone-400">
                        {ch.wordCount.toLocaleString()} 字 · {(ch.content ?? '').length > 0 ? `${(ch.content ?? '').slice(0, 50)}...` : '暂无内容'}
                      </p>
                    </div>
                  </div>
                  <ChapterStatusBadge status={ch.status} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-stone-500">
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}