'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Heart } from 'lucide-react';
import { useProjectStore, DEFAULT_LLM_CONFIG } from '@/lib/store/project-store';
import { db } from '@/lib/db/schema';
import { summarizePlan, PLATFORM_CHAPTER_STANDARDS } from '@/lib/outline/volume-plan';
import { generateInspirationStarts, pickFreshStarts, type InspirationStart } from '@/lib/inspiration/starts';
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
  热血升级: '升级流爽点密集、战斗燃，例：气势暴涨，一拳轰出',
  古风雅韵: '古典雅致、意境绵长，例：烛影摇红，衣袂翩然',
  诡秘惊悚: '规则怪谈、氛围压迫，例：耳畔低语，脊背发凉',
  都市轻喜: '现代诙谐、吐槽密集，例：好家伙，社死现场',
  女频甜宠: '高糖低虐、双向奔赴，例：心跳漏了一拍，宠溺一笑',
  快穿利落: '位面快节奏、任务推进，例：位面切换，好感度飙升',
  治愈日常: '温情慢节奏、生活流，例：阳光落在窗台，日子慢慢亮起来',
  短剧钩子风: '每段一反转、强冲突钩子密，例：下一秒，全场哗然',
  电影镜头感: '画面感强、运镜式描写，例：光落在刀锋，一声闷响',
  市井烟火: '烟火气生活流、细腻温热，例：巷口的灯，热气腾腾',
  霸总苏爽: '气场压制、苏点密集，例：他俯身靠近，众人噤声',
  少年漫热血: '热血羁绊、燃点密集，例：燃烧吧，这一拳不会认输',
  网感吐槽体: '弹幕式吐槽、梗密度高，例：好家伙，这波操作离大谱',
};

/** 灵感起点：给小白的快速选题（每次进入随机换新；点 ♥ 喜欢的固定保留） */
const DRAFT_KEY = 'ai-novel-project-draft-v1';
const LIKED_STARTS_KEY = 'ai-novel-liked-starts-v1';

/** 目标字数快捷档（覆盖标准长篇与百万字超长篇） */
const TARGET_WORD_PRESETS: { value: number; label: string }[] = [
  { value: 300000, label: '30 万（标准）' },
  { value: 500000, label: '50 万（中长篇）' },
  { value: 1_000_000, label: '100 万（百万长篇）' },
  { value: 2_000_000, label: '200 万（超长篇）' },
  { value: 5_000_000, label: '500 万（巨著）' },
];

/** 章节数快捷档：按每章字数反推目标字数，与字数双向换算 */
const CHAPTER_PRESETS: number[] = [100, 200, 400, 800, 1500];

/** 目标卷数快捷档（可调，改卷数不影响字数，仅影响分卷规划；留空则按字数自动推算） */
const VOLUME_PRESETS: number[] = [4, 6, 8, 12];

/**
 * 题材 → 推荐文风预设名（按序取第一个在预设库中命中的名字；来自灵感场景时自动匹配）。
 * 未收录的题材走硬核爽文兜底。
 */
const GENRE_STYLE_RECOMMENDATIONS: Record<string, string[]> = {
  玄幻: ['热血升级', '硬核爽文'],
  仙侠: ['热血升级', '硬核爽文'],
  武侠: ['热血升级', '硬核爽文'],
  悬疑: ['悬疑冷峻', '诡秘惊悚'],
  灵异: ['悬疑冷峻', '诡秘惊悚'],
  历史: ['史诗厚重', '古风雅韵'],
  言情: ['细腻言情'],
  甜宠: ['女频甜宠'],
  快穿: ['快穿利落'],
  种田: ['治愈日常'],
  都市: ['都市轻喜', '霸总苏爽'],
  轻小说: ['轻松幽默', '网感吐槽体'],
  末世: ['硬核爽文'],
  游戏: ['硬核爽文'],
};
const GENRE_STYLE_FALLBACK: string[] = ['硬核爽文'];

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
  ollama: [
    { value: 'qwen3:8b', label: 'Qwen3 8B（本地推荐）' },
    { value: 'llama3.1:8b', label: 'Llama 3.1 8B' },
    { value: 'glm4:9b', label: 'GLM-4 9B' },
  ],
};

