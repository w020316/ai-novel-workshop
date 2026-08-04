'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { seedDatabase } from '@/lib/db/seed';
import { Loader2 } from 'lucide-react';

/**
 * 数据库初始化组件
 * 在应用启动时确保种子数据（题材模板+文风预设）已加载
 */
export function DatabaseInitializer({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedDatabase()
      .then(() => setReady(true))
      .catch((e) => {
        console.error('数据库初始化失败', e);
        // 仍然设置 ready，让用户能看到错误
        setReady(true);
      });
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return <>{children}</>;
}
