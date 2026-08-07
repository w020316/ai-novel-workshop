'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, BookOpen, Users, ListTree, AlertTriangle } from 'lucide-react';
import { getWorldview, listCharacters, getOutline, listForeshadowings, listChapterSummaries } from '@/lib/db/queries';
import type { Worldview, Character, Outline, Foreshadowing, ChapterSummary } from '@/types';

interface MemoryBrowserProps {
  projectId: string;
}

type MemTab = 'long-term' | 'mid-term';

export function MemoryBrowser({ projectId }: MemoryBrowserProps) {
  const [tab, setTab] = useState<MemTab>('long-term');
  const [worldview, setWorldview] = useState<Worldview | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([]);
  const [summaries, setSummaries] = useState<ChapterSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getWorldview(projectId),
      listCharacters(projectId),
      getOutline(projectId),
      listForeshadowings(projectId),
      listChapterSummaries(projectId),
    ])
      .then(([wv, chars, ol, fs, sums]) => {
        setWorldview(wv ?? null);
        setCharacters(chars);
        setOutline(ol ?? null);
        setForeshadowings(fs);
        setSummaries(sums);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const tabs = [
    { key: 'long-term' as const, label: '长期记忆', icon: BookOpen },
    { key: 'mid-term' as const, label: '中期记忆', icon: ListTree },
  ];

  return (
    <div className="space-y-4">
      {/* Tab 切换 */}
      <div className="flex items-center gap-1 border-b border-stone-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
                tab === t.key
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'long-term' && (
        <div className="space-y-4">
          {/* 世界观 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-brand-500" />
                世界观
              </CardTitle>
            </CardHeader>
            <CardContent>
              {worldview ? (
                <div className="space-y-2 text-sm">
                  <p><span className="text-stone-500">世界架构：</span>{worldview.worldStructure || '未设置'}</p>
                  <p><span className="text-stone-500">力量体系：</span>{worldview.powerSystem || '未设置'}</p>
                  <p><span className="text-stone-500">时代背景：</span>{worldview.era || '未设置'}</p>
                  <p><span className="text-stone-500">势力划分：</span>{worldview.factions || '未设置'}</p>
                  <p><span className="text-stone-500">核心规则：</span>{worldview.rules.length > 0 ? worldview.rules.join('、') : '未设置'}</p>
                  <p className="text-xs text-stone-400">{worldview.locked ? '已锁定' : '未锁定'}</p>
                </div>
              ) : (
                <p className="text-sm text-stone-400">尚未设置世界观</p>
              )}
            </CardContent>
          </Card>

          {/* 人物 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-brand-500" />
                人物档案 ({characters.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {characters.length === 0 ? (
                <p className="text-sm text-stone-400">暂无人物</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {characters.map((c) => (
                    <Card key={c.id}>
                      <CardContent className="py-3">
                        <p className="text-sm font-medium text-stone-800">{c.name}</p>
                        <p className="text-xs text-stone-500">{c.role === 'protagonist' ? '主角' : c.role === 'supporting' ? '配角' : c.role === 'antagonist' ? '反派' : '路人'}</p>
                        <p className="mt-1 text-xs text-stone-400 line-clamp-2">{c.personality}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 大纲 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTree className="h-4 w-4 text-brand-500" />
                大纲
              </CardTitle>
            </CardHeader>
            <CardContent>
              {outline ? (
                <div className="space-y-2 text-sm">
                  <p className="text-stone-500">主线：</p>
                  <p className="text-stone-700">{outline.mainPlotline || '未设置'}</p>
                  <p className="mt-2 text-stone-500">分卷数：{outline.volumes.length}</p>
                  <p className="text-stone-500">结局：</p>
                  <p className="text-stone-700">{outline.ending || '未设置'}</p>
                </div>
              ) : (
                <p className="text-sm text-stone-400">尚未设置大纲</p>
              )}
            </CardContent>
          </Card>

          {/* 伏笔 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-brand-500" />
                伏笔 ({foreshadowings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {foreshadowings.length === 0 ? (
                <p className="text-sm text-stone-400">暂无伏笔</p>
              ) : (
                <div className="space-y-2">
                  {foreshadowings.slice(0, 10).map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-md border border-stone-200 px-3 py-2 text-sm">
                      <span className="text-stone-700">{f.description}</span>
                      <span className="text-xs text-stone-400">第{f.setupChapter}章</span>
                    </div>
                  ))}
                  {foreshadowings.length > 10 && (
                    <p className="text-xs text-stone-400">...还有 {foreshadowings.length - 10} 条</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'mid-term' && (
        <div className="space-y-4">
          {/* 章节摘要 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTree className="h-4 w-4 text-brand-500" />
                章节摘要 ({summaries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaries.length === 0 ? (
                <p className="text-sm text-stone-400">暂无章节摘要，生成章节后自动创建</p>
              ) : (
                <div className="space-y-3">
                  {summaries.map((s) => (
                    <Card key={s.id}>
                      <CardContent className="py-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-stone-700">第 {s.chapterNo} 章</span>
                          <span className="text-xs text-stone-400">{s.volumeNo > 0 ? `第${s.volumeNo}卷` : ''}</span>
                        </div>
                        <p className="text-sm text-stone-600">{s.summary}</p>
                        {s.keyEvents.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.keyEvents.map((e, i) => (
                              <span key={i} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                                {e}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}