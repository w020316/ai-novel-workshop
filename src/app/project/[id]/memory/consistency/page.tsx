'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConsistencyReportView } from '@/components/workbench/ConsistencyReportView';
import { listChapters, getConsistencyReport, markChapterNeedsRecheck } from '@/lib/db/queries';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter, ConsistencyReport } from '@/types';

export default function ConsistencyPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reports, setReports] = useState<Record<string, ConsistencyReport | null>>({});
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const chs = await listChapters(projectId).catch(() => []);
    setChapters(chs);
    const r: Record<string, ConsistencyReport | null> = {};
    for (const ch of chs) {
      r[ch.id] = (await getConsistencyReport(ch.id).catch(() => undefined)) ?? null;
    }
    setReports(r);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRecheckAll = async () => {
    setRechecking(true);
    const count = await markChapterNeedsRecheck(projectId);
    toast.success(`已标记 ${count} 章需重校验`);
    setRechecking(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const completedChapters = chapters.filter((c) => c.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">一致性校验报告</h1>
          <p className="text-sm text-stone-500">各章节的世界观、人设、剧情一致性检查</p>
        </div>
        <Button variant="outline" onClick={handleRecheckAll} disabled={rechecking}>
          <RefreshCw className={`mr-1 h-4 w-4 ${rechecking ? 'animate-spin' : ''}`} />
          批量重校验
        </Button>
      </div>

      {completedChapters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="mb-3 h-12 w-12 text-stone-300" />
            <p className="text-sm text-stone-500">暂无已完成章节</p>
            <p className="text-xs text-stone-400">完成章节生成后，一致性校验报告将在此显示</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {completedChapters.map((ch) => {
            const report = reports[ch.id];
            const hasIssues = report && !report.passed;
            const needsRecheck = ch.needsRecheck;

            return (
              <Card
                key={ch.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${
                  needsRecheck ? 'border-yellow-300' : ''
                }`}
                onClick={() => setSelectedChapter(selectedChapter === ch.id ? null : ch.id)}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-600">
                        {ch.chapterNo}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-800">{ch.title}</p>
                        <p className="text-xs text-stone-400">
                          {report
                            ? hasIssues
                              ? `${report.issues.length} 个问题`
                              : '校验通过'
                            : '暂无报告'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {needsRecheck && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-600">
                          待重校验
                        </span>
                      )}
                      {report ? (
                        report.passed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-stone-300" />
                      )}
                    </div>
                  </div>
                </CardContent>
                {selectedChapter === ch.id && report && (
                  <CardContent className="border-t border-stone-100 pt-3">
                    <ConsistencyReportView report={report} />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}