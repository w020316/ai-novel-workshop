'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConsistencyReportView } from '@/components/workbench/ConsistencyReportView';
import { listChapters, getConsistencyReport, markChapterNeedsRecheck } from '@/lib/db/queries';
import {
  aggregateConsistencyIssues,
  buildCharacterFixProposal,
  type ConsistencyHealResult,
} from '@/lib/agents/consistency-heal';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Wand2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Chapter, ConsistencyReport } from '@/types';

/** 已处理问题指纹的本地记录 key（不侵入数据库 schema） */
const HEAL_DONE_KEY = 'ai-novel-consistency-heal-done';

function loadDoneKeys(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HEAL_DONE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export default function ConsistencyPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reports, setReports] = useState<Record<string, ConsistencyReport | null>>({});
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [heal, setHeal] = useState<ConsistencyHealResult | null>(null);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(() => loadDoneKeys());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const chs = await listChapters(projectId).catch(() => []);
    setChapters(chs);
    const r: Record<string, ConsistencyReport | null> = {};
    for (const ch of chs) {
      r[ch.id] = (await getConsistencyReport(ch.id).catch(() => undefined)) ?? null;
    }
    setReports(r);
    // 跨章聚合设定侧问题
    const all = Object.values(r).filter((x): x is ConsistencyReport => !!x);
    setHeal(aggregateConsistencyIssues(all));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleRecheckAll = async () => {
    setRechecking(true);
    const count = await markChapterNeedsRecheck(projectId);
    toast.success(`已标记 ${count} 章需重校验`);
    setRechecking(false);
  };

  const markDone = (key: string) => {
    const next = new Set(doneKeys);
    next.add(key);
    setDoneKeys(next);
    try {
      localStorage.setItem(HEAL_DONE_KEY, JSON.stringify([...next]));
    } catch { /* 存储不可用则仅内存态 */ }
    toast.success('已标记，建议已从引导列表收起');
  };

  const copyProposal = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      toast.error('复制失败，请手动选择文本');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const completedChapters = chapters.filter((c) => c.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">一致性校验报告</h1>
          <p className="text-sm text-stone-500">各章节的世界观、人设、剧情一致性检查</p>
        </div>
        <Button variant="outline" onClick={handleRecheckAll} disabled={rechecking}>
          <RefreshCw className={`mr-1 h-4 w-4 ${rechecking ? 'animate-spin' : ''}`} />
          批量重校验
        </Button>
      </div>

      {completedChapters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="mb-3 h-12 w-12 text-stone-300" />
            <p className="text-sm text-stone-500">暂无已完成章节</p>
            <p className="text-xs text-stone-400">完成章节生成后，一致性校验报告将在此显示</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* 设定自愈：跨章聚合设定侧问题，生成修订建议 */}
          {heal && heal.settingIssues.length > 0 && (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardContent className="space-y-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-brand-500" />
                    <h2 className="text-sm font-medium text-stone-800">设定自愈 · 跨章聚合</h2>
                    <span className="text-xs text-stone-400">
                      {heal.settingIssues.length} 种设定侧问题 · {heal.totalIssues} 条总问题（正文侧 {heal.contentSideCount} 条）
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-stone-500">
                    <input
                      type="checkbox"
                      checked={showCompleted}
                      onChange={(e) => setShowCompleted(e.target.checked)}
                      className="accent-brand-500"
                    />
                    显示已处理
                  </label>
                </div>
                <div className="space-y-2">
                  {heal.settingIssues
                    .filter((s) => showCompleted || !doneKeys.has(s.key))
                    .map((s) => {
                      const prop = buildCharacterFixProposal(s);
                      const done = doneKeys.has(s.key);
                      return (
                        <div key={s.key} className="rounded-md border border-stone-200 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
                                {s.type === 'character' ? '人物' : '世界观'}
                              </span>
                              {s.maxSeverity === 'error' && (
                                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">error</span>
                              )}
                              <span className="text-xs text-stone-400">{s.chapters.length} 章 · {s.count} 次</span>
                              {done && <span className="text-[10px] text-green-600">已处理</span>}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => copyProposal(s.key, prop)}>
                                {copiedKey === s.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copiedKey === s.key ? '已复制' : '复制建议'}
                              </Button>
                              {!done && (
                                <Button size="sm" onClick={() => markDone(s.key)}>标记已处理</Button>
                              )}
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-stone-700">{s.description}</p>
                          <p className="mt-1 text-xs text-stone-500">建议：{s.suggestion}</p>
                        </div>
                      );
                    })}
                  {heal.settingIssues.filter((s) => showCompleted || !doneKeys.has(s.key)).length === 0 && (
                    <p className="text-xs text-stone-400">全部设定侧问题已处理，可真没有待修订项了</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {completedChapters.map((ch) => {
            const report = reports[ch.id];
            const hasIssues = report && !report.passed;
            const needsRecheck = ch.needsRecheck;

            return (
              <Card
                key={ch.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${
                  needsRecheck ? 'border-yellow-300' : ''
                }`}
                onClick={() => setSelectedChapter(selectedChapter === ch.id ? null : ch.id)}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-600">
                        {ch.chapterNo}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-800">{ch.title}</p>
                        <p className="text-xs text-stone-400">
                          {report
                            ? hasIssues
                              ? `${report.issues.length} 个问题`
                              : '校验通过'
                            : '暂无报告'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {needsRecheck && (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-600">
                          待重校验
                        </span>
                      )}
                      {report ? (
                        report.passed ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-stone-300" />
                      )}
                    </div>
                  </div>
                </CardContent>
                {selectedChapter === ch.id && report && (
                  <CardContent className="border-t border-stone-100 pt-3">
                    <ConsistencyReportView report={report} />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}