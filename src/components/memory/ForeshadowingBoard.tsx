'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, GripVertical } from 'lucide-react';
import { listForeshadowings, saveForeshadowing } from '@/lib/db/queries';
import { toast } from 'sonner';
import type { Foreshadowing, ForeshadowingStatus } from '@/types';

interface ForeshadowingBoardProps {
  projectId: string;
}

const COLUMNS: { status: ForeshadowingStatus; label: string; color: string }[] = [
  { status: 'planted', label: '已铺设', color: 'border-blue-200 bg-blue-50' },
  { status: 'pending', label: '待回收', color: 'border-yellow-200 bg-yellow-50' },
  { status: 'recovered', label: '已回收', color: 'border-green-200 bg-green-50' },
  { status: 'abandoned', label: '已废弃', color: 'border-stone-200 bg-stone-50' },
];

export function ForeshadowingBoard({ projectId }: ForeshadowingBoardProps) {
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    listForeshadowings(projectId)
      .then(setForeshadowings)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  const moveTo = async (id: string, newStatus: ForeshadowingStatus) => {
    await saveForeshadowing({ ...foreshadowings.find((f) => f.id === id)!, status: newStatus });
    toast.success('伏笔状态已更新');
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const grouped = COLUMNS.map((col) => ({
    ...col,
    items: foreshadowings.filter((f) => f.status === col.status),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {grouped.map((col) => (
          <div key={col.status} className={`rounded-lg border-2 ${col.color} p-3`}>
            <h3 className="mb-3 text-sm font-medium text-stone-700">
              {col.label}
              <span className="ml-2 text-xs text-stone-400">({col.items.length})</span>
            </h3>
            <div className="space-y-2">
              {col.items.length === 0 ? (
                <p className="py-4 text-center text-xs text-stone-400">暂无</p>
              ) : (
                col.items.map((f) => (
                  <Card key={f.id} className="cursor-grab active:cursor-grabbing">
                    <CardContent className="py-2">
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-stone-300" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-stone-700">{f.description}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
                            <span>第{f.setupChapter}章铺设</span>
                            {f.importance === 'high' && <span className="text-red-500">重要</span>}
                            {f.importance === 'medium' && <span className="text-yellow-500">中等</span>}
                          </div>
                          {/* 快速操作 */}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {col.status === 'planted' && (
                              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => moveTo(f.id, 'pending')}>
                                标记待回收
                              </Button>
                            )}
                            {col.status === 'pending' && (
                              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => moveTo(f.id, 'recovered')}>
                                标记已回收
                              </Button>
                            )}
                            {(col.status === 'planted' || col.status === 'pending') && (
                              <Button variant="outline" size="sm" className="h-6 text-xs text-red-500" onClick={() => moveTo(f.id, 'abandoned')}>
                                废弃
                              </Button>
                            )}
                            {col.status === 'abandoned' && (
                              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => moveTo(f.id, 'planted')}>
                                恢复
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}