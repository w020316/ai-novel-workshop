'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getChapter, saveChapter, saveChapterVersion, listChapterVersions } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerationProgress } from '@/components/workbench/GenerationProgress';
import { ConsistencyReportView } from '@/components/workbench/ConsistencyReportView';
import { generateChapter } from '@/lib/agents/orchestrator';
import { detectAITraces, humanizeChapter } from '@/lib/humanize';
import type { AiTraceReport, HumanizeSpotFix } from '@/lib/humanize';
import { reviewChapter, readerReviewVerdictLabel } from '@/lib/review/reader-review';
import type { ReaderReview } from '@/lib/review/reader-review';
import { checkContentCompliance } from '@/lib/compliance/check';
import type { ComplianceReport } from '@/lib/compliance/check';
import {
  Loader2,
  Play,
  FileText,
  AlertCircle,
  Wand2,
  ScanSearch,
  Eye,
  ShieldCheck,
  History,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter, ChapterVersion, GenerationStage, ConsistencyReport, GenerationContext } from '@/types';

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
  const [spotFixes, setSpotFixes] = useState<HumanizeSpotFix[]>([]);
  const [humanizing, setHumanizing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [readerReview, setReaderReview] = useState<ReaderReview | null>(null);
  const [candidateCount, setCandidateCount] = useState(1);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<ChapterVersion | null>(null);

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
      candidateCount,
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
  }, [projectId, chapterNo, plotPoints, candidateCount, handleStream, handleProgress]);

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
      // 保存前先把旧版内容快照为历史版本（仅当正文/标题/要点有变化时）
      if (chapter.content !== streamingContent) {
        await saveChapterVersion({
          id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chapterId: chapter.id,
          projectId,
          chapterNo,
          title: chapter.title,
          plotPoints: chapter.plotPoints,
          content: chapter.content,
          wordCount: chapter.wordCount,
          createdAt: Date.now(),
        });
      }
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

  // 打开历史版本面板，加载该章节的历史快照
  const handleOpenVersions = useCallback(async () => {
    setShowVersions(true);
    setPreviewVersion(null);
    try {
      const vs = await listChapterVersions(projectId, chapterNo);
      setVersions(vs);
      if (vs.length === 0) {
        toast.info('暂无历史版本（保存内容变化时会自动留档）');
      }
    } catch {
      setVersions([]);
      toast.error('加载历史版本失败');
    }
  }, [projectId, chapterNo]);

  // 回滚到指定历史版本：恢复其正文/标题/要点（旧快照暂不删除，保留多级回退）
  const handleRollback = useCallback((v: ChapterVersion) => {
    if (!chapter) return;
    setStreamingContent(v.content);
    setTitle(v.title);
    setPlotPoints(v.plotPoints.length > 0 ? v.plotPoints : ['']);
    setPreviewVersion(null);
    setShowVersions(false);
    toast.success(
      `已从 ${new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })} 的版本恢复，记得点击「保存章节」落盘`
    );
  }, [chapter]);

  // 先本地扫描 AI 痕迹，若命中再由 LLM 做定点去AI味修复
  const handleScan = useCallback(() => {
    const report = detectAITraces(streamingContent);
    setAiReport(report);
    setSpotFixes([]);
    toast.info(
      report.totalCount === 0
        ? '未发现明显的 AI 痕迹'
        : `检测到 ${report.totalCount} 处 AI 痕迹，可点击「一键去AI味」定点修复`
    );
  }, [streamingContent]);

  const handleHumanize = useCallback(async () => {
    if (humanizing || !streamingContent.trim()) return;
    setHumanizing(true);
    try {
      const report = detectAITraces(streamingContent);
      setAiReport(report);
      setSpotFixes([]);
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
      setSpotFixes(result.spots);
      toast.success(
        result.changed
          ? result.mode === 'spot'
            ? `定点修复 ${result.spots.length} 处命中句（共识别 ${report.totalCount} 处痕迹），其余正文保持原样`
            : `已完成去AI味改写（原识别 ${report.totalCount} 处痕迹）`
          : '改写结果未产生变化，已保留原文'
      );
    } catch (err) {
      console.error(err);
      toast.error('去AI味处理失败');
    } finally {
      setHumanizing(false);
    }
  }, [humanizing, streamingContent, title, chapterNo]);

  // 读者视角「冷读复核」：切到读者视角评估本章是否抓人
  const handleReview = useCallback(async () => {
    if (reviewing || !streamingContent.trim()) return;
    setReviewing(true);
    try {
      // reviewChapter 内部已对 LLM 失败/非法结果做本地降级，通常不会抛出
      const review = await reviewChapter({ content: streamingContent, title, chapterNo });
      setReaderReview(review);
      toast.info(
        review.fromLLM
          ? `读者冷读评分 ${review.score} 分（${readerReviewVerdictLabel[review.verdict]}）`
          : `本地启发式评分 ${review.score} 分（LLM 不可用，仅按字数/节奏评估）`
      );
    } catch (err) {
      console.error(err);
      toast.error('冷读复核失败');
    } finally {
      setReviewing(false);
    }
  }, [reviewing, streamingContent, title, chapterNo]);

  // 投稿合规体检：投递前一次性自查违规/敏感/广告/格式残留/AI痕迹/章节尺度
  const handleCompliance = useCallback(() => {
    const report = checkContentCompliance(streamingContent);
    setCompliance(report);
    toast.info(
      report.passed
        ? `合规体检 ${report.score}/100，建议可提交自检`
        : `合规体检 ${report.score}/100，存在 ${
            report.priorities.filter((p) => p.startsWith('必改')).length
          } 项必改、${
            report.priorities.filter((p) => p.startsWith('需处理')).length
          } 项需处理`
    );
  }, [streamingContent]);

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
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <label htmlFor="candidate-count" className="flex items-center gap-1.5">
            生成模式
            <select
              id="candidate-count"
              value={candidateCount}
              onChange={(e) => setCandidateCount(Number(e.target.value))}
              disabled={generating}
              className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm disabled:opacity-50"
            >
              <option value={1}>单稿</option>
              <option value={3}>抽卡3版（择优）</option>
            </select>
          </label>
        </div>
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-brand-500" />
                章节正文
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReview}
                  disabled={reviewing || !streamingContent.trim()}
                  title="切到读者视角冷读复核本章：评分、优势、槽点与改法"
                >
                  {reviewing ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="mr-1 h-4 w-4" />
                  )}
                  读者冷读复核
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCompliance}
                  disabled={!streamingContent.trim()}
                  title="投递前一次性自查：违规/敏感、广告引流、格式残留、AI痕迹、章节尺度"
                >
                  <ShieldCheck className="mr-1 h-4 w-4" />
                  投稿合规体检
                </Button>
                {chapter && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleOpenVersions()}
                    title="查看并恢复本章的历史保存版本"
                  >
                    <History className="mr-1 h-4 w-4" />
                    历史版本
                  </Button>
                )}
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

            {/* 历史版本面板 */}
            {showVersions && (
              <div className="mt-4 rounded-md border border-brand-200 bg-brand-50/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1 text-sm font-medium text-stone-700">
                    <History className="h-4 w-4 text-brand-500" />
                    历史版本（{versions.length}）
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => { setShowVersions(false); setPreviewVersion(null); }}>
                    关闭
                  </Button>
                </div>
                <p className="mb-2 text-xs text-stone-400">
                  每次保存章节时若内容有变化会自动留档，可任选一个版本恢复。恢复后当前正文会被替换，请按「保存章节」落盘。
                </p>
                {versions.length === 0 ? (
                  <p className="text-xs text-stone-400">暂无历史版本。</p>
                ) : (
                  <div className="space-y-1.5">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-brand-100 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-medium text-stone-700">
                          {new Date(v.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                        <span className="text-stone-400">· {v.wordCount} 字</span>
                        <span className="text-stone-400 line-clamp-1 max-w-[40%] flex-1">
                          {v.content.slice(0, 40) || '（空稿）'}
                        </span>
                        <div className="ml-auto flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewVersion(previewVersion?.id === v.id ? null : v)}
                          >
                            {previewVersion?.id === v.id ? '收起' : '预览'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (window.confirm('确定恢复该版本？当前未保存的正文会被替换。')) {
                                handleRollback(v);
                              }
                            }}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            恢复此版
                          </Button>
                        </div>
                        {previewVersion?.id === v.id && (
                          <pre className="mt-2 max-h-40 w-full overflow-auto rounded border border-stone-200 bg-paper-50 p-2 whitespace-pre-wrap font-serif text-xs leading-relaxed text-stone-700">
                            {v.content}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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

                {/* 定点修复明细（spot-fix） */}
                {spotFixes.length > 0 && (
                  <div className="mt-2 border-t border-stone-200 pt-2">
                    <p className="text-xs font-medium text-emerald-700">
                      已定点修复 {spotFixes.length} 处命中句：
                    </p>
                    <ul className="mt-1 space-y-1">
                      {spotFixes.map((s, i) => (
                        <li key={i} className="text-xs text-stone-500">
                          <span className="text-stone-400 line-through">{s.original}</span>
                          <span className="mx-1">→</span>
                          <span className="text-emerald-700">{s.rewritten}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 读者冷读复核结果 */}
            {readerReview && (
              <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-stone-700">读者冷读复核</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        readerReview.verdict === 'gripping'
                          ? 'bg-emerald-100 text-emerald-700'
                          : readerReview.verdict === 'ok'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {readerReviewVerdictLabel[readerReview.verdict]}
                    </span>
                    <span className="text-2xl font-bold text-brand-600">
                      {readerReview.score}
                      <span className="text-xs font-normal text-stone-400"> 分</span>
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  {readerReview.fromLLM
                    ? '由 LLM 以读者视角定性评估'
                    : '本地启发式评估（LLM 暂不可用）：基于字数 / 对话占比 / 段位节奏 / 钩子 / 断章'}
                </p>

                <div className="mt-3 gap-3 md:grid md:grid-cols-2">
                  <div className="text-xs">
                    <p className="font-medium text-emerald-700">值得保留</p>
                    {readerReview.strengths.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-600">
                        {readerReview.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-stone-400">暂无</p>
                    )}
                  </div>
                  <div className="mt-2 text-xs md:mt-0">
                    <p className="font-medium text-red-700">槽点 / 风险</p>
                    {readerReview.weaknesses.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-600">
                        {readerReview.weaknesses.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-stone-400">暂无</p>
                    )}
                  </div>
                </div>

                {readerReview.suggestions.length > 0 && (
                  <div className="mt-3 border-t border-stone-200 pt-2 text-xs">
                    <p className="font-medium text-stone-700">改进建议</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-600">
                      {readerReview.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 投稿合规体检结果 */}
            {compliance && (
              <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-stone-700">投稿合规体检</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        compliance.passed
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {compliance.passed ? '建议可提交自检' : '建议处理后再投'}
                    </span>
                    <span className="text-2xl font-bold text-brand-600">
                      {compliance.score}
                      <span className="text-xs font-normal text-stone-400"> /100（过审友好度）</span>
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-stone-400">
                  确定性规则离线自检（不消耗模型额度）。体检仅作自查提示，并不承诺通过平台审核，投稿请以各家平台规则为准。
                </p>

                <div className="mt-3 space-y-2">
                  {compliance.categories.map((c) => (
                    <div key={c.id} className="text-xs text-stone-500">
                      <span
                        className={`font-medium ${
                          c.status === 'danger' ? 'text-red-700' : c.status === 'warn' ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {c.status === 'danger' ? '必改' : c.status === 'warn' ? '需处理' : '通过'}
                        ·{c.label}
                        {c.count > 0 ? ` ×${c.count}` : ''}
                      </span>
                      {c.examples.length > 0 && (
                        <span className="ml-1">：{c.examples.join('、')}</span>
                      )}
                      <p className="mt-0.5 text-stone-400">{c.hint}</p>
                    </div>
                  ))}
                </div>

                {compliance.priorities.length > 0 && (
                  <div className="mt-3 border-t border-stone-200 pt-2 text-xs">
                    <p className="font-medium text-stone-700">处理优先级</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-stone-600">
                      {compliance.priorities.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
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