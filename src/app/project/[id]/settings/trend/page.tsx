'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { getProject, listInspirationCards, saveInspirationCards } from '@/lib/db/queries';
import { RANK_SOURCES, getTrend, generateTrendInspiration } from '@/lib/trend/trends';
import { PLATFORMS, worksByPlatform, platformOf } from '@/lib/originality/works-db';
import { generateDeconstruction } from '@/lib/deconstruct/analyzer';
import { mergeCardIntoOutline } from '@/lib/inspiration/merge';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TrendingUp, Loader2, Sparkles, Lightbulb, ScanText, Radio } from 'lucide-react';
import type { InspirationCard } from '@/types';
import type { RankFetchResult } from '@/lib/rank/scraper';
import { saveLiveRankedWorks, countLiveRankedWorks, clearLiveRankedWorks } from '@/lib/rank/store';

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
  const [rank, setRank] = useState<RankFetchResult | null>(null);
  const [fetchingRank, setFetchingRank] = useState(false);
  const [liveStats, setLiveStats] = useState<{ total: number; platforms: number }>({
    total: 0,
    platforms: 0,
  });

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
  const platform = platformOf(sourceId);
  const platformWorks = worksByPlatform(sourceId);

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

  const handleMergeCard = async (c: InspirationCard) => {
    try {
      await mergeCardIntoOutline(projectId, c);
      toast.success('已并入大纲（创作工作台 · 大纲视图可查看）');
    } catch {
      toast.error('并入失败');
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

  const SCRAPABLE = ['fanqie', 'feilu', 'hongxiu'];

  const refreshLiveStats = useCallback(async () => {
    try {
      setLiveStats(await countLiveRankedWorks());
    } catch {
      setLiveStats({ total: 0, platforms: 0 });
    }
  }, []);

  useEffect(() => {
    void refreshLiveStats();
  }, [refreshLiveStats]);

  const handleClearLive = async () => {
    try {
      await clearLiveRankedWorks();
      setLiveStats({ total: 0, platforms: 0 });
      toast.success('已清空运行时查重库');
    } catch {
      toast.error('清空失败');
    }
  };

  const handleFetchRank = async () => {
    setFetchingRank(true);
    setRank(null);
    try {
      const res = await fetch(`/api/rank/fetch?platform=${encodeURIComponent(sourceId)}`);
      const data: RankFetchResult = await res.json();
      setRank(data);
      if (data.ok && data.books.length > 0) {
        await saveLiveRankedWorks(data.books, data.sourceName);
        await refreshLiveStats();
        toast.success(`已将 ${data.books.length} 部实时热书并入运行时查重`);
      }
    } catch (e) {
      setRank({
        ok: false,
        sourceId,
        sourceName: platform?.name ?? sourceId,
        url: '',
        fetchedAt: Date.now(),
        message: e instanceof Error ? e.message : String(e),
        books: [],
      });
    } finally {
      setFetchingRank(false);
    }
  };

  const handleRankToCards = async () => {
    if (!rank || rank.books.length === 0) {
      toast.warning('暂无抓取到的作品可拆解');
      return;
    }
    setPasting(true);
    try {
      const text = rank.books
        .map((b) => `${b.rank}、${b.title}${b.author ? `（作者 ${b.author}）` : ''}`)
        .join('\n');
      const { cards } = await generateDeconstruction(projectId, `${rank.sourceName} 实时榜单`, text);
      if (cards.length > 0) await saveInspirationCards(cards);
      await loadCards();
      toast.success(cards.length ? `已从实时榜单拆出 ${cards.length} 条灵感` : '未拆出灵感卡');
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
                    {SCRAPABLE.includes(s.id) && (
                      <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-700">实时</span>
                    )}
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

      {/* 平台榜单参考（查重黑名单） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            平台小说榜单参考
          </CardTitle>
          <CardDescription className="text-xs">
            内置各大小说平台 / 写作软件的代表作品与高热题材，作为选题方向参考。下列作品同时接入查重黑名单，生成正文与投稿体检测出撞梗时会自动提示，帮您避免与平台作品重复
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-stone-600">
          <p>
            当前平台高热题材：{platform?.tags.slice(0, 8).join('、') || '—'}
          </p>
          <div>
            <p className="mb-1 text-stone-500">各平台代表作品（榜单参考 · 查重黑名单）：</p>
            <div className="grid gap-1.5 md:grid-cols-2">
              {PLATFORMS.map((pl) => (
                <div key={pl.id} className="rounded-md border border-stone-200 bg-stone-50/60 p-2">
                  <p className="font-medium text-stone-700">
                    {pl.name}
                    {pl.id === sourceId && (
                      <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] text-brand-700">当前</span>
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-stone-500">
                    {pl.representative.join('、')}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {platformWorks.length > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-700">
              当前平台 {platform?.name} 已有 {platformWorks.length} 部代表作纳入查重：请在同题材下做差异化设定与人设，避免整体复刻。
            </p>
          )}
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
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void handleMergeCard(c)}
                      className="text-xs text-brand-600 hover:text-brand-700"
                    >
                      并入大纲
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 实时榜单抓取 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-emerald-500" />
            实时榜单抓取
          </CardTitle>
          <CardDescription className="text-xs">
            CORS 只挡浏览器，服务端直接抓取可解析 SSR / 静态直出平台（番茄、飞卢带<span className="text-emerald-600 font-medium">实时</span>标记）；被 JS 渲染 / 反爬盾阻断的平台会提示改用浏览器打开后粘贴拆解
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleFetchRank} disabled={fetchingRank}>
              {fetchingRank && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              抓取 {platform?.name ?? sourceId} 实时榜单
            </Button>
            {rank?.blocked && rank.targetUrl && (
              <a
                href={rank.targetUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-600 underline decoration-brand-300 hover:text-brand-700"
              >
                在浏览器打开榜单 →
              </a>
            )}
          </div>

          {liveStats.total > 0 && (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700">
              <span>
                运行时查重库：已并入 {liveStats.total} 部热书 / 覆盖 {liveStats.platforms} 个平台（生成与投稿体检会对照提醒）
              </span>
              <button
                type="button"
                onClick={handleClearLive}
                className="font-medium underline decoration-emerald-300 hover:text-emerald-600"
              >
                清空
              </button>
            </p>
          )}

          {rank && (
            <div className="rounded-md border border-stone-200 bg-stone-50/70 p-3 text-xs">
              <p className={rank.ok ? 'text-emerald-600' : 'text-stone-500'}>{rank.message}</p>
              {rank.books.length > 0 && (
                <>
                  <ol className="mt-2 grid gap-1 md:grid-cols-2">
                    {rank.books.map((b, idx) => (
                      <li
                        key={`${b.title}-${idx}`}
                        className="truncate text-stone-600"
                      >
                        <span className="mr-1 inline-block w-4 text-right text-stone-400">{b.rank ?? idx + 1}</span>
                        {b.title}
                        {b.author && <span className="text-stone-400">（{b.author}）</span>}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={handleRankToCards} disabled={pasting}>
                      {pasting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      拆解成灵感（并入下方收藏卡）
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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