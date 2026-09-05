'use client';

import { useState } from 'react';
import {
  listChapters,
  listPlotThreads,
  listForeshadowings,
  listChapterSummaries,
  getOutline,
} from '@/lib/db/queries';
import { buildWorldState, type WorldStateSnapshot } from '@/lib/worldstate/machine';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe2, Loader2, AlertTriangle } from 'lucide-react';

const THREAD_STATUS: Record<string, string> = {
  active: '推进中',
  resolved: '已收束',
  abandoned: '已弃置',
};
const FS_STATUS: Record<string, string> = {
  planted: '已埋',
  pending: '待收',
  recovered: '已收',
  abandoned: '弃置',
};

/** 世界状态机卡片：一键聚合 时间线/情节线/伏笔/人物在场 跨章状态 */
export function WorldStateCard({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<WorldStateSnapshot | null>(null);

  const handleBuild = async () => {
    setLoading(true);
    try {
      const [chapters, plotThreads, foreshadowings, summaries, outline] = await Promise.all([
        listChapters(projectId),
        listPlotThreads(projectId),
        listForeshadowings(projectId),
        listChapterSummaries(projectId),
        getOutline(projectId),
      ]);
      const plannedEndChapter = outline?.volumes?.length
        ? Math.max(...outline.volumes.map((v) => v.chapterRange?.[1] ?? 0))
        : undefined;
      setSnap(
        buildWorldState({
          chapters: chapters.map((c) => ({
            chapterNo: c.chapterNo,
            volumeNo: c.volumeNo,
            title: c.title,
            wordCount: c.wordCount,
          })),
          plotThreads: plotThreads.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            status: t.status,
            relatedChapters: t.relatedChapters,
          })),
          foreshadowings: foreshadowings.map((f) => ({
            id: f.id,
            description: f.description,
            setupChapter: f.setupChapter,
            status: f.status,
            plannedRecoveryChapter: f.plannedRecoveryChapter,
            actualRecoveryChapter: f.actualRecoveryChapter,
          })),
          summaries: summaries.map((s) => ({
            chapterNo: s.chapterNo,
            characterStates: s.characterStates,
          })),
          plannedEndChapter,
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="h-4 w-4 text-brand-500" />
          世界状态机
        </CardTitle>
        <CardDescription className="text-xs">
          聚合情节线、伏笔、章节摘要的跨章状态：时间线进度 / 各线推进 / 埋收进度 / 人物在场，并给出风险提示
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" onClick={handleBuild} disabled={loading}>
          {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          生成世界状态快照
        </Button>

        {snap && (
          <div className="space-y-3 text-xs">
            {/* 时间线进度 */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">已写 / 最新章</p>
                <p className="mt-0.5 font-medium text-stone-800">
                  {snap.totalChapters} 章 / 第 {snap.latestChapterNo || '-'} 章
                </p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">当前卷</p>
                <p className="mt-0.5 font-medium text-stone-800">第 {snap.latestVolumeNo || '-'} 卷</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">累计字数</p>
                <p className="mt-0.5 font-medium text-stone-800">{snap.totalWords.toLocaleString()}</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">全书进度</p>
                <p className="mt-0.5 font-medium text-stone-800">
                  {snap.progressPct !== undefined ? `${snap.progressPct}%` : '未设大纲'}
                </p>
              </div>
            </div>

            {/* 风险提示 */}
            {snap.risks.length > 0 ? (
              <div className="space-y-1">
                {snap.risks.map((r, i) => (
                  <p
                    key={i}
                    className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-700"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {r}
                  </p>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-700">
                无风险：无章号空洞、无逾期伏笔、情节线推进正常。
              </p>
            )}

            {/* 情节线 */}
            {snap.threads.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-stone-600">情节线（{snap.threads.length}）</p>
                <ul className="grid gap-1 md:grid-cols-2">
                  {snap.threads.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-stone-200 px-2 py-1.5"
                    >
                      <span className="truncate text-stone-700">
                        {t.type === 'main' ? '【主线】' : '【支线】'}
                        {t.name}
                      </span>
                      <span className="shrink-0 text-stone-400">
                        {THREAD_STATUS[t.status]} · 第 {t.lastChapter || '-'} 章
                        {t.stagnant && <span className="ml-1 text-amber-600">停滞</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 伏笔埋收 */}
            {(snap.foreshadowProgress.planted > 0 ||
              snap.foreshadowProgress.pending > 0 ||
              snap.foreshadowProgress.recovered > 0 ||
              snap.foreshadowProgress.abandoned > 0) && (
              <p className="text-stone-600">
                伏笔埋/收：
                <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5">已埋 {snap.foreshadowProgress.planted}</span>
                <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5">待收 {snap.foreshadowProgress.pending}</span>
                <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                  已收 {snap.foreshadowProgress.recovered}
                </span>
                <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5">弃置 {snap.foreshadowProgress.abandoned}</span>
              </p>
            )}

            {/* 人物在场 */}
            {snap.characterPresence.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-stone-600">人物在场（按出场章数）</p>
                <ul className="grid gap-1 md:grid-cols-2">
                  {snap.characterPresence.map((p) => (
                    <li key={p.name} className="rounded-md border border-stone-200 px-2 py-1.5">
                      <span className="font-medium text-stone-700">{p.name}</span>
                      <span className="ml-2 text-stone-400">
                        {p.appearances} 章 · 最近第 {p.lastChapterNo} 章
                      </span>
                      {p.lastState && <p className="mt-0.5 truncate text-stone-500">末次状态：{p.lastState}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
