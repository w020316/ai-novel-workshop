'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * 全局通知 Provider
 * 依据：spec 7.1 节（错误反馈）
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: 'rounded-md border border-stone-200 shadow-md',
        },
      }}
    />
  );
}
