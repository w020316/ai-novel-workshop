'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Wand2, RefreshCw, ArrowDown } from 'lucide-react';
import { generateBookPackage, bookPackageToSummary } from '@/lib/llm/generators/book-package';
import type { BookPackage } from '@/lib/llm/generators/book-package';
import { ProjectForm, type ProjectFormPrefill } from '@/components/project/project-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';

/** 新建项目页客户端组装：一句话灵感 → 自动开书 → 预填三步向导 */
export function NewProjectClient() {
  const [idea, setIdea] = useState('');
  const [generating, setGenerating] = useState(false);
  const [bookPackage, setBookPackage] = useState<BookPackage | null>(null);
  const [prefill, setPrefill] = useState<ProjectFormPrefill | undefined>(undefined);

  const handleGenerate = async () => {
    if (idea.trim().length < 4) {
      toast.warning('再多写几个字，灵感越具体开书包越准（至少 4 字）');
      return;
    }
    setGenerating(true);
    try {
      const bp = await generateBookPackage(idea);
      setBookPackage(bp);
      toast.success(bp.fromLLM ? '开书包已生成' : '已按灵感生成开书包（AI 暂不可用，模板兜底）');
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (!bookPackage) return;
    setPrefill({
      title: bookPackage.title,
      genre: bookPackage.genre,
      summary: bookPackageToSummary(bookPackage),
      version: Date.now(),
    });
    document.getElementById('project-form-anchor')?.scrollIntoView({ behavior: 'smooth' });
  };

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
            只有一句模糊灵感也能开书：AI 扩写成「书名·题材·简介·金手指·主线冲突·长线钩子·世界观种子」开书包，一键填入下方向导
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
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
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
              <Button size="sm" onClick={handleApply} className="mt-1">
                <ArrowDown className="mr-1.5 h-3.5 w-3.5" />
                用此设定填入向导
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
