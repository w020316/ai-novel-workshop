'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Globe, Users, Palette, Library, Lock } from 'lucide-react';

const SETTINGS_TABS = [
  {
    slug: 'worldview',
    label: '世界观',
    icon: Globe,
    desc: '世界架构 · 力量体系 · 势力划分',
  },
  {
    slug: 'characters',
    label: '人物档案',
    icon: Users,
    desc: '人物卡 · 关系图 · 成长线',
  },
  {
    slug: 'style',
    label: '文风配置',
    icon: Palette,
    desc: '叙事视角 · 节奏 · 样本',
  },
  {
    slug: 'genre',
    label: '题材模板',
    icon: Library,
    desc: '节奏规律 · 爽点设计',
  },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const basePath = `/project/${projectId}/settings`;

  const activeSlug =
    SETTINGS_TABS.find((t) => pathname === `${basePath}/${t.slug}`)?.slug ?? null;

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="设定工坊 Tab 切换"
        className="flex flex-wrap gap-1 border-b border-stone-200"
      >
        {SETTINGS_TABS.map((tab) => {
          const href = `${basePath}/${tab.slug}`;
          const isActive = activeSlug === tab.slug;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.slug}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={cn(
                'group flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <p className="flex items-center gap-1.5 text-xs text-stone-500">
        <Lock className="h-3 w-3" />
        世界观与人物档案在创作进行后建议锁定，避免破坏已生成章节的一致性
      </p>

      <div role="tabpanel" className="min-h-[400px]">
        {children}
      </div>
    </div>
  );
}
