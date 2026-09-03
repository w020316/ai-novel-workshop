'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listChapters } from '@/lib/db/queries';
import { multiPlatformReview, PLATFORMS, platformVerdictLabel } from '@/lib/review/multi-platform-review';
import type { MultiPlatformReview, PlatformId, PlatformScore } from '@/lib/review/multi-platform-review';
import type { Chapter } from '@/types';
import {
  Loader2,
  RefreshCw,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, countChineseWords } from '@/lib/utils';

const PLATFORM_ICONS: Record<PlatformId, string> = {
  fanqie: '🍅',
  qidian: '📖',
  zhihu: '💡',
  coldread: '👁️',
};

const VERDICT_COLORS: Record<string, string> = {
  strong: 'text-green-600 bg-green-50 border-green-200',
  ok: 'text-amber-600 bg-amber-50 border-amber-200',
  weak: 'text-red-500 bg-red-50 border-red-200',
};

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<MultiPlatformReview | null>(null);
  const [activeTab, setActiveTab] = useState<PlatformId>('fanqie');
  const [chapterDropdownOpen, setChapterDropdownOpen] = useState(false);

  const loadChapters = useCallback(async () => {
    try {
      const chs = await listChapters(projectId);
      setChapters(chs);
      if (chs.length > 0 && !selectedChapter) {
        setSelectedChapter(chs[chs.length - 1]);
      }
    } catch {
      toast.error('加载章节列表失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedChapter]);

  useEffect(() => { void loadChapters(); }, [loadChapters]);

  const handleReview = async () => {
    if (!selectedChapter) {
      toast.warning('请先选择要审稿的章节');
      return;
    }
    if (countChineseWords(selectedChapter.content) < 100) {
      toast.error('章节正文至少需100个中文字符');
      return;
    }
    setReviewing(true);
    setReview(null);
    try {
      const result = await multiPlatformReview({
        content: selectedChapter.content,
        title: selectedChapter.title,
        chapterNo: selectedChapter.chapterNo,
      });
      setReview(result);
      toast.success('四平台审稿完成');
    } catch (e) {
      toast.error('审稿失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-xl text-stone-800">
            <BookOpen className="h-5 w-5 text-brand-500" /> 多平台审稿
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            从番茄小说、起点中文网、知乎、冷读复核四个视角审读章节，找到「不同平台读者为什么弃书」的根因
          </p>
        </div>
      </div>

      {/* 章节选择 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setChapterDropdownOpen(!chapterDropdownOpen)}
                className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                {selectedChapter ? `第 ${selectedChapter.chapterNo} 章 · ${selectedChapter.title || '未命名'}` : '选择章节'}
                <ChevronDown className="h-4 w-4 text-stone-400" />
              </button>
              {chapterDropdownOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-60 w-72 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg">
                  {chapters.length === 0 ? (
                    <p className="p-3 text-sm text-stone-400">暂无章节</p>
                  ) : (
                    chapters.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setSelectedChapter(ch);
                          setChapterDropdownOpen(false);
                          setReview(null);
                        }}
                        className={cn(
                          'block w-full px-3 py-2 text-left text-sm hover:bg-stone-50',
                          selectedChapter?.id === ch.id ? 'bg-brand-50 text-brand-700' : 'text-stone-700'
                        )}
                      >
                        <span className="font-medium">第 {ch.chapterNo} 章</span>
                        <span className="ml-2 text-stone-400">{ch.title || '未命名'}</span>
                        <span className="ml-2 text-[10px] text-stone-400">
                          {ch.status === 'completed' ? '已完成' : ch.status}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedChapter && (
              <span className="text-xs text-stone-400">
                {countChineseWords(selectedChapter.content)} 字
              </span>
            )}
            <Button
              size="sm"
              onClick={handleReview}
              disabled={reviewing || !selectedChapter}
            >
              {reviewing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {reviewing ? '审稿中…' : '开始审稿'}
            </Button>
            {chapters.length === 0 && (
              <p className="text-xs text-stone-400">请先在创作工作台创建章节</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 审稿结果 */}
      {review && (
        <>
          {/* 综合概览 */}
          <Card className="border-brand-200 bg-gradient-to-br from-brand-50/30 to-white">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-500">综合评分</span>
                  <span className={cn(
                    'text-2xl font-bold',
                    review.overallScore >= 75 ? 'text-green-600' : review.overallScore >= 55 ? 'text-amber-600' : 'text-red-500'
                  )}>
                    {review.overallScore}
                  </span>
                  <span className="text-sm text-stone-400">/100</span>
                </div>
                <div className="flex gap-3">
                  {(Object.entries(review.platforms) as [PlatformId, PlatformScore][]).map(([id, ps]) => (
                    <div key={id} className="flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5">
                      <span>{PLATFORM_ICONS[id]}</span>
                      <span className="text-xs text-stone-500">{PLATFORMS.find(p => p.id === id)?.shortLabel}</span>
                      <span className={cn(
                        'text-sm font-semibold',
                        ps.score >= 75 ? 'text-green-600' : ps.score >= 55 ? 'text-amber-600' : 'text-red-500'
                      )}>
                        {ps.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {review.commonIssues.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                  <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    跨平台共性问题（出现在多个平台）
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-amber-600">
                    {review.commonIssues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 平台标签 */}
          <div className="flex gap-2 overflow-x-auto">
            {(Object.entries(review.platforms) as [PlatformId, PlatformScore][]).map(([id, ps]) => {
              const meta = PLATFORMS.find(p => p.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    activeTab === id
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  )}
                >
                  <span>{PLATFORM_ICONS[id]}</span>
                  <span className="font-medium">{meta.shortLabel}</span>
                  <span className={cn(
                    'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    VERDICT_COLORS[ps.verdict]
                  )}>
                    {platformVerdictLabel[ps.verdict]}
                  </span>
                  <span className="text-xs">{ps.score}</span>
                </button>
              );
            })}
          </div>

          {/* 当前平台详细 */}
          {(() => {
            const ps = review.platforms[activeTab];
            const meta = PLATFORMS.find(p => p.id === activeTab)!;
            return (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{PLATFORM_ICONS[activeTab]}</span>
                      <CardTitle className="text-base">{meta.label} 视角</CardTitle>
                      {ps.fromLLM && (
                        <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">
                          LLM 定性
                        </span>
                      )}
                    </div>
                    <CardDescription>{meta.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 读者画像 */}
                    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                      <p className="text-xs font-medium text-stone-600">读者画像</p>
                      <p className="mt-1 text-xs text-stone-500">{meta.readerProfile}</p>
                    </div>

                    {/* 评分 */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-16 w-16 items-center justify-center rounded-full border-2 text-xl font-bold',
                        ps.score >= 75 ? 'border-green-300 text-green-600' : ps.score >= 55 ? 'border-amber-300 text-amber-600' : 'border-red-300 text-red-500'
                      )}>
                        {ps.score}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {meta.focusAreas.map((area) => (
                          <span key={area} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 优势 */}
                    {ps.strengths.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          优势
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-xs text-stone-600">
                          {ps.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* 劣势 */}
                    {ps.weaknesses.length > 0 && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-red-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          该平台读者可能弃书的点
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-xs text-stone-600">
                          {ps.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* 改进建议 */}
                    {ps.suggestions.length > 0 && (
                      <div className="rounded-md border border-brand-200 bg-brand-50/50 p-3">
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-brand-700">
                          <Lightbulb className="h-3.5 w-3.5" />
                          针对该平台的改进建议
                        </p>
                        <ul className="list-disc space-y-1 pl-4 text-xs text-stone-600">
                          {ps.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </>
      )}

      {/* 未审稿状态 */}
      {!review && !reviewing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="mb-3 h-12 w-12 text-stone-300" />
            <p className="text-sm text-stone-500">选择章节并点击「开始审稿」</p>
            <p className="mt-1 text-xs text-stone-400">
              系统将从番茄小说、起点中文网、知乎、冷读复核四个视角评估章节质量
            </p>
          </CardContent>
        </Card>
      )}

      {/* 审稿中 */}
      {reviewing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm text-stone-500">正在从四个平台视角审读章节…</p>
            <p className="mt-1 text-xs text-stone-400">番茄小说 / 起点中文网 / 知乎 / 冷读复核</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}