'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BookOpen, Settings, PenLine, Brain, Download } from 'lucide-react';

interface ProjectNavProps {
  projectId: string;
}

const NAV_ITEMS = [
  { href: '', label: '概览', icon: BookOpen },
  { href: '/workbench', label: '创作工作台', icon: PenLine },
  { href: '/settings/worldview', label: '设定工坊', icon: Settings },
  { href: '/memory', label: '记忆管理', icon: Brain },
  { href: '/export', label: '导出中心', icon: Download },
];

export function ProjectNav({ projectId }: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/project/${projectId}`;

  return (
    <aside className="w-56 shrink-0 border-r border-stone-200 bg-stone-50/50 p-4">
      <nav className="space-y-1">
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
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-brand-100 text-brand-700'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
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
