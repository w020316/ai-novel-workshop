'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { runHealthCheck } from '@/lib/health/health-check';
import type { ProjectHealthReport, HealthIssue } from '@/lib/health/health-check';
import {
  Loader2,
  RefreshCw,
  HeartPulse,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  TrendingUp,
  MessageCircleMore,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SEVERITY_META: Record<
  HealthIssue['severity'],
  { icon: typeof AlertTriangle; cls: string; label: string }
> = {
  error: { icon: XCircle, cls: 'text-red-500 border-red-200 bg-red-50', label: '严重' },
  warning: { icon: AlertTriangle, cls: 'text-amber-500 border-amber-200 bg-amber-50', label: '提醒' },
  info: { icon: Info, cls: 'text-brand-500 border-brand-200 bg-brand-50', label: '提示' },
};

const DIMENSION_LABEL: Record<HealthIssue['dimension'], string> = {
  mainline: '主线',
  foreshadowing: '伏笔',
  character: '角色',
  power: '战力',
  pacing: '节奏',
  words: '篇幅',
};

export default function HealthPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [report, setReport] = useState<ProjectHealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await runHealthCheck(projectId);
      setReport(r);
    } catch (e) {
      console.error(e);
      toast.error('健康体检失败');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-stone-500">加载失败，请重试</p>
        <Button className="mt-4" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" /> 重试
        </Button>
      </div>
    );
  }

  const errorCount = report.issues.filter((i) => i.severity === 'error').length;
  const warningCount = report.issues.filter((i) => i.severity === 'warning').length;
  const ok = errorCount === 0 && warningCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-xl text-stone-800">
            <HeartPulse className="h-5 w-5 text-brand-500" /> 卷级健康体检
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            面向长篇连载的全局体检：主线进度、伏笔积压、角色遗忘、力量升级与节奏厚度，提前预警「烂文」信号。
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" /> 重新体检
        </Button>
      </div>

      {/* 汇总卡片 */}
      <Card className={cn('border ', ok ? 'border-green-200' : 'border-amber-200')}>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className={cn('flex items-center gap-2 rounded-full px-3 py-1 text-sm',
              ok ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600')}>
              {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {ok ? '整体健康' : `${report.issues.length} 项待关注`}
            </div>
            <p className="text-sm text-stone-600">{report.summary}</p>
          </div>
        </CardContent>
      </Card>

      {/* 指标网格 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric label="已完成章节" value={String(report.metrics.completedChapters)} unit="章" />
        <Metric
          label="规划总章"
          value={report.metrics.plannedChapters != null ? String(report.metrics.plannedChapters) : '—'}
          unit="章"
        />
        <Metric
          label="主线进度"
          value={report.metrics.mainlineProgress != null ? `${report.metrics.mainlineProgress}` : '—'}
          unit="%"
        />
        <Metric label="累计字数" value={report.metrics.totalWords.toLocaleString()} unit="字" />
        <Metric
          label="均章字数"
          value={String(report.metrics.avgWordsPerChapter)}
          unit="字"
        />
        <Metric label="待回收伏笔" value={String(report.metrics.foreshadowingBacklog)} unit="条" />
      </div>

      {/* 问题列表 */}
      <div className="space-y-3">
        {report.issues.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="mb-3 h-12 w-12 text-green-400" />
              <p className="text-sm text-stone-600">未发现明显问题</p>
              <p className="text-xs text-stone-400">继续推进主线并定期体检，保持长篇质量</p>
            </CardContent>
          </Card>
        ) : (
          report.issues.map((issue, i) => {
            const meta = SEVERITY_META[issue.severity];
            const Icon = meta.icon;
            return (
              <Card key={i} className="flex gap-3 p-4">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', meta.cls)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', meta.cls)}>
                      {DIMENSION_LABEL[issue.dimension]} · {meta.label}
                    </span>
                    <p className="text-sm font-medium text-stone-800">{issue.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{issue.detail}</p>
                  {issue.suggestion && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-stone-400">
                      <MessageCircleMore className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>建议：{issue.suggestion}</span>
                    </p>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <p className="text-xs text-stone-400">{label}</p>
        <p className="mt-1 flex items-baseline justify-center gap-1">
          <TrendingUp className="h-4 w-4 self-center text-brand-400" />
          <span className="text-2xl font-semibold text-stone-800">{value}</span>
          <span className="text-xs text-stone-400">{unit}</span>
        </p>
      </CardContent>
    </Card>
  );
}