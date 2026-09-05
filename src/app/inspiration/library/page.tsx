'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, Library as LibraryIcon, Copy, Check, Plus, Trash2, BookOpen, Settings2 } from 'lucide-react';
import { listAllInspirationCards, deleteInspirationCard, listProjects } from '@/lib/db/queries';
import { mergeCardIntoOutline, mergeCardIntoWorldview } from '@/lib/inspiration/merge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { InspirationCard, NovelProject } from '@/types';

const KIND_LABEL: Record<InspirationCard['kind'], string> = {
  'golden-three': '黄金三章',
  hook: '钩子',
  coolpoint: '爽点',
  pacing: '节奏',
  character: '人物',
  structure: '结构',
  other: '其他',
};

const KIND_ORDER: InspirationCard['kind'][] = ['golden-three', 'hook', 'coolpoint', 'pacing', 'character', 'structure', 'other'];

export default function GlobalLibraryPage() {
  const [cards, setCards] = useState<InspirationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<InspirationCard['kind'] | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<NovelProject[]>([]);
  const [targetProjectId, setTargetProjectId] = useState('');
  const [mergingId, setMergingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cs, ps] = await Promise.all([listAllInspirationCards(), listProjects()]);
      setCards(cs);
      setProjects(ps);
    } catch {
      toast.error('加载全局灵感库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () =>
      cards.filter((c) => {
        const matchKind = kindFilter === 'all' || c.kind === kindFilter;
        const kw = search.trim().toLowerCase();
        const matchSearch = !kw || `${c.title}${c.content}${KIND_LABEL[c.kind]}`.toLowerCase().includes(kw);
        return matchKind && matchSearch;
      }),
    [cards, kindFilter, search]
  );

  const handleCopy = async (c: InspirationCard) => {
    try {
      await navigator.clipboard.writeText(`【${KIND_LABEL[c.kind]}】${c.title}：${c.content}`);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      toast.error('复制失败');
    }
  };

  const handleMerge = async (c: InspirationCard) => {
    if (!targetProjectId) {
      toast.warning('请先在上方选择要并入的项目');
      return;
    }
    setMergingId(c.id);
    try {
      await mergeCardIntoOutline(targetProjectId, c);
      toast.success(`已并入「${projects.find((p) => p.id === targetProjectId)?.title ?? '该项目'}」的大纲`);
    } catch (e) {
      toast.error('并入大纲失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setMergingId(null);
    }
  };

  const handleMergeToWorldview = async (c: InspirationCard) => {
    if (!targetProjectId) {
      toast.warning('请先在上方选择要并入的项目');
      return;
    }
    setMergingId(c.id);
    try {
      await mergeCardIntoWorldview(targetProjectId, c);
      toast.success(`已并入「${projects.find((p) => p.id === targetProjectId)?.title ?? '该项目'}」的世界观规则`);
    } catch (e) {
      toast.error('并入世界观规则失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setMergingId(null);
    }
  };

  const handleDelete = async (c: InspirationCard) => {
    if (!window.confirm(`删除灵感「${c.title}」？`)) return;
    await deleteInspirationCard(c.id);
    setCards((prev) => prev.filter((x) => x.id !== c.id));
    toast.info('灵感已删除');
  };

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
        <p className="py-20 text-center text-stone-500">加载全局灵感库…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <Link href="/inspiration" className="mb-6 inline-flex items-center text-sm text-stone-500 hover:text-stone-700">
        <ChevronLeft className="mr-1 h-4 w-4" />
        返回找灵感
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-bold text-brand-800">
          <LibraryIcon className="h-5 w-5 text-brand-500" />
          全局灵感库
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          跨项目归集你收藏/生成的所有灵感卡（趋势灵感自动收藏于此），可搜索、筛选，并并入任意项目的大纲或世界观规则反哺创作
        </p>
      </header>

      {/* 并入目标选择 */}
      {projects.length > 0 && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <Label>并入到项目大纲</Label>
            <select
              value={targetProjectId}
              onChange={(e) => setTargetProjectId(e.target.value)}
              className="min-w-48 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">选择项目…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <span className="text-xs text-stone-400">选中后，可把灵感卡「并入大纲」或「并入世界观规则」</span>
          </CardContent>
        </Card>
      )}

      {/* 筛选 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索标题 / 内容 / 类别…"
          className="w-56 rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {(['all', ...KIND_ORDER] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                kindFilter === k
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-stone-200 text-stone-500 hover:bg-stone-50'
              )}
            >
              {k === 'all' ? '全部' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-stone-400">共 {filtered.length} 条</span>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <LibraryIcon className="mb-3 h-10 w-10 text-stone-300" />
            <p className="text-sm text-stone-500">暂无灵感卡</p>
            <Link href="/inspiration" className="mt-2 text-sm text-brand-600 hover:text-brand-700">
              去「趋势灵感」生成并自动收藏
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                    {KIND_LABEL[c.kind]}
                  </span>
                  <span className="text-[10px] text-stone-400">
                    {new Date(c.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <CardTitle className="text-sm">{c.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col pb-3">
                <CardDescription className="line-clamp-3 flex-1 text-xs">{c.content}</CardDescription>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => void handleCopy(c)}>
                    {copiedId === c.id ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                    {copiedId === c.id ? '已复制' : '复制'}
                  </Button>
                  {projects.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => void handleMerge(c)} disabled={mergingId === c.id}>
                      <BookOpen className="mr-1 h-3 w-3" />
                      并入大纲
                    </Button>
                  )}
                  {projects.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => void handleMergeToWorldview(c)} disabled={mergingId === c.id}>
                      <Settings2 className="mr-1 h-3 w-3" />
                      并入世界观
                    </Button>
                  )}
                  <Link
                    href={`/project/new?auto=1&idea=${encodeURIComponent(`${c.title}：${c.content}`)}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-brand-600 hover:text-brand-700"
                  >
                    <Plus className="h-3 w-3" />
                    以此新建小说
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c)}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-600"
                    aria-label="删除灵感"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}