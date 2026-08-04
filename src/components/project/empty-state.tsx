'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center">
      <div className="mb-4 h-16 w-16 rounded-full bg-brand-50 p-4">
        <Plus className="h-8 w-8 text-brand-500" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-stone-800">还没有任何小说项目</h3>
      <p className="mb-6 max-w-sm text-sm text-stone-500">
        从一个灵感开始吧。AI 将帮你构建世界观、塑造人物、编织剧情，你只需在关键节点介入。
      </p>
      <Link href="/project/new">
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          创建第一部小说
        </Button>
      </Link>
    </div>
  );
}
