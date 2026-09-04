'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Edit3 } from 'lucide-react';
import { listChapterSummaries, saveChapterSummary, listForeshadowings, saveForeshadowing } from '@/lib/db/queries';
import { toast } from 'sonner';
import type { ChapterSummary, Foreshadowing } from '@/types';

interface MemoryEditorProps {
  projectId: string;
}

type EditTab = 'summary' | 'foreshadowing';

export function MemoryEditor({ projectId }: MemoryEditorProps) {
  const [tab, setTab] = useState<EditTab>('summary');
  const [summaries, setSummaries] = useState<ChapterSummary[]>([]);
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [editingForeshadowId, setEditingForeshadowId] = useState<string | null>(null);
  const [editForeshadow, setEditForeshadow] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listChapterSummaries(projectId),
      listForeshadowings(projectId),
    ])
      .then(([sums, fs]) => { setSummaries(sums); setForeshadowings(fs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const saveSummary = async (s: ChapterSummary) => {
    await saveChapterSummary({ ...s, summary: editSummary });
    toast.success('章节摘要已更新');
    setEditingSummaryId(null);
    load();
  };

  const saveForeshadow = async (f: Foreshadowing) => {
    await saveForeshadowing({ ...f, description: editForeshadow });
    toast.success('伏笔已更新');
    setEditingForeshadowId(null);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const tabs = [
    { key: 'summary' as const, label: '章节摘要' },
    { key: 'foreshadowing' as const, label: '伏笔编辑' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-stone-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="space-y-3">
          {summaries.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">暂无章节摘要</p>
          ) : (
            summaries.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs text-stone-400">第 {s.chapterNo} 章</p>
                      {editingSummaryId === s.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editSummary}
                            onChange={(e) => setEditSummary(e.target.value)}
                            className="min-h-[60px] w-full rounded-md border border-stone-200 p-2 text-sm focus:border-brand-500 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveSummary(s)}>
                              <Save className="mr-1 h-3 w-3" />
                              保存
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEditingSummaryId(null)}>
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-stone-700">{s.summary}</p>
                          <button
                            onClick={() => { setEditingSummaryId(s.id); setEditSummary(s.summary); }}
                            className="ml-2 shrink-0 text-stone-400 hover:text-brand-500"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'foreshadowing' && (
        <div className="space-y-3">
          {foreshadowings.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-400">暂无伏笔</p>
          ) : (
            foreshadowings.map((f) => (
              <Card key={f.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-xs text-stone-400">
                        <span>第{f.setupChapter}章铺设</span>
                        <span>· {f.status === 'planted' ? '已铺设' : f.status === 'pending' ? '待回收' : f.status === 'recovered' ? '已回收' : '已废弃'}</span>
                      </div>
                      {editingForeshadowId === f.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editForeshadow}
                            onChange={(e) => setEditForeshadow(e.target.value)}
                            className="min-h-[60px] w-full rounded-md border border-stone-200 p-2 text-sm focus:border-brand-500 focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveForeshadow(f)}>
                              <Save className="mr-1 h-3 w-3" />
                              保存
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setEditingForeshadowId(null)}>
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-stone-700">{f.description}</p>
                          <button
                            onClick={() => { setEditingForeshadowId(f.id); setEditForeshadow(f.description); }}
                            className="ml-2 shrink-0 text-stone-400 hover:text-brand-500"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}