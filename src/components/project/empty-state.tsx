'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, TrendingUp } from 'lucide-react';

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
      <Link
        href="/inspiration"
        className="mt-3 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
      >
        <TrendingUp className="h-3.5 w-3.5" />
        没有灵感？去「趋势灵感」看看热门风向
      </Link>

      <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['1', '新建项目', '设定题材、目标字数、文风与 AI 模型'],
          ['2', '生成设定 · 章节', '在设定工坊与创作工作台一键生成'],
          ['3', '校验 · 导出', '冷读复核、去AI味、投稿体检后导出'],
        ].map(([n, t, d]) => (
          <div
            key={n}
            className="rounded-md border border-stone-200 bg-stone-50 p-3 text-left"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] font-medium text-brand-700">
              {n}
            </span>
            <p className="mt-1.5 text-xs font-medium text-stone-700">{t}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
