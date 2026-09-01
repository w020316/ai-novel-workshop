'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getChapter, saveChapter, getProject } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerationProgress } from '@/components/workbench/GenerationProgress';
import { ConsistencyReportView } from '@/components/workbench/ConsistencyReportView';
import { generateChapter } from '@/lib/agents/orchestrator';
import { detectAITraces, humanizeChapter } from '@/lib/humanize';
import type { AiTraceReport } from '@/lib/humanize';
import { Loader2, Play, FileText, AlertCircle, RefreshCw, Wand2, ScanSearch } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter, GenerationStage, ConsistencyReport, SceneDesign, GenerationContext } from '@/types';

export default function ChapterPage() {
  const params = useParams<{ id: string; n: string }>();
  const router = useRouter();
  const projectId = params.id;
  const chapterNo = parseInt(params.n, 10);

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [stage, setStage] = useState<GenerationStage | null>(null);
  const [consistencyReport, setConsistencyReport] = useState<ConsistencyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plotPoints, setPlotPoints] = useState<string[]>(['']);
  const [title, setTitle] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [aiReport, setAiReport] = useState<AiTraceReport | null>(null);
  const [humanizing, setHumanizing] = useState(false);

  useEffect(() => {
    setLoading(true);
    getChapter(projectId, chapterNo)
      .then((ch) => {
        if (ch) {
          setChapter(ch);
          setStreamingContent(ch.content);
          setPlotPoints(ch.plotPoints.length > 0 ? ch.plotPoints : ['']);
          setTitle(ch.title);
        } else {
          setTitle(`第${chapterNo}章`);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, chapterNo]);

  const handleStream = useCallback((token: string) => {
    setStreamingContent((prev) => prev + token);
  }, []);

  const handleProgress = useCallback((s: GenerationStage) => {
    setStage(s);
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setStreamingContent('');
    setConsistencyReport(null);
    setStage('memory_assembling');

    const validPlotPoints = plotPoints.filter((p) => p.trim().length > 0);

    const context: GenerationContext = {
      projectId,
      chapterNo,
      plotPoints: validPlotPoints,
      onStream: handleStream,
      onProgress: handleProgress,
    };

    try {
      const result = await generateChapter(context);
      setConsistencyReport(result.consistencyReport);
      setStage('completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      setError(msg);
      setStage('failed');
    } finally {
      setGenerating(false);
    }
  }, [projectId, chapterNo, plotPoints, handleStream, handleProgress]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    setGenerating(false);
    setStage(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!chapter) {
      const newChapter: Chapter = {
        id: `ch_${Date.now()}`,
        projectId,
        volumeNo: 1,
        chapterNo,
        title,
        plotPoints: plotPoints.filter((p) => p.trim()),
        content: streamingContent,
        wordCount: (streamingContent.match(/[\u4e00-\u9fff]/g) ?? []).length,
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveChapter(newChapter);
      setChapter(newChapter);
    } else {
      await saveChapter({
        ...chapter,
        title,
        plotPoints: plotPoints.filter((p) => p.trim()),
        content: streamingContent,
        wordCount: (streamingContent.match(/[\u4e00-\u9fff]/g) ?? []).length,
        updatedAt: Date.now(),
      });
    }
    router.push(`/project/${projectId}/workbench`);
  }, [chapter, projectId, chapterNo, title, plotPoints, streamingContent, router]);

  // 先本地扫描 AI 痕迹，若命中再由 LLM 做点对点去AI味改写
  const handleScan = useCallback(() => {
    const report = detectAITraces(streamingContent);
    setAiReport(report);
    toast.info(
      report.totalCount === 0
        ? '未发现明显的 AI 痕迹'
        : `检测到 ${report.totalCount} 处 AI 痕迹，可点击「一键去AI味」改写`
    );
  }, [streamingContent]);

  const handleHumanize = useCallback(async () => {
    if (humanizing || !streamingContent.trim()) return;
    setHumanizing(true);
    try {
      const report = detectAITraces(streamingContent);
      setAiReport(report);
      if (report.totalCount === 0) {
        toast.info('该章未发现明显的 AI 痕迹，无需改写');
        return;
      }
      const result = await humanizeChapter({
        content: streamingContent,
        title,
        chapterNo,
      });
      setStreamingContent(result.content);
      toast.success(
        result.changed
          ? `已完成去AI味改写（原识别 ${report.totalCount} 处痕迹）`
          : '改写结果未产生变化，已保留原文'
      );
    } catch (err) {
      console.error(err);
      toast.error('去AI味处理失败');
    } finally {
      setHumanizing(false);
    }
  }, [humanizing, streamingContent, title, chapterNo]);

  const addPlotPoint = () => setPlotPoints((prev) => [...prev, '']);
  const updatePlotPoint = (index: number, value: string) => {
    setPlotPoints((prev) => prev.map((p, i) => (i === index ? value : p)));
  };
  const removePlotPoint = (index: number) => {
    setPlotPoints((prev) => prev.filter((_, i) => i !== index));
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
      {/* 标题和设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-brand-500" />
            章节设置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">章节标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              placeholder="输入章节标题"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600">剧情要点</label>
            <p className="mb-2 text-xs text-stone-400">输入本章的关键剧情，每行一个要点</p>
            {plotPoints.map((point, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={point}
                  onChange={(e) => updatePlotPoint(i, e.target.value)}
                  className="flex-1 rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  placeholder={`剧情要点 ${i + 1}`}
                />
                {plotPoints.length > 1 && (
                  <button
                    onClick={() => removePlotPoint(i)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    删除
                  </button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addPlotPoint}>
              + 添加要点
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={generating} size="lg">
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              {chapter ? '重新生成' : '开始生成'}
            </>
          )}
        </Button>
        {generating && (
          <Button variant="outline" onClick={handleAbort}>
            停止生成
          </Button>
        )}
        {streamingContent && !generating && (
          <Button variant="outline" onClick={handleSave}>
            保存章节
          </Button>
        )}
      </div>

      {/* 生成进度 */}
      {stage && (stage !== 'completed' && stage !== 'failed') && (
        <GenerationProgress stage={stage} />
      )}

      {/* 错误信息 */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* 正文编辑区 */}
      {streamingContent && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-brand-500" />
                章节正文
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScan}
                  disabled={humanizing}
                  title="扫描正文中的 AI 痕迹"
                >
                  <ScanSearch className="mr-1 h-4 w-4" />
                  扫描AI痕迹
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleHumanize}
                  disabled={humanizing || !streamingContent.trim()}
                  title="按检测结果点对点改写，去机器味、提过审概率"
                >
                  {humanizing ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-1 h-4 w-4" />
                  )}
                  一键去AI味
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <textarea
              value={streamingContent}
              onChange={(e) => setStreamingContent(e.target.value)}
              className="min-h-[400px] w-full rounded-md border border-stone-200 p-4 font-serif text-sm leading-relaxed text-stone-800 focus:border-brand-500 focus:outline-none"
              placeholder="生成的章节内容将显示在这里..."
            />
            <p className="mt-2 text-xs text-stone-400">
              字数：{(streamingContent.match(/[\u4e00-\u9fff]/g) ?? []).length}
            </p>

            {/* AI 痕迹检测结果 */}
            {aiReport && (
              <div className="mt-4 space-y-2 rounded-md border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs font-medium text-stone-600">
                  AI 痕迹检测：
                  {aiReport.totalCount === 0
                    ? '未发现明显痕迹'
                    : `共 ${aiReport.totalCount} 处，覆盖 ${aiReport.categoryCount} 类`}
                </p>
                {aiReport.categories.map((c) => (
                  <div key={c.id} className="text-xs text-stone-500">
                    <span className="font-medium text-stone-700">
                      {c.label} ×{c.count}
                    </span>
                    <span className="ml-1">：{c.examples.join('、')}</span>
                    <p className="mt-0.5 text-stone-400">建议：{c.hint}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 一致性报告 */}
      {consistencyReport && (
        <ConsistencyReportView report={consistencyReport} />
      )}
    </div>
  );
}