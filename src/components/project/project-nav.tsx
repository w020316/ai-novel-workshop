'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BookOpen, Settings, PenLine, Brain, Download, HeartPulse, SlidersHorizontal, MessageSquare } from 'lucide-react';

interface ProjectNavProps {
  projectId: string;
}

const NAV_ITEMS = [
  { href: '', label: '概览', icon: BookOpen },
  { href: '/workbench', label: '创作工作台', icon: PenLine },
  { href: '/settings/worldview', label: '设定工坊', icon: Settings },
  { href: '/memory', label: '记忆管理', icon: Brain },
  { href: '/health', label: '健康体检', icon: HeartPulse },
  { href: '/review', label: '多平台审稿', icon: MessageSquare },
  { href: '/export', label: '导出中心', icon: Download },
  { href: '/config', label: '项目配置', icon: SlidersHorizontal },
];

export function ProjectNav({ projectId }: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/project/${projectId}`;

  return (
    <aside className="w-full shrink-0 border-b border-paper-200 bg-paper-100/60 p-2 md:w-56 md:shrink-0 md:border-b-0 md:border-r md:p-4">
      <nav className="flex items-center gap-1 overflow-x-auto md:flex-col md:items-stretch md:space-y-1">
        {NAV_ITEMS.map((item) => {
          const href = basePath + item.href;
          const isActive =
            item.href === ''
              ? pathname === basePath
              : pathname.startsWith(href);

          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-ink-400 hover:bg-paper-100 hover:text-brand-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
