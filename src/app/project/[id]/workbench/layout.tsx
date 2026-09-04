'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ListOrdered, BookText } from 'lucide-react';

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    // 章节列表就在 /workbench 根路径（不要指向不存在的 /workbench/chapters）
    { href: '/workbench', label: '章节列表', icon: ListOrdered },
    { href: '/workbench/outline', label: '大纲视图', icon: BookText },
  ];

  // 用当前路径判断当前子页签
  const currentPath = pathname.split('/workbench')[1] || '';

  return (
    <div>
      {/* 子导航 */}
      <div className="mb-6 flex items-center gap-1 border-b border-paper-200">
        {tabs.map((tab) => {
          const href = pathname.replace(/\/workbench(\/.*)?$/, tab.href);
          const isActive = currentPath === tab.href.replace('/workbench', '') || currentPath.startsWith(tab.href.replace('/workbench', '') + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors',
                isActive
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}