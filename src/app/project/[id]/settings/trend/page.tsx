'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { getProject, listInspirationCards, saveInspirationCards } from '@/lib/db/queries';
import { RANK_SOURCES, getTrend, generateTrendInspiration } from '@/lib/trend/trends';
import { generateDeconstruction } from '@/lib/deconstruct/analyzer';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, Loader2, Sparkles, Lightbulb, ScanText } from 'lucide-react';
import type { InspirationCard } from '@/types';

const GENRES = ['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他'];
const RHYTHM_LABEL: Record<string, string> = { fast: '快节奏', medium: '中等', slow: '慢节奏' };
const KIND_LABEL: Record<InspirationCard['kind'], string> = {
  'golden-three': '黄金三章',
  hook: '钩子',
  coolpoint: '爽点',
  pacing: '节奏',
  character: '人物',
  structure: '结构',
  other: '其他',
};

export default function TrendPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [sourceId, setSourceId] = useState('qidian');
  const [genre, setGenre] = useState('玄幻');
  const [generating, setGenerating] = useState(false);
  const [savedCards, setSavedCards] = useState<InspirationCard[]>([]);
  const [listText, setListText] = useState('');
  const [pasting, setPasting] = useState(false);

  const loadCards = useCallback(async () => {
    setSavedCards(await listInspirationCards(projectId));
  }, [projectId]);

  useEffect(() => {
    void loadCards();
    getProject(projectId).then((p) => {
      if (p?.genre) setGenre(p.genre);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const trend = getTrend(sourceId, genre);

  const handleGenerate = async () => {
    if (!trend) return;
    setGenerating(true);
    try {
      const { cards, fromLLM } = await generateTrendInspiration(projectId, sourceId, genre);
      await saveInspirationCards(cards);
      await loadCards();
      toast.success(
        fromLLM ? `已生成并收藏 ${cards.length} 张趋势灵感卡` : '已按内置趋势收藏灵感卡（LLM 暂不可用）'
      );
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const handlePasteList = async () => {
    if (!listText.trim()) {
      toast.warning('请先粘贴榜单/书单文本');
      return;
    }
    setPasting(true);
    try {
      const { cards } = await generateDeconstruction(projectId, '榜单/书单文本', listText);
      if (cards.length > 0) await saveInspirationCards(cards);
      await loadCards();
      toast.success(cards.length ? `已从榜单拆出 ${cards.length} 条灵感` : '未拆出灵感卡（文本过短或需更完整）');
      setListText('');
    } catch (e) {
      toast.error('拆解失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <Card className="border-brand-200 bg-gradient-to-br from-brand-50/30 to-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            <CardTitle className="text-base">趋势灵感 · 扫榜</CardTitle>
          </div>
          <CardDescription>
            基于平台口味与爆款方法论，给出「渠道 × 题材」的选题风向，生成可收藏灵感卡反哺创作
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>平台 / 榜单渠道</Label>
            <div className="flex flex-wrap gap-2">
              {RANK_SOURCES.map((s) => (
                <label key={s.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="rank-source"
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
            <p className="text-xs text-stone-400">
              内置趋势参考（基于公开讨论与爆款方法论整理，非实时榜单）；真实榜单可粘贴到下方「榜单拆解」
            </p>
          </div>

          <div className="space-y-1">
            <Label>题材</Label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <label key={g} className="cursor-pointer">
                  <input
                    type="radio"
                    name="rank-genre"
                    checked={genre === g}
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
        </CardContent>
      </Card>

      {/* 内置风向 */}
      {trend && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-brand-500" />
              {trend.sourceName} × {trend.genre} · 热门风向
            </CardTitle>
            <CardDescription className="text-xs">
              {trend.sourceFocus} · {trend.rhythm && RHYTHM_LABEL[trend.rhythm]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-stone-600">
            <p className="rounded-md border border-stone-200 bg-stone-50 p-2.5">{trend.hotspot}</p>
            {trend.tropes.length > 0 && <p>高频桥段：{trend.tropes.slice(0, 5).join('、')}</p>}
            {trend.contrast.length > 0 && <p>人设反差切入点：{trend.contrast.join('；')}</p>}
            <p>
              开篇/断章钩子：{trend.hookPattern}
            </p>
            {trend.words.length > 0 && (
              <p className="text-stone-500">热度词：{trend.words.join(' · ')}</p>
            )}
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              基于此生成灵感卡
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 已收藏灵感卡 */}
      {savedCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-brand-500" />
              已收藏灵感卡（{savedCards.length}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {savedCards.map((c) => (
                <div key={c.id} className="rounded-md border border-stone-200 p-3">
                  <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                    {KIND_LABEL[c.kind]}
                  </span>
                  <p className="mt-1 text-xs font-medium text-stone-800">{c.title}</p>
                  <p className="mt-0.5 text-xs text-stone-600">{c.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 榜单粘贴拆解 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanText className="h-4 w-4 text-brand-500" />
            榜单 / 书单粘贴拆解
          </CardTitle>
          <CardDescription className="text-xs">
            把你看到的某站榜单、书单或片段粘贴进来，拆出可收藏的灵感（建议 500 字以上）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            placeholder="粘贴榜单/书单/参考片段…"
            rows={4}
          />
          <Button variant="outline" size="sm" onClick={handlePasteList} disabled={pasting}>
            {pasting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            拆解成灵感
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}