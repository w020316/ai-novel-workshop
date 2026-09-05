'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, TrendingUp, Loader2, Sparkles, Lightbulb, Copy, Check, Plus, Library as LibraryIcon } from 'lucide-react';
import { RANK_SOURCES, getTrend, generateTrendInspiration, INSPIRATION_CHANNELS, listGenresByChannel } from '@/lib/trend/trends';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { saveInspirationCards, GLOBAL_PROJECT_ID } from '@/lib/db/queries';
import { toast } from 'sonner';
import type { InspirationCard } from '@/types';

type ChannelId = (typeof INSPIRATION_CHANNELS)[number]['id'];

export default function InspirationPage() {
  const [sourceId, setSourceId] = useState('qidian');
  const [channel, setChannel] = useState<ChannelId>('all');
  const [genre, setGenre] = useState('玄幻');
  const [generating, setGenerating] = useState(false);
  const [cards, setCards] = useState<InspirationCard[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 按频道过滤题材；当前题材不在该频道时自动回落到频道首个题材
  const genreOptions = listGenresByChannel(channel);
  const effectiveGenre = genreOptions.includes(genre) ? genre : genreOptions[0];
  const trend = getTrend(sourceId, effectiveGenre);

  const handleGenerate = async () => {
    if (!trend) return;
    setGenerating(true);
    try {
      // 生成后自动收藏到全局灵感库（projectId='global'），跨项目可复用
      const { cards: generated } = await generateTrendInspiration('', sourceId, effectiveGenre);
      const withGlobal = generated.map((c) => ({ ...c, projectId: GLOBAL_PROJECT_ID }));
      setCards(withGlobal);
      if (withGlobal.length > 0) {
        await saveInspirationCards(withGlobal);
        toast.success(`已收藏 ${withGlobal.length} 条到全局灵感库`);
      }
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (c: InspirationCard) => {
    try {
      await navigator.clipboard.writeText(`${c.title}：${c.content}`);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center text-sm text-stone-500 hover:text-stone-700"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回首页
      </Link>

      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-brand-800">趋势灵感 · 找选题</h1>
          <p className="mt-1 text-sm text-stone-500">
            还没有项目也能逛：按平台与题材看看热门风向，找找写作灵感
          </p>
        </div>
        <Link
          href="/inspiration/library"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
        >
          <LibraryIcon className="h-4 w-4" />
          全局灵感库
        </Link>
      </header>

      <div className="space-y-4">
        <Card className="border-brand-200 bg-gradient-to-br from-brand-50/30 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              平台 × 题材
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>频道</Label>
              <div className="flex flex-wrap gap-2">
                {INSPIRATION_CHANNELS.map((ch) => (
                  <label key={ch.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="insp-channel"
                      checked={channel === ch.id}
                      onChange={() => setChannel(ch.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'inline-block rounded-md border px-3 py-1.5 text-sm transition-colors',
                        'border-stone-300 text-stone-600',
                        'peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700'
                      )}
                    >
                      {ch.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>平台</Label>
              <div className="flex flex-wrap gap-2">
                {RANK_SOURCES.map((s) => (
                  <label key={s.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="insp-source"
                      checked={sourceId === s.id}
                      onChange={() => setSourceId(s.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'inline-block rounded-md border px-3 py-1.5 text-sm transition-colors',
                        'border-stone-300 text-stone-600',
                        'peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700'
                      )}
                    >
                      {s.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>题材</Label>
              <div className="flex flex-wrap gap-2">
                {genreOptions.map((g) => (
                  <label key={g} className="cursor-pointer">
                    <input
                      type="radio"
                      name="insp-genre"
                      checked={effectiveGenre === g}
                      onChange={() => setGenre(g)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'inline-block rounded-md border px-3 py-1.5 text-sm transition-colors',
                        'border-stone-300 text-stone-600',
                        'peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700'
                      )}
                    >
                      {g}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <p className="text-xs text-stone-400">
              内置趋势参考（非实时榜单）。点「以此新建小说」一键开书：自动备齐书名、简介、金手指等开书包并查重避撞，微调即可开写。
            </p>
          </CardContent>
        </Card>

        {trend && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-brand-500" />
                {trend.sourceName} × {trend.genre} · 热门风向
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-stone-600">
              <p className="rounded-md border border-stone-200 bg-stone-50 p-2.5">{trend.hotspot}</p>
              {trend.tropes.length > 0 && <p>高频桥段：{trend.tropes.slice(0, 5).join('、')}</p>}
              {trend.contrast.length > 0 && <p>人设反差切入：{trend.contrast.join('；')}</p>}
              <p>开篇/断章钩子：{trend.hookPattern}</p>
              {trend.words.length > 0 && (
                <p className="text-stone-500">热度词：{trend.words.join(' · ')}</p>
              )}
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                {cards.length ? '再想想 / 换一批' : '生成灵感'}
              </Button>
            </CardContent>
          </Card>
        )}

        {cards.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-brand-500" />
                灵感卡（{cards.length}）
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {cards.map((c) => (
                <div key={c.id} className="rounded-md border border-stone-200 p-3">
                  <p className="text-xs font-medium text-stone-800">{c.title}</p>
                  <p className="mt-1 text-xs text-stone-600">{c.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(c)}
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                    >
                      {copiedId === c.id ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copiedId === c.id ? '已复制' : '复制灵感'}
                    </button>
                    <Link
                      href={`/project/new?auto=1&genre=${encodeURIComponent(effectiveGenre)}&idea=${encodeURIComponent(
                        `${c.title}：${c.content}`
                      )}`}
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                    >
                      <Plus className="h-3 w-3" />
                      以此新建小说
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}