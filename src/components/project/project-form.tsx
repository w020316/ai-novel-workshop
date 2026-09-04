'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useProjectStore, DEFAULT_LLM_CONFIG } from '@/lib/store/project-store';
import { db } from '@/lib/db/schema';
import { summarizePlan } from '@/lib/outline/volume-plan';
import {
  projectFormSchema,
  type ProjectFormValues,
  GENRE_OPTIONS,
  PROVIDER_OPTIONS,
} from '@/lib/validators';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LLMProvider, StylePreset } from '@/types';

/** 文风一句话说明（纯新手提示，不含偏好校验） */
const STYLE_HINT: Record<string, string> = {
  细腻言情: '情绪细腻、心理描写多，例：眸光微动，心尖一颤',
  硬核爽文: '节奏快、打脸逆袭多，例：冷笑一声，杀意凛然',
  悬疑冷峻: '氛围紧张、信息克制，例：寒意爬上脊背',
  史诗厚重: '宏大叙事、古风厚重，例：烽烟起，山河变色',
  轻松幽默: '轻松搞笑、对话多，例：翻了个白眼，欲哭无泪',
};

/** 灵感起点：给小白的快速选题（点击即填标题与题材） */
const INSPIRATION_STARTS: { title: string; genre: string }[] = [
  { title: '星河黎明', genre: '科幻' },
  { title: '赘婿归来', genre: '都市' },
  { title: '废柴逆袭', genre: '玄幻' },
  { title: '幕后黑手', genre: '悬疑' },
  { title: '宫廷嫡女', genre: '宫斗' },
];

/** 目标字数快捷档（覆盖标准长篇与百万字超长篇） */
const TARGET_WORD_PRESETS: { value: number; label: string }[] = [
  { value: 300000, label: '30 万（标准）' },
  { value: 500000, label: '50 万（中长篇）' },
  { value: 1_000_000, label: '100 万（百万长篇）' },
  { value: 2_000_000, label: '200 万（超长篇）' },
  { value: 5_000_000, label: '500 万（巨著）' },
];

const MODEL_OPTIONS: Record<LLMProvider, { value: string; label: string }[]> = {
  gemini: [
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (免费推荐，最新)' },
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (免费，稳定)' },
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (免费，轻量高限)' },
  ],
  zhipu: [
    { value: 'glm-4-flash', label: 'GLM-4 Flash (免费，128K)' },
    { value: 'glm-4', label: 'GLM-4 (128K)' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat (推荐，32K)' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder (64K)' },
  ],
  qwen: [
    { value: 'qwen-turbo', label: 'Qwen Turbo (8K)' },
    { value: 'qwen-plus', label: 'Qwen Plus (32K)' },
  ],
};

