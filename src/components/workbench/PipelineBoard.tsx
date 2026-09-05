'use client';

// ============================================================================
// 全书生产流水线面板（P3 · 对标 ai-story-builder 节点图 pipeline）
// 按卷分组的逐章节点网格：一眼看清整本生产进度，失败章红格直接定位跳转。
// 纯展示组件，数据由 buildPipeline 确定性聚合，无 LLM / 网络依赖。
// ============================================================================
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { buildPipeline, type PipelineNodeStatus } from '@/lib/workbench/pipeline';
import type { Chapter, Volume, BatchJob } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<PipelineNodeStatus, string> = {
  done: 'bg-brand-500 text-white',
  recheck: 'bg-amber-400 text-white',
  active: 'bg-brand-200 text-brand-800 animate-pulse',
  pending: 'border border-stone-300 bg-white text-stone-500',
  failed: 'bg-red-500 text-white',
  planned: 'border border-dashed border-stone-300 bg-transparent text-stone-300',
};

const STATUS_LABEL: Record<PipelineNodeStatus, string> = {
  done: '已完成',
  recheck: '待复查',
  active: '生成中',
  pending: '未动笔',
  failed: '生成失败',
  planned: '规划占位',
};

interface PipelineBoardProps {
  projectId: string;
  chapters: Chapter[];
  volumes: Volume[];
  batchJob: BatchJob | null;
}

export function PipelineBoard({ projectId, chapters, volumes, batchJob }: PipelineBoardProps) {
  const router = useRouter();
  const board = useMemo(() => buildPipeline(chapters, volumes, batchJob), [chapters, volumes, batchJob]);

  if (board.stats.total === 0) return null;

  const { stats } = board;
  const progressPct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const nodeTitle = (n: { chapterNo: number; title: string | null; status: PipelineNodeStatus; wordCount: number; lastError?: string }) => {
    const base = `第 ${n.chapterNo} 章 · ${STATUS_LABEL[n.status]}`;
    const extra =
      n.status === 'failed'
        ? `：${n.lastError ?? '未知错误'}`
        : n.title
          ? ` · ${n.title}${n.wordCount > 0 ? `（${n.wordCount} 字）` : ''}`
          : '';
    return base + extra;
  };

  return (
    <Card className="border-brand-200 bg-brand-50/30">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-serif text-sm font-medium text-stone-800">全书生产流水线</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
            <span className="flex items-center gap-1"><i className={cn('h-2.5 w-2.5 rounded-sm', STATUS_STYLE.done)} />已完成 {stats.done}</span>
            {stats.recheck > 0 && <span className="flex items-center gap-1"><i className={cn('h-2.5 w-2.5 rounded-sm', STATUS_STYLE.recheck)} />待复查 {stats.recheck}</span>}
            {stats.active > 0 && <span className="flex items-center gap-1"><i className={cn('h-2.5 w-2.5 rounded-sm', STATUS_STYLE.active)} />生成中 {stats.active}</span>}
            {stats.pending > 0 && <span className="flex items-center gap-1"><i className={cn('h-2.5 w-2.5 rounded-sm', STATUS_STYLE.pending)} />未动笔 {stats.pending}</span>}
            {stats.failed > 0 && <span className="flex items-center gap-1"><i className={cn('h-2.5 w-2.5 rounded-sm', STATUS_STYLE.failed)} />失败 {stats.failed}</span>}
            {stats.planned > 0 && <span className="flex items-center gap-1"><i className={cn('h-2.5 w-2.5 rounded-sm', STATUS_STYLE.planned)} />规划 {stats.planned}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="shrink-0 text-xs text-stone-500">{stats.done}/{stats.total} 章 · {progressPct}%</span>
        </div>

        <div className="space-y-3">
          {board.groups.map((g) => (
            <div key={g.volumeNo}>
              <p className="mb-1 text-xs font-medium text-stone-500">
                {g.title}
                <span className="ml-1.5 font-normal text-stone-400">({g.chapters.length} 章)</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {g.chapters.map((n) => (
                  <button
                    key={n.chapterNo}
                    type="button"
                    title={nodeTitle(n)}
                    onClick={() => router.push(`/project/${projectId}/workbench/chapter/${n.chapterNo}`)}
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded text-[10px] font-medium transition-colors hover:opacity-80',
                      STATUS_STYLE[n.status]
                    )}
                  >
                    {n.status === 'done' ? '✓' : n.status === 'failed' ? '✕' : n.status === 'recheck' ? '!' : n.chapterNo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] leading-relaxed text-stone-400">
          灰色虚线为大纲规划占位章；点击任意格子跳转对应章节页。失败章（红）重试耗尽后可在「批量续写」中从该章续跑。
        </p>
      </CardContent>
    </Card>
  );
}
