'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listChapters } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChapterList } from '@/components/workbench/ChapterList';
import { generateChaptersBatch, computeResumeCount, computeDoneCount } from '@/lib/agents/batch';
import { startBatchJob, pauseBatchJob, clearBatchJob, getBatchJob } from '@/lib/batch/job-store';
import type { Chapter, GenerationStage, BatchJob, WritingSkill } from '@/types';
import { getEnabledSkills } from '@/lib/skills/store';
import { loadLiveRankedTitles } from '@/lib/rank/store';
import { scanChaptersOriginality, type ChapterScanResult } from '@/lib/originality/scan';
import { Plus, Loader2, Layers, StopCircle, SearchCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null);
  // 批量模式技能选择
  const [batchSkillIds, setBatchSkillIds] = useState<string[] | null>(null);
  const [enabledSkills, setEnabledSkills] = useState<WritingSkill[]>([]);
  const [showBatchSkills, setShowBatchSkills] = useState(false);

  // 加载已启用技能供批量模式选择
  useEffect(() => {
    getEnabledSkills()
      .then(setEnabledSkills)
      .catch(() => {});
  }, []);

  // 全书避撞体检
  const [scanningBook, setScanningBook] = useState(false);
  const [bookScan, setBookScan] = useState<ChapterScanResult | null>(null);

  const handleBookScan = async () => {
    setScanningBook(true);
    try {
      const liveTitles = await loadLiveRankedTitles();
      const result = scanChaptersOriginality(
        chapters.map((c) => ({ id: String(c.chapterNo), title: c.title, content: c.content })),
        { liveTitles }
      );
      setBookScan(result);
      toast.success(
        result.passed
          ? `全书避撞体检通过（${result.scanned} 章无撞梗）`
          : `发现 ${result.totalHits} 处撞梗（${result.chaptersWithHits} 章），请在对应章修缮`
      );
    } catch (e) {
      toast.error('体检失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setScanningBook(false);
    }
  };

  const load = useCallback(async () => {
    const list = await listChapters(projectId).catch(() => []);
    setChapters(list);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    getBatchJob(projectId)
      .then(setBatchJob)
      .catch(() => setBatchJob(null));
  }, [projectId]);

  const handleCreateChapter = () => {
    const nextChapterNo = chapters.length + 1;
    router.push(`/project/${projectId}/workbench/chapter/${nextChapterNo}`);
  };

  const handleBatchWrite = async () => {
    if (batchCount < 1 || batchCount > 50) {
      toast.warning('连写章数需在 1~50 之间');
      return;
    }
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchRunning(true);

    // 断点续写：存在未完成的上批任务则继续剩余章节（跳过已存在章）
    const isResume = !!batchJob;
    const startChapterNo = chapters.length + 1;
    const remaining = isResume
      ? computeResumeCount(batchJob!.total, batchJob!.startChapterNo, chapters.length)
      : batchCount;
    const resolvedTemplate = isResume && batchJob!.plotTemplate
      ? batchJob!.plotTemplate
      : batchPlot.trim();

    if (remaining <= 0) {
      await clearBatchJob(projectId);
      setBatchJob(null);
      setBatchRunning(false);
      batchAbortRef.current = null;
      toast.success('本批章节已全部生成，无需续写');
      return;
    }

    if (!isResume) {
      await startBatchJob({ projectId, total: batchCount, startChapterNo, plotTemplate: resolvedTemplate });
    }
    setBatchProgress({ chapterNo: startChapterNo, total: remaining, stage: null, done: 0 });
    try {
      const res = await generateChaptersBatch({
        projectId,
        startChapterNo,
        count: remaining,
        skillIds: batchSkillIds && batchSkillIds.length < enabledSkills.length ? batchSkillIds : undefined,
        signal: controller.signal,
        plotPointsPerChapter: !resolvedTemplate ? undefined : () => [resolvedTemplate],
        onProgress: (info) =>
          setBatchProgress({
            chapterNo: info.chapterNo,
            total: info.total,
            stage: info.stage,
            done: info.index,
          }),
      });
      await load();
      if (res.aborted) {
        // 暂停：保留任务现场，供刷新后继续
        await pauseBatchJob(projectId);
        setBatchJob(await getBatchJob(projectId));
        toast.info('已暂停批量续写，可稍后「继续」');
      } else {
        // 完成：清理任务现场
        await clearBatchJob(projectId);
        setBatchJob(null);
        toast.success(`已续写 ${res.results.length} 章`);
        setShowBatch(false);
        setBatchPlot('');
      }
    } catch (e) {
      await pauseBatchJob(projectId);
      setBatchJob(await getBatchJob(projectId));
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

  const handleDiscardBatch = async () => {
    await clearBatchJob(projectId);
    setBatchJob(null);
    toast.success('已放弃本批批量续写任务');
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
              从第 {chapters.length + 1} 章起连写（单批最多 50 章，百万字长篇可分多批）；每章沿用前章记忆回溯与大纲主线，保证长篇连续。若填写统一剧情模板会注入每章要点，留空则交由剧情 Agent 自动拟定。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-stone-600">
                连写
                <input
                  type="number"
                  min={1}
                  max={50}
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

            {/* 批量模式技能选择 */}
            {enabledSkills.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowBatchSkills((v) => !v)}
                  className="text-xs text-stone-500 hover:text-brand-600"
                >
                  本轮技能：{batchSkillIds ? `已选 ${batchSkillIds.length}/${enabledSkills.length}` : '全部'}
                  {showBatchSkills ? ' · 收起' : ' · 选择'}
                </button>
                {showBatchSkills && (
                  <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setBatchSkillIds(null)}
                      disabled={batchRunning}
                      className={cn(
                        'rounded border px-1.5 py-1 text-left text-[10px]',
                        batchSkillIds === null ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200 bg-white text-stone-500 hover:border-brand-300'
                      )}
                    >
                      全部技能
                    </button>
                    {enabledSkills.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={batchRunning}
                        onClick={() => {
                          setBatchSkillIds((prev) => {
                            if (prev === null) return enabledSkills.filter((x) => x.id !== s.id).map((x) => x.id);
                            if (prev.includes(s.id)) {
                              const next = prev.filter((id) => id !== s.id);
                              return next.length === enabledSkills.length ? null : next;
                            }
                            return [...prev, s.id];
                          });
                        }}
                        className="rounded border border-stone-200 bg-white px-1.5 py-1 text-left text-[10px] text-stone-500 hover:border-brand-300"
                      >
                        {batchSkillIds === null || batchSkillIds.includes(s.id) ? '✓ ' : ''}{s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {batchProgress && (
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span>
                    第 {batchProgress.done + 1} / {batchProgress.total} 章
                    {batchProgress.stage ? ` · ${stageLabel[batchProgress.stage as GenerationStage] ?? batchProgress.stage}` : '…'}
                  </span>
                  {batchRunning && (
                    <button onClick={handleStopBatch} className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700">
                      <StopCircle className="h-3.5 w-3.5" />
                      暂停
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
                  每章约需 1-2 分钟，请保持本页打开；若中途离开，可稍后「继续批量续写」自动跳过已完成章节
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 断点续写横幅 */}
      {!batchRunning && batchJob && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            上次批量续写未完成：已完成{' '}
            {computeDoneCount(batchJob.total, batchJob.startChapterNo, chapters.length)} / {batchJob.total} 章，可继续生成剩余章节（已生成的章会自动跳过）。
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleBatchWrite}>
              继续批量续写
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDiscardBatch}>
              放弃本次批量
            </Button>
          </div>
        </div>
      )}

      {/* 全书避撞体检 */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="text-sm text-stone-700">
            <span className="font-medium">全书避撞体检</span>
            <span className="ml-2 text-xs text-stone-500">
              一键扫描全部章节，找出与平台代表作 / 实时热书撞梗的部分并按章定位
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={handleBookScan} disabled={scanningBook}>
            {scanningBook ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <SearchCheck className="mr-1.5 h-3.5 w-3.5" />
            )}
            {scanningBook ? '体检中…' : '开始全书体检'}
          </Button>
        </CardContent>
        {bookScan && bookScan.scanned > 0 && (
          <CardContent className="border-t border-amber-100 pt-3 text-xs text-stone-600">
            {bookScan.passed ? (
              <p className="text-emerald-600">
                ✓ 扫描 {bookScan.scanned} 章，未发现与平台代表作 / 实时热书撞梗，可放心推进。
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-amber-700">
                  扫描 {bookScan.scanned} 章，发现 {bookScan.totalHits} 处撞梗（涉及{' '}
                  {bookScan.chaptersWithHits} 章），建议在对应章节改设定 / 调整表述。
                </p>
                {bookScan.topWorks.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium text-stone-600">全书最常被撞的作品：</p>
                    <ul className="grid gap-1 md:grid-cols-2">
                      {bookScan.topWorks.map((w) => (
                        <li key={w.workTitle} className="truncate">
                          《{w.workTitle}》× {w.count} 章（{w.chapters.join('、')}）
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 章节列表 */}
      <ChapterList chapters={chapters} projectId={projectId} />
    </div>
  );
}