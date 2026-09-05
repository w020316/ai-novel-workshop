'use client';

import { useCallback, useEffect, useState } from 'react';
import { getArcCanon } from '@/lib/db/queries';
import { regenerateArcCanon } from '@/lib/memory/arc-canon';
import type { ArcCanon } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scroll, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 剧情纲要卡片：全书已发生剧情的压缩真值锚点，随写随更（每 10 章自动压缩一次） */
export function ArcCanonCard({ projectId }: { projectId: string }) {
  const [canon, setCanon] = useState<ArcCanon | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await getArcCanon(projectId);
      setCanon(c ?? null);
    } catch {
      setCanon(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRegenerate = async () => {
    setUpdating(true);
    try {
      const result = await regenerateArcCanon(projectId);
      if (result) {
        setCanon(result);
        toast.success('剧情纲要已重新生成');
      } else {
        toast.info('暂无章节摘要，请先生成或保存章节后再试');
      }
    } catch {
      toast.error('剧情纲要生成失败，请稍后重试');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scroll className="h-4 w-4 text-brand-500" />
          剧情纲要
        </CardTitle>
        <CardDescription className="text-xs">
          全书已发生剧情的压缩真值锚点：每写 10 章自动压缩更新，生成新章时注入，防止长篇中段剧情跑偏、前后矛盾
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-stone-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </p>
        ) : canon ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span className="rounded bg-stone-100 px-1.5 py-0.5">
                已覆盖至第 {canon.upToDateChapterNo} 章
              </span>
              <span className="rounded bg-stone-100 px-1.5 py-0.5">
                {canon.fromLLM ? 'AI 压缩' : '确定性拼接'}
              </span>
              <span>更新于 {formatTime(canon.updatedAt)}</span>
            </div>
            <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-stone-200 bg-stone-50/70 p-3 text-xs leading-relaxed text-stone-700">
              {canon.canonText}
            </div>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-stone-300 bg-stone-50/50 p-3 text-xs text-stone-500">
            暂无剧情纲要。每写满 10 章后会自动压缩生成；也可现在根据已有章节摘要手动生成。
          </p>
        )}

        <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={updating}>
          {updating ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {canon ? '重新生成' : '立即生成'}
        </Button>
      </CardContent>
    </Card>
  );
}
