'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useProjectStore, DEFAULT_LLM_CONFIG } from '@/lib/store/project-store';
import { db } from '@/lib/db/schema';
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

const MODEL_OPTIONS: Record<LLMProvider, { value: string; label: string }[]> = {
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat (推荐，32K)' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder (64K)' },
  ],
  zhipu: [
    { value: 'glm-4-flash', label: 'GLM-4 Flash (免费，128K)' },
    { value: 'glm-4', label: 'GLM-4 (128K)' },
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

  const { register, handleSubmit, watch, formState: { errors } } = form;
  const selectedProvider = watch('llmProvider');

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
        {errors.summary && (
          <p className="text-xs text-accent-600">{errors.summary.message}</p>
        )}
      </div>

      {/* 目标字数 */}
      <div className="space-y-1.5">
        <Label htmlFor="targetWords">目标字数 *</Label>
        <Input
          id="targetWords"
          type="number"
          step={10000}
          min={10000}
          {...register('targetWords', { valueAsNumber: true })}
        />
        <p className="text-xs text-stone-400">建议 20 万 - 100 万字</p>
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
      </div>

      {/* LLM 配置 */}
      <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 p-4">
        <h3 className="text-sm font-medium text-stone-700">AI 模型配置</h3>

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
