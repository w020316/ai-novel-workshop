'use client';

import { useState } from 'react';
import { listChapters, getProjectStylePreset } from '@/lib/db/queries';
import { detectStyleDrift, RECENT_CHAPTER_WINDOW, type StyleDriftReport } from '@/lib/style/drift';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, Loader2, AlertTriangle } from 'lucide-react';

const LEVEL_META: Record<
  StyleDriftReport['level'],
  { label: string; cls: string }
> = {
  alert: { label: '明显漂移', cls: 'bg-red-100 text-red-700 border-red-200' },
  watch: { label: '留意', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  normal: { label: '文风一致', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  insufficient: { label: '章节不足', cls: 'bg-stone-100 text-stone-500 border-stone-200' },
};

/** 文风漂移监测卡片：最近章节 vs 文风指纹基线（句长节奏/对话占比/高频用词），确定性零 LLM */
export function StyleDriftCard({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<StyleDriftReport | null>(null);

  const handleScan = async () => {
    setLoading(true);
    try {
      const [chapters, preset] = await Promise.all([
        listChapters(projectId),
        getProjectStylePreset(projectId),
      ]);
      setReport(
        detectStyleDrift(
          chapters.map((c) => ({ chapterNo: c.chapterNo, content: c.content })),
          preset?.vocabularyProfile
            ? {
                preset: {
                  avgSentenceLength: preset.vocabularyProfile.avgSentenceLength,
                  dialogueRatio: preset.dialogueRatio,
                  commonPhrases: preset.vocabularyProfile.commonPhrases,
                },
              }
            : undefined
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const meta = report ? LEVEL_META[report.level] : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-brand-500" />
          文风漂移监测
        </CardTitle>
        <CardDescription className="text-xs">
          对比最近 {RECENT_CHAPTER_WINDOW} 章与基线（文风预设或此前章节）的句长节奏、对话占比、高频用词指纹，及时发现「文风跑了」；纯本地统计，不消耗 AI 额度
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report && meta && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span className={`rounded border px-1.5 py-0.5 font-medium ${meta.cls}`}>{meta.label}</span>
              <span className="rounded bg-stone-100 px-1.5 py-0.5">
                基线：{report.baseline?.label ?? '—'}
              </span>
              {report.recent.chapterRange && (
                <span className="rounded bg-stone-100 px-1.5 py-0.5">
                  近期：第 {report.recent.chapterRange[0]}-{report.recent.chapterRange[1]} 章
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">平均句长</p>
                <p className="font-medium text-stone-700">
                  {report.baseline?.avgSentenceLength ?? '—'} → {report.recent.avgSentenceLength} 字/句
                </p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">对话占比</p>
                <p className="font-medium text-stone-700">
                  {report.baseline ? `${Math.round(report.baseline.dialogueRatio * 100)}%` : '—'} →{' '}
                  {Math.round(report.recent.dialogueRatio * 100)}%
                </p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">基线高频词组</p>
                <p className="font-medium text-stone-700">{report.baseline?.commonPhrases.length ?? 0} 组</p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                <p className="text-stone-400">近期高频词组</p>
                <p className="font-medium text-stone-700">{report.recent.topPhrases.length} 组</p>
              </div>
            </div>

            {report.signals.length > 0 && (
              <ul className="space-y-1.5">
                {report.signals.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-stone-700">
                    <AlertTriangle
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${s.level === 'alert' ? 'text-red-500' : 'text-amber-500'}`}
                    />
                    <span>{s.description}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-md border border-brand-200 bg-brand-50/50 p-3 text-xs leading-relaxed text-stone-600">
              {report.suggestions.map((s, i) => (
                <p key={i} className={i > 0 ? 'mt-1' : ''}>
                  · {s}
                </p>
              ))}
            </div>
          </>
        )}

        <Button size="sm" variant="outline" onClick={handleScan} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Activity className="mr-1.5 h-3.5 w-3.5" />
          )}
          {report ? '重新扫描' : '开始扫描'}
        </Button>
      </CardContent>
    </Card>
  );
}