export function ProjectForm() {
  const router = useRouter();
  const { createProject } = useProjectStore();
  const [submitting, setSubmitting] = useState(false);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [loadedPresets, setLoadedPresets] = useState(false);

  // 懒加载文风预设
  if (!loadedPresets) {
    db.stylePresets.toArray().then((presets) => {
      setStylePresets(presets);
      setLoadedPresets(true);
    });
  }

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: '',
      genre: '玄幻',
      summary: '',
      targetWords: 300000,
      stylePresetId: 'style-preset-1',
      llmProvider: DEFAULT_LLM_CONFIG.provider,
      temperature: DEFAULT_LLM_CONFIG.temperature,
      topP: DEFAULT_LLM_CONFIG.topP,
    },
  });

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;
  const selectedProvider = watch('llmProvider');
  const selectedPresetId = watch('stylePresetId');
  const selectedPreset = stylePresets.find((p) => p.id === selectedPresetId);
  const targetWords = Number(watch('targetWords'));
  const selectedGenre = watch('genre');
  // 动态预估：按目标字数实时展示预计卷数与章节数（百万字也能看到规划）
  const plan =
    Number.isFinite(targetWords) && targetWords > 0
      ? summarizePlan(targetWords, selectedGenre)
      : summarizePlan(300000, selectedGenre);

  // 从「趋势灵感」带入：读 URL query 预填标题/题材/简介
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('title');
    const g = q.get('genre');
    const s = q.get('summary');
    let changed = false;
    if (t) {
      setValue('title', t.slice(0, 60));
      changed = true;
    }
    if (g && GENRE_OPTIONS.some((o) => o.value === g)) {
      setValue('genre', g as ProjectFormValues['genre']);
      changed = true;
    }
    if (s) {
      setValue('summary', s.slice(0, 300));
      changed = true;
    }
    if (changed) toast.info('已带入灵感，可再调整');
  }, [setValue]);

  const onSubmit = async (values: ProjectFormValues) => {
    setSubmitting(true);
    try {
      const model = MODEL_OPTIONS[values.llmProvider][0].value;
      const id = await createProject({
        title: values.title,
        genre: values.genre,
        summary: values.summary,
        targetWords: values.targetWords,
        stylePresetId: values.stylePresetId,
        llmConfig: {
          provider: values.llmProvider,
          model,
          temperature: values.temperature,
          topP: values.topP,
          maxTokens: 4096,
        },
      });
      toast.success('项目创建成功');
      router.push(`/project/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* 灵感起点：给小白快速选题 */}
      <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
        <p className="mb-2 text-xs font-medium text-stone-600">
          不知道写什么？点一个起点，会自动帮你填好标题和题材，也可以自己起名
        </p>
        <div className="flex flex-wrap gap-1.5">
          {INSPIRATION_STARTS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => {
                setValue('title', s.title);
                setValue('genre', s.genre as never);
              }}
              className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600 transition-colors hover:border-brand-400 hover:text-brand-700"
            >
              {s.title} · {s.genre}
            </button>
          ))}
        </div>
      </div>

      {/* 标题 */}
      <div className="space-y-1.5">
        <Label htmlFor="title">小说标题 *</Label>
        <Input
          id="title"
          placeholder="如：星河黎明"
          {...register('title')}
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <p className="text-xs text-accent-600">{errors.title.message}</p>
        )}
      </div>

      {/* 题材 */}
      <div className="space-y-1.5">
        <Label>题材 *</Label>
        <div className="flex flex-wrap gap-2">
          {GENRE_OPTIONS.map((opt) => (
            <label key={opt.value} className="cursor-pointer">
              <input
                type="radio"
                value={opt.value}
                {...register('genre')}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'inline-block rounded-md border px-3 py-1.5 text-sm transition-colors',
                  'border-stone-300 text-stone-600',
                  'peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700'
                )}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </div>
        {errors.genre && (
          <p className="text-xs text-accent-600">{errors.genre.message}</p>
        )}
        <p className="text-xs text-stone-400">
          题材决定世界观基调，之后可随时回来改；拿不准就选「其他」自由发挥
        </p>
      </div>

      {/* 简介 */}
      <div className="space-y-1.5">
        <Label htmlFor="summary">一句话简介</Label>
        <Textarea
          id="summary"
          placeholder="用一句话概括故事核心（选填，可后补）"
          rows={2}
          {...register('summary')}
        />
        <p className="text-xs text-stone-400">
          写一句更贴合你的故事（AI 会优先按它生成设定）；留空则交给 AI 自由发挥
        </p>
        {errors.summary && (
          <p className="text-xs text-accent-600">{errors.summary.message}</p>
        )}
      </div>

      {/* 目标字数 */}
      <div className="space-y-1.5">
        <Label htmlFor="targetWords">目标字数 *</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Input
            id="targetWords"
            type="number"
            step={10000}
            min={10000}
            max={5000000}
            className="max-w-48"
            {...register('targetWords', { valueAsNumber: true })}
          />
          {TARGET_WORD_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setValue('targetWords', p.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                targetWords === p.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-stone-300 bg-white text-stone-600 hover:border-brand-400 hover:text-brand-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-400">
          支持 1 万-500 万字（百万字长篇友好）· 约每 2000-3000 字一章，将自动规划分卷与章节
        </p>
        <p className="text-xs text-stone-500">
          预估：{plan.volumeCount} 卷 / {plan.totalChapters.toLocaleString()} 章（按每章约 2500 字估算）
        </p>
        {errors.targetWords && (
          <p className="text-xs text-accent-600">{errors.targetWords.message}</p>
        )}
      </div>

      {/* 文风预设 */}
      <div className="space-y-1.5">
        <Label htmlFor="stylePresetId">文风预设 *</Label>
        {!loadedPresets ? (
          <p className="text-xs text-stone-400">加载文风预设中…</p>
        ) : (
          <select
            id="stylePresetId"
            {...register('stylePresetId')}
            className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm"
          >
            {stylePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        )}
        {errors.stylePresetId && (
          <p className="text-xs text-accent-600">{errors.stylePresetId.message}</p>
        )}
        <p className="text-xs text-stone-400">
          {STYLE_HINT[selectedPreset?.name ?? ''] ?? '决定整体语言质感，进入项目后仍可调整'}
        </p>
      </div>

      {/* LLM 配置 */}
      <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
        <h3 className="text-sm font-medium text-stone-700">AI 模型配置</h3>
        <p className="text-xs text-stone-400">新手可直接用默认，无需修改；想更智能或更省可以后续在项目里调整</p>

        <div className="space-y-1.5">
          <Label>模型供应商</Label>
          <div className="flex gap-2">
            {PROVIDER_OPTIONS.map((opt) => (
              <label key={opt.value} className="cursor-pointer">
                <input
                  type="radio"
                  value={opt.value}
                  {...register('llmProvider')}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'inline-block rounded-md border px-3 py-1.5 text-sm transition-colors',
                    'border-stone-300 text-stone-600',
                    'peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700'
                  )}
                >
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-stone-400">
            首选：{MODEL_OPTIONS[selectedProvider]?.[0]?.label}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="temperature">温度 (0-2)</Label>
            <Input
              id="temperature"
              type="number"
              step={0.1}
              min={0}
              max={2}
              {...register('temperature', { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topP">Top-P (0-1)</Label>
            <Input
              id="topP"
              type="number"
              step={0.05}
              min={0}
              max={1}
              {...register('topP', { valueAsNumber: true })}
            />
          </div>
        </div>
      </div>

      {/* 创建后会发生什么（降低黑箱感） */}
      <div className="rounded-md border border-brand-200 bg-brand-50/40 p-3">
        <p className="mb-1.5 text-xs font-medium text-brand-700">创建后会发生什么？</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-stone-600">
          <li>进入项目概览，先到「设定工坊」一键生成世界观</li>
          <li>再生成人物档案与大纲，随时可改</li>
          <li>最后到「创作工作台」逐章生成正文，每步可预览、手动修改或重新生成</li>
        </ol>
        <p className="mt-1.5 text-xs text-stone-400">
          全程可人工介入，不是全自动「黑箱」；实在不懂就把流程动画看完再动手。
        </p>
      </div>

      {/* 提交 */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          取消
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              创建中…
            </>
          ) : (
            '创建项目'
          )}
        </Button>
      </div>
    </form>
  );
}
