'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { listChapters, getProject } from '@/lib/db/queries';
import { buildDashboardData } from '@/lib/dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Chapter, NovelProject } from '@/types';

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [project, setProject] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, chs] = await Promise.all([getProject(projectId), listChapters(projectId)]);
      setProject(p ?? null);
      setChapters(chs);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
        <p className="py-20 text-center text-stone-500">加载数据看板…</p>
      </main>
    );
  }

  const d = buildDashboardData(chapters);
  const title = project?.title ?? '项目';
  const fmt = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n));

  // SVG 柱状图（逐章字数）归一化高度
  const W = 640;
  const H = 180;
  const pad = 8;
  const n = Math.max(1, d.series.length);
  const barW = (W - pad) / n;
  const area = (i: number, h: number) => h - Math.max(2, (h * d.series[i].wordCount) / d.maxChapterWords);

  // 累计字数折线
  const lineY = (cum: number) => pad + (H - 2 * pad) * (1 - cum / d.cumulativePeak);
  const points = d.series
    .map((p, i) => `${(i + 0.5) * barW + pad / 2},${lineY(p.cumulative)}`)
    .join(' ');

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <Link href={`/project/${projectId}`} className="mb-6 inline-flex items-center text-sm text-stone-500 hover:text-stone-700">
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回 {title}
      </Link>
      <button onClick={() => router.refresh()} className="sr-only">刷新</button>

      <header className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-brand-800">写作数据看板</h1>
        <p className="mt-1 text-sm text-stone-500">《{title}》· 逐章字数与进度总览 · 数据仅存本地</p>
      </header>

      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-stone-500">累计字数</p>
          <p className="mt-1 font-serif text-2xl font-bold text-brand-700">{fmt(d.totalWords)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-stone-500">章节</p>
          <p className="mt-1 font-serif text-2xl font-bold text-brand-700">
            {d.completedChapters}<span className="text-sm text-stone-400"> / {d.totalChapters} 完成</span>
          </p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-stone-500">平均每章字数</p>
          <p className="mt-1 font-serif text-2xl font-bold text-brand-700">{fmt(d.avgWordsPerChapter)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-stone-500">近 7 天新增</p>
          <p className="mt-1 font-serif text-2xl font-bold text-emerald-700">+{fmt(d.last7dWords)}</p>
        </CardContent></Card>
      </div>

      {/* 逐章字数柱状图 */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">逐章字数</CardTitle>
          <CardDescription>最高章《第{d.longestChapter?.chapterNo ?? '-'}章》{fmt(d.longestChapter?.wordCount ?? 0)} 字</CardDescription>
        </CardHeader>
        <CardContent>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="逐章字数柱状图" preserveAspectRatio="none">
            {d.series.map((p, i) => (
              <rect
                key={p.chapterNo}
                x={i * barW}
                width={Math.max(1, barW - 1.5)}
                y={area(i, H - 2 * pad) - pad}
                height={Math.max(0, p.wordCount ? (H - 2 * pad) * (p.wordCount / d.maxChapterWords) : 1)}
                rx={1.5}
                className={p.status === 'completed' ? 'fill-brand-300' : 'fill-stone-200'}
              />
            ))}
          </svg>
        </CardContent>
      </Card>

      {/* 累计字数折线 */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">字数进度</CardTitle>
          <CardDescription>随章节推进的累计字数 {fmt(d.cumulativePeak)} 字</CardDescription>
        </CardHeader>
        <CardContent>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="累计字数折线图" preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke="#c0332c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </CardContent>
      </Card>
    </main>
  );
}