/** 三步向导：每步对应的必校验字段（选填字段不拦） */
const STEP_META: { title: string; hint: string; fields: (keyof ProjectFormValues)[] }[] = [
  { title: '故事想法', hint: '想写一个什么故事', fields: ['title', 'genre'] },
  { title: '篇幅与文风', hint: '写多长、什么味', fields: ['targetWords', 'stylePresetId', 'volumeCount'] },
  { title: 'AI 配置', hint: '新手保持默认即可', fields: [] },
];

/** 向导预填（来自「一句话灵感 → 自动开书」）：version 变化即重新填入 */
export interface ProjectFormPrefill {
  title: string;
  genre: string;
  summary: string;
  version: number;
}

export function ProjectForm({ prefill }: { prefill?: ProjectFormPrefill }) {
  const router = useRouter();
  const { createProject } = useProjectStore();
  const [submitting, setSubmitting] = useState(false);
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([]);
  const [loadedPresets, setLoadedPresets] = useState(false);
  const [likedStarts, setLikedStarts] = useState<InspirationStart[]>([]);
  const [inspirationStarts, setInspirationStarts] = useState<InspirationStart[]>([]);
  const [refreshingStarts, setRefreshingStarts] = useState(false);
  const draftTimer = useRef<number | undefined>(undefined);
  /** 是否来自灵感场景（选题起点/灵感带入）：是则题材变化时自动匹配推荐文风 */
  const fromInspirationRef = useRef(false);
  /** 用户是否手动改过文风：手动选择优先，自动匹配不再覆盖 */
  const styleTouchedRef = useRef(false);

  // 每次进入都换一批新起点：已喜欢的（♥）固定保留并置顶，其余从精选池随机补足
  useEffect(() => {
    let liked: InspirationStart[] = [];
    try {
      const raw = localStorage.getItem(LIKED_STARTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as InspirationStart[];
        if (Array.isArray(parsed)) {
          liked = parsed.filter((s) => s && typeof s.title === 'string' && typeof s.genre === 'string');
        }
      }
    } catch {
      /* 收藏数据损坏则忽略 */
    }
    setLikedStarts(liked);
    setInspirationStarts(pickFreshStarts(liked.map((s) => s.title), Math.max(0, 5 - liked.length)));
  }, []);

  /** 喜欢/取消喜欢选题起点：喜欢的持久保存，之后每次进入都固定显示 */
  const toggleLikeStart = (s: InspirationStart) => {
    const isLiked = likedStarts.some((l) => l.title === s.title);
    const next = isLiked ? likedStarts.filter((l) => l.title !== s.title) : [...likedStarts, s];
    setLikedStarts(next);
    try {
      localStorage.setItem(LIKED_STARTS_KEY, JSON.stringify(next));
    } catch {
      /* 忽略：存储不可用时静默 */
    }
    if (!isLiked) toast.success(`已喜欢「${s.title}」，以后每次进入都会显示`);
  };

  /** 换一批选题起点：AI 优先按题材多样性重出 5 个（LLM 不可用时内置池随机兜底），避开已喜欢与已看过的 */
  const handleRefreshStarts = async () => {
    setRefreshingStarts(true);
    try {
      const exclude = [...likedStarts, ...inspirationStarts].map((s) => s.title);
      const { starts, usedFallback } = await generateInspirationStarts(exclude);
      setInspirationStarts(starts);
      if (usedFallback) {
        toast.info('AI 暂不可用，已从精选池换一批');
      }
    } catch {
      toast.error('换一批失败，请重试');
    } finally {
      setRefreshingStarts(false);
    }
  };

  // 懒加载文风预设
  if (!loadedPresets) {
    db.stylePresets.toArray().then((presets) => {
      setStylePresets(presets);
      setLoadedPresets(true);
    });
  }

  const form = useForm<ProjectFormValues>({
    // z.coerce 的输入侧类型是 unknown，与输出型 ProjectFormValues 不一致；
    // 运行时 coerce 行为保留（兼容字符串数字），此处仅做类型层对齐
    resolver: zodResolver(projectFormSchema) as unknown as Resolver<ProjectFormValues>,
    defaultValues: {
      title: '',
      genre: '玄幻',
      summary: '',
      targetWords: 300000,
      chapterWords: 2500,
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
  const targetWords = Number.isFinite(Number(watch('targetWords'))) ? Number(watch('targetWords')) : 300000;
  const chapterWords = Number.isFinite(Number(watch('chapterWords'))) && Number(watch('chapterWords')) >= 500
    ? Number(watch('chapterWords'))
    : 2500;
  // 章节数与字数双向换算（按所选的每章字数）：总字数 = 章节数 × 每章字数，随调随算不写死
  const chapterCount = Math.max(1, Math.round(targetWords / chapterWords));
  const setChapters = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return;
    const words = Math.min(5_000_000, Math.max(10_000, Math.round(n * chapterWords)));
    setValue('targetWords', words);
  };
  const selectedGenre = watch('genre');
  // 用户显式指定的卷数（留空/非法 → undefined，走自动推算）
  const explicitVolume = (() => {
    const n = Number(watch('volumeCount'));
    return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.round(n) : undefined;
  })();
  // 动态预估：按目标字数与每章字数实时展示预计卷数与章节数（百万字也能看到规划）；指定卷数时按指定值
  const plan =
    Number.isFinite(targetWords) && targetWords > 0
      ? summarizePlan(targetWords, selectedGenre, chapterWords, explicitVolume)
      : summarizePlan(300000, selectedGenre, chapterWords, explicitVolume);

  // ===== 三步向导 =====
  const [step, setStep] = useState(0);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  /** 下一步前校验当步必填字段，不通过则停留并显示字段错误 */
  const goNext = async () => {
    const fields = STEP_META[step].fields;
    if (fields.length > 0) {
      const ok = await form.trigger(fields as never);
      if (!ok) return;
    }
    setStep((s) => Math.min(s + 1, STEP_META.length - 1));
    scrollTop();
  };

  const goPrev = () => {
    setStep((s) => Math.max(s - 1, 0));
    scrollTop();
  };

  // 从「一句话灵感 → 自动开书」带入：prefill.version 变化即填入（属于「来自灵感」场景）
  useEffect(() => {
    if (!prefill || !prefill.title) return;
    fromInspirationRef.current = true;
    setValue('title', prefill.title.slice(0, 60));
    if (GENRE_OPTIONS.some((o) => o.value === prefill.genre)) {
      setValue('genre', prefill.genre as ProjectFormValues['genre']);
    }
    setValue('summary', prefill.summary.slice(0, 200));
    toast.info('已按开书包填入向导，可再调整');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.version]);

  // 从「趋势灵感」带入：读 URL query 预填标题/题材/简介（属于「来自灵感」场景）
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
      setValue('summary', s.slice(0, 200));
      changed = true;
    }
    if (changed) {
      fromInspirationRef.current = true;
      toast.info('已带入灵感，可再调整');
    }
  }, [setValue]);

  // 题材 → 推荐文风自动匹配：「来自灵感」场景且用户未手动改过文风时，
  // 按预设名找第一个命中的预设（找不到就不动）；手动选择后以手动为准
  useEffect(() => {
    if (!fromInspirationRef.current || styleTouchedRef.current) return;
    const names = GENRE_STYLE_RECOMMENDATIONS[selectedGenre] ?? GENRE_STYLE_FALLBACK;
    for (const name of names) {
      const hit = stylePresets.find((p) => p.name === name);
      if (hit) {
        setValue('stylePresetId', hit.id);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenre, loadedPresets, stylePresets]);

  // 恢复未提交的草稿：仅当没有「灵感带入」query 时（避免覆盖带剧情境）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('title')) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<ProjectFormValues>;
      if (d.title && d.genre && GENRE_OPTIONS.some((o) => o.value === d.genre)) {
        form.reset({ ...form.getValues(), ...d });
        toast.info('已恢复上次未提交的内容，可直接修改后创建');
      }
    } catch {
      /* 草稿损坏则忽略 */
    }
  }, [form]);

  // 草稿自动保存（防中途离开丢失输入，减轻长表单弃单）
  useEffect(() => {
    const sub = form.watch((values) => {
      window.clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
        } catch {
          /* 忽略：存储不可用时静默 */
        }
      }, 300);
    });
    return () => {
      window.clearTimeout(draftTimer.current);
      sub.unsubscribe();
    };
  }, [form]);

  const onSubmit = async (values: ProjectFormValues) => {
    setSubmitting(true);
    try {
      const model = MODEL_OPTIONS[values.llmProvider][0].value;
      const id = await createProject({
        title: values.title,
        genre: values.genre,
        summary: values.summary,
        targetWords: values.targetWords,
        chapterWords: values.chapterWords,
        stylePresetId: values.stylePresetId,
        // 指定过卷数才透传（留空 undefined 不入库，由大纲按字数自动推算）
        ...(values.volumeCount != null ? { volumeCount: values.volumeCount } : {}),
        llmConfig: {
          provider: values.llmProvider,
          model,
          temperature: values.temperature,
          topP: values.topP,
          maxTokens: 4096,
        },
      });
      toast.success('项目创建成功');
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* 忽略 */
      }
      router.push(`/project/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** 提交校验失败：跳到第一个出错的步骤并提示（修复「点了没反应」——隐藏步骤的字段错误不可见） */
  const onInvalid = (errs: Partial<Record<keyof ProjectFormValues, { message?: string }>>) => {
    const first = STEP_META.flatMap((s, i) => s.fields.map((f) => ({ f, i }))).find(({ f }) => errs[f]);
    if (first) {
      setStep(first.i);
      scrollTop();
      toast.warning(String(errs[first.f]?.message ?? '请检查填写内容'), {
        description: '已跳转到需要修改的步骤',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
      {/* 步骤条：已完成步可点击回跳 */}
      <ol className="flex items-center gap-2" aria-label="表单分步">
        {STEP_META.map((s, i) => (
          <li key={s.title} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (i < step) {
                  setStep(i);
                  scrollTop();
                }
              }}
              disabled={i > step}
              className={cn(
                'flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors',
                i === step ? 'text-brand-700' : i < step ? 'text-stone-600 hover:text-brand-700' : 'text-stone-400'
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  i === step && 'border-brand-500 bg-brand-600 text-white',
                  i < step && 'border-brand-300 bg-brand-50 text-brand-700',
                  i > step && 'border-stone-200 bg-stone-50 text-stone-400'
                )}
              >
                {i < step ? '✓' : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{s.title}</span>
            </button>
            {i < STEP_META.length - 1 && <span className="h-px flex-1 bg-stone-200" aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="-mt-3 text-xs text-stone-400">{STEP_META[step].hint}</p>

      {/* ===== 第 1 步 · 故事想法 ===== */}
      {step === 0 && (
        <>
          {/* 灵感起点：给小白快速选题，支持 AI「换一批」；点 ♥ 喜欢的每次进入都固定显示 */}
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-stone-600">
                不知道写什么？点一个起点，会自动帮你填好标题和题材；点 ♥ 喜欢的会一直保留
              </p>
              <button
                type="button"
                onClick={handleRefreshStarts}
                disabled={refreshingStarts}
                className="flex shrink-0 items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-500 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                title="重新换一批选题（尽量与之前不重复，已喜欢的保留）"
              >
                {refreshingStarts ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    AI 想新书名中…
                  </>
                ) : (
                  '↻ 换一批'
                )}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...likedStarts, ...inspirationStarts].map((s) => {
                const liked = likedStarts.some((l) => l.title === s.title);
                return (
                  <span
                    key={s.title}
                    className={cn(
                      'inline-flex items-center overflow-hidden rounded-full border bg-white',
                      liked ? 'border-red-200' : 'border-stone-300'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // 点选题起点属于「来自灵感」场景：题材变化时按推荐自动匹配文风
                        fromInspirationRef.current = true;
                        setValue('title', s.title);
                        setValue('genre', s.genre as never);
                      }}
                      className={cn(
                        'py-1 pl-3 text-xs transition-colors hover:text-brand-700',
                        liked ? 'pr-1.5 text-stone-700' : 'px-3 text-stone-600'
                      )}
                    >
                      {s.title} · {s.genre}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLikeStart(s)}
                      title={liked ? '取消喜欢' : '喜欢：以后每次进入都显示'}
                      aria-label={liked ? '取消喜欢' : '喜欢'}
                      className={cn(
                        'mr-1.5 flex h-5 w-5 items-center justify-center rounded-full transition-colors',
                        liked ? 'text-red-500 hover:text-red-600' : 'text-stone-300 hover:text-red-400'
                      )}
                    >
                      <Heart className={cn('h-3 w-3', liked && 'fill-current')} />
                    </button>
                  </span>
                );
              })}
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
        </>
      )}

      {/* ===== 第 2 步 · 篇幅与文风 ===== */}
      {step === 1 && (
        <>
          {/* 目标章节数（主控）：总字数 = 章节数 × 每章字数，随调随算 */}
          <div className="space-y-1.5">
            <Label htmlFor="chapterCount">目标章节数 *</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                id="chapterCount"
                type="number"
                min={1}
                max={2000}
                className="max-w-48"
                value={chapterCount}
                onChange={(e) => setChapters(Number(e.target.value))}
              />
              {CHAPTER_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setChapters(n)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    chapterCount === n
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-stone-300 bg-white text-stone-600 hover:border-brand-400 hover:text-brand-700'
                  }`}
                >
                  {n} 章
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              改章节数或每章字数，总字数都会自动重算（当前约 {(chapterCount * chapterWords).toLocaleString()} 字）
            </p>
          </div>

          {/* 每章字数：按主流平台爆款标准预设，影响章节数换算与 AI 正文篇幅控制 */}
          <div className="space-y-1.5">
            <Label htmlFor="chapterWords">每章字数（可调 · 按平台爆款标准）</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                id="chapterWords"
                type="number"
                step={500}
                min={1000}
                max={10000}
                className="max-w-48"
                {...register('chapterWords', { valueAsNumber: true })}
              />
              {PLATFORM_CHAPTER_STANDARDS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.hint}
                  onClick={() => setValue('chapterWords', p.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    chapterWords === p.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-stone-300 bg-white text-stone-600 hover:border-brand-400 hover:text-brand-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              档位参考主流平台热门作品：{PLATFORM_CHAPTER_STANDARDS.find((p) => p.value === chapterWords)?.hint ?? '自定义字数'}；调整后自动重算总字数、章节数与分卷，AI 正文也按该字数控制每章篇幅
            </p>
            {errors.chapterWords && (
              <p className="text-xs text-accent-600">{errors.chapterWords.message}</p>
            )}
          </div>

          {/* 目标字数（自动换算，也可直接改：改字数会反推章节数） */}
          <div className="space-y-1.5">
            <Label htmlFor="targetWords">目标字数（自动换算 · 可微调）</Label>
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
              直接改字数会按每章 {chapterWords} 字反推章节数；支持 1 万-500 万字，将自动规划分卷与章节
            </p>
            {errors.targetWords && (
              <p className="text-xs text-accent-600">{errors.targetWords.message}</p>
            )}
          </div>

          {/* 目标卷数（可调）：改卷数不影响字数，仅影响分卷规划；留空按字数自动推算 */}
          <div className="space-y-1.5">
            <Label htmlFor="volumeCount">目标卷数（可调）</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                id="volumeCount"
                type="number"
                min={1}
                max={20}
                placeholder="留空自动推算"
                className="max-w-48"
                {...register('volumeCount', {
                  setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                })}
              />
              {VOLUME_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setValue('volumeCount', n)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    explicitVolume === n
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-stone-300 bg-white text-stone-600 hover:border-brand-400 hover:text-brand-700'
                  }`}
                >
                  {n} 卷
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              指定后大纲按该卷数划分（1-20 卷）；留空则按目标字数自动推算（当前预估 {plan.volumeCount} 卷）
            </p>
            {errors.volumeCount && (
              <p className="text-xs text-accent-600">{errors.volumeCount.message}</p>
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
                {...register('stylePresetId', {
                  // 手动选择优先：标记 touched 后自动匹配不再覆盖
                  onChange: () => {
                    styleTouchedRef.current = true;
                  },
                })}
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
        </>
      )}

      {/* ===== 第 3 步 · AI 配置 ===== */}
      {step === 2 && (
        <>
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
              {selectedProvider === 'ollama' && (
                <p className="text-xs text-amber-600">
                  本地模型零成本、离线可用：需本机已安装并运行 Ollama（ollama serve），且服务端设置 OLLAMA_ENABLED=true；云端部署（如 Vercel）无法访问本机模型，请改用云端供应商
                </p>
              )}
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
        </>
      )}

      {/* ===== 黏性提交条：滚动全程可见，降低长表单弃单 ===== */}
      <div
        className={cn(
          'sticky bottom-0 z-10 -mx-6 border-t border-stone-200 bg-white/95 px-6 backdrop-blur',
          'pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="hidden min-w-0 truncate text-xs text-stone-400 sm:inline">
            预估 {plan.volumeCount} 卷 / {plan.totalChapters.toLocaleString()} 章 · 第 {step + 1}/{STEP_META.length} 步
          </span>
          <div className="flex shrink-0 gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={goPrev} disabled={submitting}>
                上一步
              </Button>
            )}
            {step < STEP_META.length - 1 ? (
              <Button type="button" onClick={goNext} disabled={submitting}>
                下一步
              </Button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
