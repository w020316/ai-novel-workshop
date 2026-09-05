'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project-store';
import { getOutline, saveOutline } from '@/lib/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { generateOutlineTemplate } from '@/lib/outline/template';
import { toast } from 'sonner';
import { Loader2, BookText, Plus, Wand2 } from 'lucide-react';
import type { Outline, Volume } from '@/types';

export default function OutlinePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { currentProject } = useProjectStore();
  const genre = currentProject?.genre;
  const [outline, setOutline] = useState<Outline | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [mainPlotline, setMainPlotline] = useState('');
  const [ending, setEnding] = useState('');
  const [volumes, setVolumes] = useState<Volume[]>([]);

  useEffect(() => {
    setLoading(true);
    getOutline(projectId)
      .then((o) => {
        if (o) {
          setOutline(o);
          setMainPlotline(o.mainPlotline);
          setEnding(o.ending);
          setVolumes(o.volumes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = async () => {
    const data: Outline = {
      id: outline?.id ?? `outline_${projectId}`,
      projectId,
      volumes,
      mainPlotline,
      climaxNodes: outline?.climaxNodes ?? [],
      ending,
      updatedAt: Date.now(),
    };
    await saveOutline(data);
    setOutline(data);
    setEditing(false);
  };

  const addVolume = () => {
    setVolumes((prev) => [
      ...prev,
      {
        volumeNo: prev.length + 1,
        title: `第${prev.length + 1}卷`,
        summary: '',
        chapterRange: [1, 10] as [number, number],
        coreConflict: '',
      },
    ]);
  };

  const updateVolume = (index: number, patch: Partial<Volume>) => {
    setVolumes((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  /** 从题材模板起底：仅填空为主线/结局/分卷（不覆盖已有人工内容），并进入编辑态 */
  const applyTemplate = () => {
    if (!genre) return;
    if (
      !window.confirm(`确定用「${genre}」题材模板补充空白大纲？仅填充为空的内容，已有内容不受影响。`)
    ) return;
    const tpl = generateOutlineTemplate(genre, currentProject?.targetWords, currentProject?.chapterWords);
    let filled = 0;
    if (!mainPlotline.trim()) {
      setMainPlotline(tpl.mainPlotline);
      filled++;
    }
    if (!ending.trim()) {
      setEnding(tpl.ending);
      filled++;
    }
    setVolumes((prev) => {
      if (prev.length > 0) return prev;
      filled += tpl.volumes.length;
      return tpl.volumes;
    });
    if (filled > 0) {
      toast.success(`已用题材模板补充 ${filled} 项`, { description: '只填充空白内容，可继续编辑后保存' });
    } else {
      toast.info('大纲已有内容，未做改动');
    }
    setEditing(true);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">大纲视图</h1>
          <p className="text-sm text-stone-500">管理故事的主线、分卷和结局</p>
        </div>
        <div className="flex items-center gap-2">
          {genre && (
            <Button variant="outline" onClick={applyTemplate} title={`用「${genre}」题材模板补充空白大纲（不覆盖已有内容）`}>
              <Wand2 className="mr-2 h-4 w-4" />
              从题材模板起底
            </Button>
          )}
          <Button onClick={() => (editing ? handleSave() : setEditing(true))}>
            {editing ? '保存' : '编辑'}
          </Button>
        </div>
      </div>

      {!outline && !editing ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookText className="mb-3 h-12 w-12 text-stone-300" />
            <p className="mb-2 text-sm text-stone-500">还没有设置大纲</p>
            <p className="mb-4 text-xs text-stone-400">点击&ldquo;编辑&rdquo;开始规划你的故事主线</p>
            <Button variant="outline" onClick={() => setEditing(true)}>
              创建大纲
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 主线 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">主线剧情</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <textarea
                  value={mainPlotline}
                  onChange={(e) => setMainPlotline(e.target.value)}
                  className="min-h-[100px] w-full rounded-md border border-stone-200 p-3 text-sm focus:border-brand-500 focus:outline-none"
                  placeholder="描述故事的主线剧情..."
                />
              ) : (
                <p className="text-sm leading-relaxed text-stone-700">
                  {mainPlotline || '暂无主线设定'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* 分卷 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>分卷规划</span>
                {editing && (
                  <Button variant="outline" size="sm" onClick={addVolume}>
                    <Plus className="mr-1 h-3 w-3" />
                    添加卷
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {volumes.length === 0 ? (
                <p className="text-sm text-stone-400">暂无分卷，点击&ldquo;添加卷&rdquo;开始规划</p>
              ) : (
                volumes.map((v, i) => (
                  <Card key={i}>
                    <CardContent className="space-y-3 py-3">
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={v.title}
                            onChange={(e) => updateVolume(i, { title: e.target.value })}
                            className="w-full rounded-md border border-stone-200 px-3 py-1.5 text-sm font-medium focus:border-brand-500 focus:outline-none"
                          />
                          <textarea
                            value={v.summary}
                            onChange={(e) => updateVolume(i, { summary: e.target.value })}
                            className="min-h-[60px] w-full rounded-md border border-stone-200 p-2 text-sm focus:border-brand-500 focus:outline-none"
                            placeholder="卷摘要..."
                          />
                          <div className="flex items-center gap-4 text-xs text-stone-500">
                            <span>
                              章节范围：
                              <input
                                type="number"
                                value={v.chapterRange[0]}
                                onChange={(e) =>
                                  updateVolume(i, {
                                    chapterRange: [parseInt(e.target.value) || 1, v.chapterRange[1]],
                                  })
                                }
                                className="w-16 rounded border border-stone-200 px-2 py-1 text-center"
                              />
                              {' - '}
                              <input
                                type="number"
                                value={v.chapterRange[1]}
                                onChange={(e) =>
                                  updateVolume(i, {
                                    chapterRange: [v.chapterRange[0], parseInt(e.target.value) || 1],
                                  })
                                }
                                className="w-16 rounded border border-stone-200 px-2 py-1 text-center"
                              />
                            </span>
                          </div>
                          <input
                            type="text"
                            value={v.coreConflict}
                            onChange={(e) => updateVolume(i, { coreConflict: e.target.value })}
                            className="w-full rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                            placeholder="核心冲突..."
                          />
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-stone-800">
                            第{v.volumeNo}卷 · {v.title}
                          </p>
                          <p className="text-sm text-stone-600">{v.summary || '暂无摘要'}</p>
                          <div className="flex items-center gap-4 text-xs text-stone-400">
                            <span>章节 {v.chapterRange[0]} - {v.chapterRange[1]}</span>
                            {v.coreConflict && <span>冲突：{v.coreConflict}</span>}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>

          {/* 结局 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">结局设定</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <textarea
                  value={ending}
                  onChange={(e) => setEnding(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-stone-200 p-3 text-sm focus:border-brand-500 focus:outline-none"
                  placeholder="描述故事的结局..."
                />
              ) : (
                <p className="text-sm leading-relaxed text-stone-700">
                  {ending || '暂无结局设定'}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}