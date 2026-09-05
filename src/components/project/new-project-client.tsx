'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Wand2, RefreshCw, ArrowDown, ShieldCheck, ShieldAlert } from 'lucide-react';
import {
  generateBookPackage,
  bookPackageToSummary,
  checkBookPackageOriginality,
  type BookPackage,
} from '@/lib/llm/generators/book-package';
import type { OriginalityReport } from '@/lib/originality/check';
import { buildAvoidance } from '@/lib/originality/check';
import { loadLiveRankedTitles } from '@/lib/rank/store';
import { ProjectForm, type ProjectFormPrefill } from '@/components/project/project-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';

/** 新建项目页客户端组装：一句话灵感 → 自动开书 → 查重预检 → 预填三步向导 */
export function NewProjectClient() {
  const [idea, setIdea] = useState('');
  const [generating, setGenerating] = useState(false);
  const [bookPackage, setBookPackage] = useState<BookPackage | null>(null);
  const [report, setReport] = useState<OriginalityReport | null>(null);
  const [prefill, setPrefill] = useState<ProjectFormPrefill | undefined>(undefined);
  const autoRan = useRef(false);

  /** 生成开书包：注入规避块（题材方向 + 实时榜单热书黑名单），生成后查重预检 */
  const runGenerate = async (ideaText: string, genreHint?: string) => {
    if (ideaText.trim().length < 4) {
      toast.warning('再多写几个字，灵感越具体开书包越准（至少 4 字）');
      return;
    }
    setGenerating(true);
    try {
      // 实时榜单黑名单（7 天保活，未抓取过则为空，仅用内置代表作负例）
      const liveTitles = await loadLiveRankedTitles().catch(() => [] as string[]);
      const avoidance = buildAvoidance({ genre: genreHint, liveTitles });
      const bp = await generateBookPackage(ideaText, { avoidancePrompt: avoidance.prompt });
      const check = checkBookPackageOriginality(bp, { liveTitles });
      setBookPackage(bp);
      setReport(check);
      // 一键备好：直接预填向导，用户只需轻微干预（微调字数/章节数后创建）
      setPrefill({
        title: bp.title,
        genre: bp.genre,
        summary: bookPackageToSummary(bp),
        version: Date.now(),
      });
      if (check.passed) {
        toast.success('开书包已备好并填入向导，可微调字数/章节数后创建');
      } else {
        toast.warning('开书包已填入，但查重发现与热门作品撞梗，建议「换一版」或手动修改', {
          description: check.hints[0],
        });
      }
      document.getElementById('project-form-anchor')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = () => void runGenerate(idea);

  // 灵感页「以此新建小说」跳入：?auto=1&idea=…&genre=… → 挂载后自动一键开书（仅跑一次）
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const q = new URLSearchParams(window.location.search);
    const autoIdea = (q.get('idea') ?? '').trim();
    if (!autoIdea) return;
    setIdea(autoIdea);
    if (q.get('auto') === '1') void runGenerate(autoIdea, q.get('genre') ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* 一句话灵感 → 自动开书 */}
      <Card className="border-brand-200 bg-gradient-to-br from-brand-50/30 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-brand-600" />
            一句话灵感 · 自动开书
          </CardTitle>
          <CardDescription className="text-xs">
            一句灵感即可：AI 备齐「书名·题材·简介·金手指·主线冲突·长线钩子·世界观种子」，自动查重避撞并填入下方向导
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="idea-input">你的灵感</Label>
            <Textarea
              id="idea-input"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="例：被岳家羞辱的赘婿其实是隐藏大佬，或：末世来临前我提前囤货……"
              rows={2}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {bookPackage ? '重新生成开书包' : 'AI 生成开书包'}
            </Button>
            {bookPackage && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                换一版
              </Button>
            )}
          </div>

          {bookPackage && (
            <div className="space-y-1 rounded-md border border-brand-200 bg-brand-50/40 p-3 text-xs">
              <p className="text-sm font-medium text-stone-800">
                {bookPackage.title}
                <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-700">
                  {bookPackage.genre}
                </span>
                {!bookPackage.fromLLM && (
                  <span className="ml-1 rounded bg-stone-200 px-1 py-0.5 text-[10px] text-stone-600">模板兜底</span>
                )}
              </p>
              {bookPackage.titleAlternatives.length > 0 && (
                <p className="text-stone-500">备选书名：{bookPackage.titleAlternatives.join(' / ')}</p>
              )}
              <p className="text-stone-700">简介：{bookPackage.summary}</p>
              <p className="text-stone-600">金手指：{bookPackage.goldenFinger}</p>
              <p className="text-stone-600">主线冲突：{bookPackage.mainConflict}</p>
              <p className="text-stone-600">长线钩子：{bookPackage.longHook}</p>
              <p className="text-stone-500">世界观种子：{bookPackage.worldviewSeed}</p>

              {/* 查重预检结果：撞热门作品即提示，建议换一版（人工保留最终判断） */}
              {report && (
                <p
                  className={
                    report.passed
                      ? 'flex items-start gap-1 text-green-700'
                      : 'flex items-start gap-1 text-amber-700'
                  }
                >
                  {report.passed ? (
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    原创度 {report.score} ·{' '}
                    {report.passed
                      ? '未撞内置代表作与实时榜单热书，可放心开书。'
                      : report.hits.map((h) => `与《${h.workTitle}》撞「${h.matched}」`).join('；') +
                        '，建议「换一版」或修改设定。'}
                  </span>
                </p>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  document.getElementById('project-form-anchor')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="mt-1"
              >
                <ArrowDown className="mr-1.5 h-3.5 w-3.5" />
                到下方向导微调后创建
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 三步向导 */}
      <div id="project-form-anchor">
        <ProjectForm prefill={prefill} />
      </div>
    </>
  );
}
