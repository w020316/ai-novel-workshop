export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold text-brand-800">
          AI 小说制作工坊
        </h1>
        <p className="mb-2 text-lg text-stone-600">
          AI 全流程高质量小说生成器
        </p>
        <p className="text-sm text-stone-500">
          人工轻度介入 · 百万字长篇不崩塌
        </p>
        <div className="mt-8 inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-700">
          P0 基础设施搭建中…
        </div>
      </div>
    </main>
  );
}
