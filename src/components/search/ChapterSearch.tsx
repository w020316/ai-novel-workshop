'use client';

// 跨章全文检索卡片
// 输入关键词即在全部章节正文检索（人名/伏笔/设定词），展示命中章节 + 上下文片段
//  + 命中次数，点击跳转到对应章节，便于百万字长篇快速定位设定出现位置。
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Search, Loader2, BookOpenText, FileText } from 'lucide-react';
import { listChapters } from '@/lib/db/queries';
import { searchChapters, type ChapterSearchResult } from '@/lib/search/chapter-search';
import type { Chapter } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export function ChapterSearch() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<ChapterSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const chapters = await listChapters(projectId);
      const res = searchChapters(
        chapters.map((c: Chapter) => ({
          id: c.id,
          chapterNo: c.chapterNo,
          title: c.title,
          content: c.content,
        })),
        q
      );
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : '检索失败');
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2">
          <BookOpenText className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-medium text-stone-800">跨章全文检索</h2>
        </div>
        <p className="text-xs text-stone-500">
          在全部章节正文中搜索人名、伏笔或设定词，快速定位其出现的位置
        </p>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="如：主角名 / 金手指 / 某件神器"
            aria-label="跨章检索关键词"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            检索
          </Button>
        </div>

        {error && <p className="text-xs text-accent-600">{error}</p>}

        {result && (
          <div className="space-y-3">
            <p className="text-xs text-stone-500">
              找到 <strong>{result.matchedChapters}</strong> 章 · 共{' '}
              <strong>{result.totalMatches}</strong> 处命中「{result.query}」
              {result.matchedChapters === 0 && '（可尝试换更短的词）'}
            </p>
            {result.hits.slice(0, 20).map((hit) => (
              <div
                key={hit.chapterId}
                className="rounded-md border border-stone-200 bg-stone-50/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/project/${projectId}/workbench/chapter/${hit.chapterNo}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    第{hit.chapterNo}章 {hit.title}
                  </Link>
                  <span className="text-xs text-stone-400">命中 {hit.count} 处</span>
                </div>
                <div className="mt-2 space-y-1">
                  {hit.snippets.map((s, i) => (
                    <p key={i} className="text-xs leading-relaxed text-stone-600">
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            {result.matchedChapters > 20 && (
              <p className="text-xs text-stone-400">仅展示前 20 章，其余请逐步缩小关键词</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}