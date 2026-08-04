'use client';

import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listGenreTemplates } from '@/lib/db/queries';
import { GENRE_TEMPLATE_SEEDS } from '@/lib/db/seed';
import { cn } from '@/lib/utils';
import type { GenreTemplate, Genre } from '@/types';
import {
  Library,
  Loader2,
  Tag,
  Zap,
  Users,
  Search,
  Check,
} from 'lucide-react';

interface GenreTemplateListProps {
  currentGenre: Genre;
  onSelect?: (template: GenreTemplate) => void;
}

const ALL_GENRES: Genre[] = [
  '玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他',
];

// 流派名（按种子数据中的 variant 字段）通过 id 索引
function getVariantName(template: GenreTemplate, index: number): string {
  const seed = GENRE_TEMPLATE_SEEDS[index];
  return seed?.variant ?? template.genre;
}

export function GenreTemplateList({ currentGenre, onSelect }: GenreTemplateListProps) {
  const [templates, setTemplates] = useState<GenreTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGenre, setFilterGenre] = useState<Genre | 'all'>(currentGenre);
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setFilterGenre(currentGenre);
  }, [currentGenre]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await listGenreTemplates();
        setTemplates(list);
      } catch (e) {
        toast.error('加载题材模板失败', {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = templates;
    if (filterGenre !== 'all') {
      list = list.filter((t) => t.genre === filterGenre);
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.pacingRule.toLowerCase().includes(kw) ||
          t.highlightDesign.toLowerCase().includes(kw) ||
          t.readerPreference.toLowerCase().includes(kw) ||
          t.typicalArcs.some((a) => a.toLowerCase().includes(kw))
      );
    }
    return list;
  }, [templates, filterGenre, keyword]);

  const handleSelect = (t: GenreTemplate) => {
    setSelectedId(t.id);
    onSelect?.(t);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="space-y-3">
        {/* 题材过滤 */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterGenre('all')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              filterGenre === 'all'
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
            )}
          >
            全部
          </button>
          {ALL_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setFilterGenre(g)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                filterGenre === g
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
              )}
            >
              {g}
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节奏、爽点、读者偏好或典型弧线…"
            className="h-9 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </div>

        {/* 计数 */}
        <p className="text-xs text-stone-500">
          共 {templates.length} 个题材模板 · 当前显示 {filtered.length} 个
        </p>
      </div>

      {/* 模板卡片网格 */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Library className="h-8 w-8 text-stone-300" />
              <p className="text-sm text-stone-500">
                {keyword ? '无匹配结果，试试调整关键词或题材筛选' : '暂无题材模板'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const variant = getVariantName(t, templates.indexOf(t));
            const isSelected = selectedId === t.id;
            const isCurrentGenre = t.genre === currentGenre;
            return (
              <Card
                key={t.id}
                className={cn(
                  'flex flex-col transition-all',
                  isSelected
                    ? 'border-brand-600 ring-1 ring-brand-200'
                    : 'hover:border-stone-300 hover:shadow-sm'
                )}
              >
                <CardContent className="flex flex-1 flex-col pt-5">
                  {/* 头部 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-stone-800">
                          {t.genre}
                        </h3>
                        <span className="text-[11px] text-stone-500">·</span>
                        <span className="text-[11px] font-medium text-brand-700">
                          {variant}
                        </span>
                      </div>
                      {isCurrentGenre && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700">
                          <Tag className="h-2.5 w-2.5" />
                          匹配当前项目
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>

                  {/* 节奏 */}
                  <div className="mt-3 space-y-2 text-[11px]">
                    <div>
                      <p className="flex items-center gap-1 text-stone-400">
                        <Zap className="h-2.5 w-2.5" />
                        节奏规律
                      </p>
                      <p className="mt-0.5 text-stone-700">{t.pacingRule}</p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-stone-400">
                        <Zap className="h-2.5 w-2.5" />
                        爽点设计
                      </p>
                      <p className="mt-0.5 text-stone-700">{t.highlightDesign}</p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-stone-400">
                        <Users className="h-2.5 w-2.5" />
                        读者偏好
                      </p>
                      <p className="mt-0.5 text-stone-700">{t.readerPreference}</p>
                    </div>
                  </div>

                  {/* 典型弧线 */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {t.typicalArcs.map((arc) => (
                      <span
                        key={arc}
                        className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600"
                      >
                        {arc}
                      </span>
                    ))}
                  </div>

                  {/* 操作 */}
                  {onSelect && (
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      <Button
                        size="sm"
                        variant={isSelected ? 'default' : 'outline'}
                        className="w-full"
                        onClick={() => handleSelect(t)}
                      >
                        {isSelected ? '已选择' : '应用此模板'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
