'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listChapters } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChapterList } from '@/components/workbench/ChapterList';
import { generateChaptersBatch } from '@/lib/agents/batch';
import type { Chapter, GenerationStage } from '@/types';
import { Plus, Loader2, Layers, StopCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function WorkbenchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  // 批量续写状态
  const [showBatch, setShowBatch] = useState(false);
  const [batchCount, setBatchCount] = useState(3);
  const [batchPlot, setBatchPlot] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ chapterNo: number; total: number; stage: string | null; done: number } | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const list = await listChapters(projectId).catch(() => []);
    setChapters(list);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleCreateChapter = () => {
    const nextChapterNo = chapters.length + 1;
    router.push(`/project/${projectId}/workbench/chapter/${nextChapterNo}`);
  };

  const handleBatchWrite = async () => {
    if (batchCount < 1 || batchCount > 20) {
      toast.warning('连写章数需在 1~20 之间');
      return;
    }
    const startChapterNo = chapters.length + 1;
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchRunning(true);
    setBatchProgress({ chapterNo: startChapterNo, total: batchCount, stage: null, done: 0 });
    const plotTemplate = batchPlot.trim();
    try {
      const res = await generateChaptersBatch({
        projectId,
        startChapterNo,
        count: batchCount,
        signal: controller.signal,
        // 若填写了剧情模板，整体注入每章要点，否则留空由剧情设计自动拟定
        plotPointsPerChapter: !plotTemplate
          ? undefined
          : () => [plotTemplate],
        onProgress: (info) =>
          setBatchProgress({
            chapterNo: info.chapterNo,
            total: info.total,
            stage: info.stage,
            done: info.index,
          }),
      });
      setBatchProgress((p) => (p ? { ...p, done: p.total, stage: 'completed' } : p));
      toast.success(res.aborted ? '已中止批量续写，已完成章已保存' : `已续写 ${res.results.length} 章`);
      setShowBatch(false);
      setBatchPlot('');
      await load();
    } catch (e) {
      toast.error('批量续写失败', { description: e instanceof Error ? e.message : String(e) });
      await load();
    } finally {
      setBatchRunning(false);
      batchAbortRef.current = null;
    }
  };

  const handleStopBatch = () => {
    batchAbortRef.current?.abort();
  };

  const stageLabel: Record<GenerationStage, string> = {
    memory_assembling: '记忆装配',
    plot_designing: '剧情设计',
    writing: '文笔创作',
    consistency_checking: '一致性校验',
    rewriting_1: '纳入修正',
    rewriting_2: '二次修正',
    memory_updating: '记忆更新',
    completed: '完成',
    failed: '失败',
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowBatch(true)}>
            <Layers className="mr-1 h-4 w-4" />
            批量续写
          </Button>
          <Button onClick={handleCreateChapter}>
            <Plus className="mr-1 h-4 w-4" />
            新建章节
          </Button>
        </div>
      </div>

      {/* 批量续写面板 */}
      {showBatch && (
        <Card className="border-brand-200 bg-brand-50/30">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <Layers className="h-4 w-4 text-brand-600" />
                大纲驱动批量续写
              </p>
              {!batchRunning && (
                <Button variant="ghost" size="sm" onClick={() => setShowBatch(false)}>
                  收起
                </Button>
              )}
            </div>
            <p className="text-xs text-stone-500">
              从第 {chapters.length + 1} 章起连写；每章沿用前章记忆回溯与大纲主线，保证长篇连续。若填写统一剧情模板会注入每章要点，留空则交由剧情 Agent 自动拟定。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-stone-600">
                连写
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  disabled={batchRunning}
                  className="w-20 rounded-md border border-stone-300 px-2 py-1 text-sm disabled:opacity-50"
                />
                章
              </label>
              <input
                value={batchPlot}
                onChange={(e) => setBatchPlot(e.target.value)}
                disabled={batchRunning}
                placeholder="统一剧情模板（可选，如：主角踏入宗门试炼，逐步揭开身世）"
                className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {batchProgress && (
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>
                    第 {batchProgress.done + 1} / {batchProgress.total} 章
                    {batchProgress.stage ? ` · ${stageLabel[batchProgress.stage as GenerationStage] ?? batchProgress.stage}` : '…'}
                  </span>
                  {batchRunning && (
                    <button onClick={handleStopBatch} className="inline-flex items-center gap-1 text-red-500 hover:text-red-700">
                      <StopCircle className="h-3.5 w-3.5" />
                      停止
                    </button>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${((batchProgress.done + (batchProgress.stage === 'completed' ? 1 : 0)) / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={handleBatchWrite} disabled={batchRunning}>
                {batchRunning ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Layers className="mr-1.5 h-4 w-4" />
                )}
                {batchRunning ? '续写中…' : '开始批量续写'}
              </Button>
              {batchRunning && (
                <span className="text-xs text-stone-400">
                  每章约需 1-2 分钟，可在后台进行其他工作
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 章节列表 */}
      <ChapterList chapters={chapters} projectId={projectId} />
    </div>
  );
}