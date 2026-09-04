'use client';

// ============================================================================
// 首访引导（First-visit light-tour）
// 依据：交付报告 §5.6 「首次上手 → 首访 light-tour（3 步高亮）提升完成率」
// 设计：3 步引导浮层，仅首次访问展示（localStorage 持久化），可跳过/上下步；
//       样式沿用「砚斋·墨印」设计 token（paper-card / brand / ink），不引入
//       新增依赖；对零基础用户讲清「为什么 / 怎么开始」，降低认知门槛。
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'ai-novel-tour-done-v1';

interface TourStep {
  icon: string;
  title: string;
  desc: string;
}

const STEPS: TourStep[] = [
  {
    icon: '✍️',
    title: '从灵感与世界观开始',
    desc: '点「新建第一部小说」选题材与字数，或用「找灵感 / 灵感库」找创意，AI 会据此搭好世界观与大纲。',
  },
  {
    icon: '📚',
    title: '分阶段一站式创作',
    desc: '设定 → 大纲 → 逐章正文 → 多稿择优 → 一致性审校 → 去 AI 味 → 导出，全程可人工介入与改写。',
  },
  {
    icon: '🔒',
    title: '数据 100% 留在本机',
    desc: '除非你主动「导出 / 投稿 / 备份」，否则文字与设定只保存在浏览器本地，隐私完全由你掌控。',
  },
];

export function FirstVisitTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // 服务端/客户端一致：仅浏览器读取 localStorage；不阻塞渲染
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') {
        setVisible(false);
        return;
      }
      const t = window.setTimeout(() => setVisible(true), 900);
      return () => window.clearTimeout(t);
    } catch {
      setVisible(false);
    }
  }, []);

  const finish = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* 忽略：无痕/受限环境不持久化 */
    }
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const progressPct = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label="首次上手引导"
    >
      {/* 半透明底 + 轻微纸面氛围 */}
      <div
        className="pointer-events-none absolute inset-0 bg-ink-900/30 backdrop-blur-[2px]"
        aria-hidden="true"
      />
      {/* 引导卡片 */}
      <div className="paper-card relative w-full max-w-md rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            <Sparkles className="h-3.5 w-3.5" />
            砚斋 · 首次上手
          </span>
          <button
            type="button"
            onClick={finish}
            aria-label="关闭引导"
            className="text-ink-faint transition-colors hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <span className="text-3xl" aria-hidden="true">
            {current.icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-ink-700">
              {step + 1}. {current.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{current.desc}</p>
          </div>
        </div>

        {/* 进度条 + 圆点 */}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-paper-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 w-1.5 rounded-full ' + (i === step ? 'bg-brand-600' : 'bg-paper-300')
              }
            />
          ))}
          <span className="ml-auto text-xs text-ink-faint">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* 操作区 */}
        <div className="mt-5 flex items-center justify-between gap-2">
          {isFirst ? (
            <Button variant="ghost" onClick={finish}>
              跳过
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              上一步
            </Button>
          )}
          {isLast ? (
            <Button onClick={finish}>开始创作</Button>
          ) : (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              下一步
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}