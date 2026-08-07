'use client';

import { useParams } from 'next/navigation';
import { ForeshadowingBoard } from '@/components/memory/ForeshadowingBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function ForeshadowingPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">伏笔看板</h1>
          <p className="text-sm text-stone-500">伏笔的铺设、回收和追踪管理</p>
        </div>
      </div>

      {/* 提示 */}
      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardContent className="flex items-start gap-3 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
          <div className="text-xs text-stone-600">
            伏笔状态管理：<strong>已铺设</strong> → <strong>待回收</strong> → <strong>已回收</strong> 或 <strong>已废弃</strong>。
            章节生成时，Agent 会自动创建和更新伏笔状态。
          </div>
        </CardContent>
      </Card>

      <ForeshadowingBoard projectId={projectId} />
    </div>
  );
}