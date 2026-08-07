'use client';

import { useParams } from 'next/navigation';
import { MemoryBrowser } from '@/components/memory/MemoryBrowser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Info } from 'lucide-react';

export default function MemoryPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">记忆管理</h1>
          <p className="text-sm text-stone-500">浏览和管理三级记忆体系</p>
        </div>
      </div>

      {/* 提示卡 */}
      <Card className="border-brand-200 bg-brand-50/50">
        <CardContent className="flex items-start gap-3 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <div className="text-xs text-stone-600">
            <p className="mb-1">
              <strong>长期记忆</strong>：世界观、人物档案、大纲设定和伏笔——这些是故事的基础设定，通常不会频繁变化。
            </p>
            <p className="mb-1">
              <strong>中期记忆</strong>：章节摘要和支线状态——通过向量检索获取与当前章节相关的历史内容。
            </p>
            <p>
              <strong>短期记忆</strong>：最近几章的内容和当前剧情要点——在生成过程中自动维护。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 记忆浏览器 */}
      <MemoryBrowser projectId={projectId} />
    </div>
  );
}