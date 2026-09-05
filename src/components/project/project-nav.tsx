'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Settings,
  PenLine,
  Brain,
  Download,
  HeartPulse,
  SlidersHorizontal,
  MessageSquare,
  Menu,
  X,
} from 'lucide-react';

interface ProjectNavProps {
  projectId: string;
  /** 项目书名：移动端吸顶栏与抽屉头部展示（可选，兼容旧调用） */
  title?: string;
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

function useActiveLabel(pathname: string, basePath: string) {
  for (const item of NAV_ITEMS) {
    const href = basePath + item.href;
    const isActive =
      item.href === '' ? pathname === basePath : pathname.startsWith(href);
    if (isActive) return item.label;
  }
  return '概览';
}

export function ProjectNav({ projectId, title }: ProjectNavProps) {
  const pathname = usePathname();
  const basePath = `/project/${projectId}`;
  const [open, setOpen] = useState(false);
  const activeLabel = useActiveLabel(pathname, basePath);

  // 路由切换后自动收起抽屉
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 抽屉打开时锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const links = NAV_ITEMS.map((item) => {
    const href = basePath + item.href;
    const isActive =
      item.href === '' ? pathname === basePath : pathname.startsWith(href);
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
  });

  return (
    <>
      {/* 桌面端侧边栏（保持不变） */}
      <aside className="hidden shrink-0 border-b border-paper-200 bg-paper-100/60 p-2 md:block md:w-56 md:border-b-0 md:border-r md:p-4">
        <nav className="flex flex-col items-stretch space-y-1">{links}</nav>
      </aside>

      {/* 移动端吸顶栏 + 抽屉 */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-paper-200 bg-paper-50/95 px-3 py-2 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="打开导航"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-ink-600 transition-colors hover:bg-paper-100 hover:text-brand-700"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-serif text-base text-ink-600">
          {title ?? '小说工坊'}
        </span>
        <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
          {activeLabel}
        </span>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="关闭导航"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink-900/40 animate-fade-in"
          />
          <nav
            aria-label="项目导航"
            className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto border-r border-paper-200 bg-paper-50 p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="truncate font-serif text-base text-ink-600">
                {title ?? '小说工坊'}
              </span>
              <button
                type="button"
                aria-label="收起导航"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-ink-400 transition-colors hover:bg-paper-100 hover:text-brand-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col items-stretch space-y-1">{links}</div>
          </nav>
        </div>
      )}
    </>
  );
}
