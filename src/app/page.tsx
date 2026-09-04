'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProjectStore } from '@/lib/store/project-store';
import { getProjectStats } from '@/lib/db/queries';
import { getProviders, type ProvidersResult } from '@/lib/llm/client';
import { ProjectCard } from '@/components/project/project-card';
import { EmptyState } from '@/components/project/empty-state';
import { FirstVisitTour } from '@/components/onboarding/first-visit-tour';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, TrendingUp, ShieldCheck, Info } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectStatsMap {
  [projectId: string]: { totalWords: number; totalChapters: number; completedChapters: number };
}

export default function Home() {
  const { projects, loading, error, loadProjects, archiveProject, clearError } = useProjectStore();
  const [statsMap, setStatsMap] = useState<ProjectStatsMap>({});
  const [llm, setLlm] = useState<ProvidersResult | null>(null);
  const [llmDismissed, setLlmDismissed] = useState(false);

  useEffect(() => {
    loadProjects().catch(() => {});
  }, [loadProjects]);

  // 探测 LLM 就绪状态，未配置时给出显性提示（P1）
  useEffect(() => {
    getProviders()
      .then(setLlm)
      .catch(() => setLlm(null));
  }, []);

  // 并行加载所有项目的统计
  useEffect(() => {
    if (projects.length === 0) {
      setStatsMap({});
      return;
    }
    let cancelled = false;
    Promise.all(
      projects.map(async (p) => [p.id, await getProjectStats(p.id)] as const)
    ).then((entries) => {
      if (cancelled) return;
      const map: ProjectStatsMap = {};
      for (const [id, stats] of entries) map[id] = stats;
      setStatsMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleArchive = async (id: string) => {
    try {
      await archiveProject(id);
      toast.success('项目已归档');
    } catch {
      toast.error('归档失败');
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      {/* 顶导航 */}
      <header className="relative z-10 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="seal" aria-hidden="true">砚</span>
          <div>
            <h1 className="font-serif text-2xl font-bold text-brand-800 sm:text-3xl">
              AI 小说制作工坊
            </h1>
            <p className="mt-1 hidden text-sm text-ink-500 sm:block">
              AI 全流程高质量小说生成器 · 人工轻度介入
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/inspiration/library" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            灵感库
          </Link>
          <Link href="/inspiration" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
            <TrendingUp className="h-4 w-4" />
            找灵感
          </Link>
          {projects.length > 0 && (
            <Link href="/project/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建小说
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* LLM 未配置护栏（P1）：AI 功能不可用但要让用户看得见原因 */}
      {llm && !llm.ready && !llmDismissed && (
        <div className="paper-card relative mb-6 flex flex-wrap items-center gap-3 rounded-xl border-amber-200 px-4 py-3">
          <Info className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1 text-sm text-ink-soft">
            <span className="font-medium text-ink-600">尚未配置 AI 模型：</span>
            设定 / 大纲 / 正文生成等 AI 功能需要先在服务端填入模型 API Key。请编辑项目根目录
            <code className="mx-1 rounded bg-paper-100 px-1 py-0.5 font-mono text-xs">.env.local</code>
            配置
            <code className="mx-1 rounded bg-paper-100 px-1 py-0.5 font-mono text-xs">GEMINI_API_KEY</code>或
            <code className="mx-1 rounded bg-paper-100 px-1 py-0.5 font-mono text-xs">ZHIPU_API_KEY</code>后重启应用。
          </div>
          <button
            type="button"
            onClick={() => setLlmDismissed(true)}
            className="text-xs text-ink-faint hover:text-ink-600"
          >
            我知道了
          </button>
        </div>
      )}

      {/* 题首 · Hero（砚斋墨印） */}
      <section className="paper-card relative mb-8 overflow-hidden rounded-2xl px-6 py-10 sm:px-10 sm:py-12">
        {/* 氛围层：宣纸墨晕 + 右缘竖排水印印章 */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-brand-800/8 blur-2xl" />
          <div className="absolute bottom-0 right-24 h-40 w-56 rounded-full bg-accent-600/10 blur-2xl" />
          <span className="watermark-seal absolute right-4 top-1/2 hidden -translate-y-1/2 text-5xl md:block">
            砚斋·墨印
          </span>
        </div>

        <div className="relative">
          <div className="reveal" style={{ animationDelay: '0ms' }}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="inline-block rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                设定 · 大纲 · 正文 · 审校 · 导出一站式
              </span>
              {llm?.ready && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <ShieldCheck className="h-3 w-3" />
                  模型就绪
                  {llm.providers[0]?.label ? ` · ${llm.providers[0].label}` : ''}
                </span>
              )}
            </span>
          </div>
          <h2 className="reveal mt-4 font-serif text-3xl font-bold leading-snug text-ink-600 sm:text-5xl" style={{ animationDelay: '90ms' }}>
            写一部
            <span className="seal-accent"> 能成书 </span>
            的小说
          </h2>
          <span className="reveal brush-line mt-3" style={{ animationDelay: '180ms' }} aria-hidden="true" />
          <p className="reveal mt-4 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base" style={{ animationDelay: '270ms' }}>
            从灵感与世界观开始，到逐章正文、多稿择优、一致性审校与去 AI 味，全程可人工介入、随时改写。所有数据仅存本地，隐私 100% 留在你的浏览器。
          </p>
          <div className="reveal mt-6 flex flex-wrap items-center gap-3" style={{ animationDelay: '360ms' }}>
            {projects.length === 0 ? (
              <>
                <Link href="/project/new">
                  <Button size="lg">
                    <Plus className="mr-2 h-4 w-4" />
                    新建第一部小说
                  </Button>
                </Link>
                <Link href="/inspiration" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700">
                  <TrendingUp className="h-4 w-4" />
                  先去找灵感
                </Link>
              </>
            ) : (
              <span className="text-sm text-ink-soft">
                继续你的写作 · 选择下方项目进入，或
                <Link href="/project/new" className="ml-1 text-brand-600 underline-offset-4 hover:underline">
                  新建一本
                </Link>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 内容区 */}
      {loading && projects.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-stone-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载中…
        </div>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, i) => (
            <div key={project.id} className="reveal" style={{ animationDelay: `${i * 80 + 120}ms` }}>
              <ProjectCard
                project={project}
                stats={statsMap[project.id] ?? { totalWords: 0, totalChapters: 0, completedChapters: 0 }}
                onArchive={handleArchive}
              />
            </div>
          ))}
        </div>
      )}

      {/* 底部 */}
      <footer className="mt-16 border-t border-paper-200 pt-6 text-center text-xs text-ink-300">
        <p>所有数据存储在浏览器本地 · 隐私 100% 安全 · 数据不离机</p>
      </footer>

      {/* 首访引导（light-tour，仅首次展示） */}
      <FirstVisitTour />
    </main>
  );
}
