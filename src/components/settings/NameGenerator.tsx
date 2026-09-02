'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateNamesWithLLM } from '@/lib/llm/generators/name-generator';
import { generateNameTemplate, NAME_CATEGORY_LABEL } from '@/lib/name/template';
import { saveInspirationCards } from '@/lib/db/queries';
import { generateId } from '@/lib/utils';
import type { Genre, InspirationCard, NameCategory, NameIdea } from '@/types';
import { Wand2, Loader2, Copy, BookmarkPlus, Check } from 'lucide-react';

interface NameGeneratorProps {
  projectId: string;
}

export const NAME_CATEGORY_OPTIONS: Array<{ value: NameCategory; label: string }> = [
  { value: 'person', label: '人名' },
  { value: 'place', label: '地名' },
  { value: 'skill', label: '功法' },
  { value: 'sect', label: '门派' },
  { value: 'weapon', label: '兵器' },
  { value: 'treasure', label: '法宝' },
];

const GENRE_OPTIONS: Array<{ value: '' | Genre; label: string }> = [
  { value: '', label: '不限题材' },
  { value: '玄幻', label: '玄幻' },
  { value: '言情', label: '言情' },
  { value: '悬疑', label: '悬疑' },
  { value: '科幻', label: '科幻' },
  { value: '都市', label: '都市' },
  { value: '历史', label: '历史' },
  { value: '末世', label: '末世' },
  { value: '游戏', label: '游戏' },
  { value: '宫斗', label: '宫斗' },
  { value: '其他', label: '其他' },
];

export function NameGenerator({ projectId }: NameGeneratorProps) {
  const [category, setCategory] = useState<NameCategory>('person');
  const [topic, setTopic] = useState('');
  const [genre, setGenre] = useState<'' | Genre>('');
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<NameIdea[]>([]);
  const [usedTemplate, setUsedTemplate] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.warning('请先输入类别相关的主题关键词');
      return;
    }
    setGenerating(true);
    setResults([]);
    setSaved({});
    try {
      const input = {
        projectId,
        category,
        topic: topic.trim(),
        genre: genre || undefined,
        count,
      };
      let names = await generateNamesWithLLM(input);
      let usedTemplateNow = false;
      if (names.length === 0) {
        names = generateNameTemplate(input);
        usedTemplateNow = true;
      }
      setResults(names);
      setUsedTemplate(usedTemplateNow);
      toast.success(
        usedTemplateNow ? '已用模板生成（LLM 暂不可用）' : `已生成 ${names.length} 个${NAME_CATEGORY_LABEL[category]}`
      );
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveCard = async (idea: NameIdea) => {
    const card: InspirationCard = {
      id: generateId('insp'),
      projectId,
      kind: 'other',
      title: idea.name,
      content: `[${NAME_CATEGORY_LABEL[category]}] ${idea.meaning}${genre ? ` · ${genre}题材` : ''}`,
      sourceDeconstructionId: '',
      createdAt: Date.now(),
    };
    try {
      await saveInspirationCards([card]);
      setSaved((m) => ({ ...m, [idea.id]: true }));
      toast.success('已收藏为灵感卡');
    } catch (e) {
      toast.error('收藏失败', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleCopy = async (idea: NameIdea) => {
    try {
      await navigator.clipboard.writeText(idea.name);
      setCopied(idea.id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/50 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-brand-600" />
              起名工具
            </CardTitle>
            <CardDescription>
              按类别与题材批量生成人名/地名/功法/门派/兵器/法宝，可一键复制或收藏为灵感卡反哺创作
            </CardDescription>
          </div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            LLM 生成 · 模板兜底
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>类别</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as NameCategory)}
              disabled={generating}
              className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {NAME_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>题材（可选）</Label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as '' | Genre)}
              disabled={generating}
              className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {GENRE_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>数量（1-10）</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) =>
                setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
              }
              disabled={generating}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerate}
              disabled={generating || !topic.trim()}
              className="w-full"
            >
              重新生成
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>主题关键词</Label>
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="如人物：冷酷剑修、惊艳校花｜功法：冰系、霸体、剑道…"
            disabled={generating}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <p className="text-[11px] text-stone-500">
            输入与命名对象相关的主题/风格关键词，生成的名称更贴切。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleGenerate} disabled={generating || !topic.trim()} size="sm">
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" />
                生成{NAME_CATEGORY_LABEL[category]}
              </>
            )}
          </Button>
          {results.length > 0 && usedTemplate && (
            <span className="text-[10px] text-stone-400">LLM 暂不可用，已用本地模板生成</span>
          )}
        </div>

        {/* 结果 */}
        {results.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {results.map((idea, idx) => (
              <div key={idea.id} className="rounded-md border border-stone-200 bg-stone-50/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-50 text-[10px] font-medium text-brand-600">
                      {idx + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-stone-800">{idea.name}</p>
                  </div>
                  <span
                    className="inline-block shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500"
                  >
                    {NAME_CATEGORY_LABEL[category]}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-stone-500">{idea.meaning}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(idea)}
                    className="flex items-center gap-1 text-xs text-stone-500 transition-colors hover:text-brand-600"
                  >
                    {copied === idea.id ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied === idea.id ? '已复制' : '复制'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveCard(idea)}
                    className="flex items-center gap-1 text-xs text-stone-500 transition-colors hover:text-brand-600"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    {saved[idea.id] ? '已收藏' : '收藏为灵感卡'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}