import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewProjectClient } from '@/components/project/new-project-client';
import { DatabaseInitializer } from '@/components/providers';

export default function NewProjectPage() {
  return (
    <DatabaseInitializer>
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center text-sm text-stone-500 hover:text-stone-700"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          返回项目列表
        </Link>

        <header className="mb-8">
          <h1 className="font-serif text-2xl font-bold text-brand-800">新建小说项目</h1>
          <p className="mt-1 text-sm text-stone-500">
            一句话灵感即可自动开书；也可直接填写基本信息，AI 将基于这些构建世界观与剧情
          </p>
        </header>

        <NewProjectClient />
      </main>
    </DatabaseInitializer>
  );
}
