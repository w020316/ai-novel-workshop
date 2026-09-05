'use client';

import { useState } from 'react';
import { listChapters, listChapterSummaries, getOutline } from '@/lib/db/queries';
import { buildTimeline, type TimelineGroup } from '@/lib/worldstate/timeline';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, Loader2 } from 'lucide-react';

/** 世界时间线：卷 → 章 → 关键事件的全局事件流视图 */
export function WorldTimeline({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<TimelineGroup[] | null>(null);

  const handleBuild = async () => {
    setLoading(true);
    try {
      const [chapters, summaries, outline] = await Promise.all([
        listChapters(projectId),
        listChapterSummaries(projectId),
        getOutline(projectId),
      ]);
      setGroups(
        buildTimeline(
          chapters
            .map((c) => ({ chapterNo: c.chapterNo, volumeNo: c.volumeNo, title: c.title }))
            .sort((a, b) => a.chapterNo - b.chapterNo),
          summaries.map((s) => ({ chapterNo: s.chapterNo, keyEvents: s.keyEvents })),
          (outline?.volumes ?? []).map((v) => ({ volumeNo: v.volumeNo, title: v.title }))
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-brand-500" />
          世界时间线
        </CardTitle>
        <CardDescription className="text-xs">
          按卷序排列的全局事件流：每章摘取至多 3 条关键事件，一眼看懂故事走到哪、事件因果链是否连贯
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" onClick={handleBuild} disabled={loading}>
          {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          生成时间线视图
        </Button>

        {groups && groups.length === 0 && (
          <p className="rounded-md border border-stone-200 bg-stone-50 p-2 text-xs text-stone-500">
            暂无已写章节——写完第一章后这里会出现事件流。
          </p>
        )}

        {groups && groups.length > 0 && (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.volumeNo}>
                <p className="mb-2 text-xs font-medium text-stone-700">
                  第 {g.volumeNo} 卷{g.volumeTitle ? ` · ${g.volumeTitle}` : ''}
                </p>
                <ol className="relative space-y-2 border-l border-brand-200 pl-4">
                  {g.items.map((it) => (
                    <li key={it.chapterNo} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-400" />
                      <p className="text-xs font-medium text-stone-800">
                        第 {it.chapterNo} 章 · {it.title}
                      </p>
                      {it.keyEvents.length > 0 ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {it.keyEvents.map((e, i) => (
                            <li key={i} className="text-xs text-stone-600">
                              · {e}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-0.5 text-xs text-stone-400">（暂无摘要事件）</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
