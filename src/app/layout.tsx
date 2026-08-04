import type { Metadata } from 'next';
import './globals.css';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/toaster';

export const metadata: Metadata = {
  title: 'AI 小说制作工坊',
  description: 'AI 全流程高质量小说生成器 · 人工轻度介入',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <ErrorBoundary>{children}</ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
