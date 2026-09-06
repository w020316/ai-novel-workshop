import Link from 'next/link';
import { Home } from 'lucide-react';

/** 独立页面的「返回主页」链接：统一样式，确保任何页面都能向上跳转回首页 */
export function BackHomeLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={
        'inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-brand-700 ' +
        className
      }
    >
      <Home className="h-4 w-4" />
      返回主页
    </Link>
  );
}
