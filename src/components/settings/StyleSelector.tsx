'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listStylePresets, updateProject, saveStylePreset, getProject } from '@/lib/db/queries';
import { BUILTIN_PERSONAS, getBuiltinPersona, recommendPersonaForGenre } from '@/lib/style/persona';
import { recommendStylePreset, styleRecommendBasis } from '@/lib/style/recommend';
import { cn, countChineseWords } from '@/lib/utils';
import type { StylePreset, NarrativePerspective, Pacing, DescriptionDensity, Genre } from '@/types';
import {
  Palette,
  Check,
  Loader2,
  Eye,
  MessageCircle,
  Gauge,
  Sparkles,
  UserRound,
  Wand2,
} from 'lucide-react';

interface StyleSelectorProps {
  projectId: string;
  currentStylePresetId: string;
  onSelected: () => void;
}

const PERSPECTIVE_LABEL: Record<NarrativePerspective, string> = {
  first: '第一人称',
  'third-limited': '第三人称有限',
  'third-omniscient': '第三人称全知',
};

const PACING_LABEL: Record<Pacing, string> = {
  fast: '快节奏',
  medium: '中节奏',
  slow: '慢节奏',
};

const DENSITY_LABEL: Record<DescriptionDensity, string> = {
  sparse: '稀疏',
  medium: '适中',
  detailed: '详尽',
};

export function StyleSelector({
  projectId,
  currentStylePresetId,
  onSelected,
}: StyleSelectorProps) {
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [bindingPersona, setBindingPersona] = useState<string | null>(null);
  const [genre, setGenre] = useState<Genre | null>(null);
  // 按题材智能推荐（需求 8）：先展示推荐结果，用户点「应用」才切换
  const [summary, setSummary] = useState('');
  const [recommendation, setRecommendation] = useState<StylePreset | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, project] = await Promise.all([listStylePresets(), getProject(projectId)]);
      setPresets(list);
      setGenre(project?.genre ?? null);
      setSummary(project?.summary ?? '');
    } catch (e) {
      toast.error('加载文风预设失败', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleSelect = async (preset: StylePreset) => {
    setSelecting(preset.id);
    try {
      // 若是项目专属预设，已存在直接选用；否则更新 project.stylePresetId
      await updateProject(projectId, { stylePresetId: preset.id });
      toast.success(`已选择「${preset.name}」文风`);
      onSelected();
    } catch (e) {
      toast.error('选择失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSelecting(null);
    }
  };

  /** 按题材/简介智能推荐：仅展示结果，用户点「应用」后才切换 */
  const handleRecommend = () => {
    if (presets.length === 0) {
      toast.info('暂无预设，请先在样本上传区上传样本生成项目专属预设');
      return;
    }
    const rec = recommendStylePreset({ genre: genre ?? '', summary, presets });
    if (!rec) {
      toast.info('暂无可推荐的文风预设');
      return;
    }
    if (rec.id === currentStylePresetId) {
      toast.info(`当前文风「${rec.name}」已是推荐文风`);
      return;
    }
    setRecommendation(rec);
  };

  /** 推荐理由一句话（按命中依据生成） */
  const recommendReason = (() => {
    if (!recommendation) return '';
    const basis = styleRecommendBasis(genre ?? '', summary);
    if (basis === 'summary') return '项目简介中的题材关键词与该文风匹配';
    if (basis === 'genre') return `题材「${genre}」的经典文风搭配`;
    return '暂无更精准的题材匹配，推荐使用第一个预设';
  })();

  /** 绑定/解绑叙述者人格（仅项目专属预设可改；内置预设只读） */
  const handleBindPersona = async (preset: StylePreset, personaId: string | null) => {
    setBindingPersona(preset.id);
    try {
      const persona = personaId ? getBuiltinPersona(personaId) : undefined;
      await saveStylePreset({ ...preset, persona });
      setPresets((prev) => prev.map((p) => (p.id === preset.id ? { ...p, persona } : p)));
      toast.success(
        persona ? `已将叙述者人格「${persona.name}」绑定到「${preset.name}」` : '已解绑叙述者人格'
      );
    } catch (e) {
      toast.error('人格绑定失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBindingPersona(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4 text-brand-600" />
              文风预设
            </CardTitle>
            <CardDescription>
              选择内置预设或将&ldquo;基于样本&rdquo;生成的项目专属预设应用到当前项目
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleRecommend} disabled={loading}>
            <Wand2 className="h-3.5 w-3.5" />
            按题材智能推荐
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 智能推荐结果（需求 8）：确认后才切换 */}
        {recommendation && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-200 bg-brand-50/50 p-3">
            <div className="min-w-0 text-xs text-stone-700">
              <p className="font-medium">推荐文风：{recommendation.name}</p>
              <p className="text-[11px] text-stone-500">{recommendReason} · 点击「应用」后才会切换</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRecommendation(null)}
                disabled={selecting !== null}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setRecommendation(null);
                  void handleSelect(recommendation);
                }}
                disabled={selecting !== null}
              >
                {selecting !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                应用
              </Button>
            </div>
          </div>
        )}
        {presets.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">
            暂无预设，请先在样本上传区上传样本生成项目专属预设
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {presets.map((p) => {
              const isActive = p.id === currentStylePresetId;
              const isCustom = p.id.startsWith('style-proj-');
              const recommended = genre ? recommendPersonaForGenre(genre) : null;
              return (
              <div key={p.id} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelect(p)}
                  disabled={selecting !== null}
                  className={cn(
                    'group relative flex flex-col rounded-md border p-3 text-left transition-all',
                    isActive
                      ? 'border-brand-600 bg-brand-50/40 shadow-sm'
                      : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                  )}
                >
                  {/* 头部 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-800">
                        {p.name}
                      </p>
                      {isCustom && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                          <Sparkles className="h-2.5 w-2.5" />
                          项目专属
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>

                  {/* 参数 */}
                  <div className="mt-3 space-y-1 text-[11px] text-stone-600">
                    <div className="flex items-center gap-1">
                      <Eye className="h-3 w-3 text-stone-400" />
                      {PERSPECTIVE_LABEL[p.narrativePerspective]}
                    </div>
                    <div className="flex items-center gap-1">
                      <Gauge className="h-3 w-3 text-stone-400" />
                      {PACING_LABEL[p.pacing]} · {DENSITY_LABEL[p.descriptionDensity]}
                    </div>
                    <div className="flex items-center gap-1">
                      <MessageCircle className="h-3 w-3 text-stone-400" />
                      对话占比 {Math.round(p.dialogueRatio * 100)}%
                    </div>
                    {p.vocabularyProfile && (
                      <div className="flex items-center gap-1">
                        <span className="text-stone-400">≈</span>
                        句长 {p.vocabularyProfile.avgSentenceLength} 字
                      </div>
                    )}
                  </div>

                  {/* 样本提示 */}
                  {p.sampleText && (
                    <p className="mt-2 text-[10px] text-stone-400">
                      含 {countChineseWords(p.sampleText)} 字 Few-shot 样本
                    </p>
                  )}

                  {/* 词汇标签 */}
                  {p.vocabularyProfile?.commonPhrases &&
                    p.vocabularyProfile.commonPhrases.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.vocabularyProfile.commonPhrases.slice(0, 4).map((phrase) => (
                          <span
                            key={phrase}
                            className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600"
                          >
                            {phrase}
                          </span>
                        ))}
                      </div>
                    )}
                </button>

                {/* 叙述者人格绑定（仅项目专属预设） */}
                {isCustom && (
                  <div className="rounded-md border border-stone-200 bg-stone-50/70 p-2">
                    <div className="mb-1.5 flex items-center gap-1 text-[11px] text-stone-500">
                      <UserRound className="h-3 w-3" />
                      叙述者人格
                      {p.persona ? (
                        <span className="rounded bg-brand-100 px-1.5 py-0.5 font-medium text-brand-700">
                          {p.persona.name}
                        </span>
                      ) : (
                        <span className="text-stone-400">未绑定（可多选一）</span>
                      )}
                      {bindingPersona === p.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-stone-400" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={bindingPersona !== null}
                        onClick={() => handleBindPersona(p, null)}
                        className={cn(
                          'rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                          !p.persona
                            ? 'border-brand-400 bg-brand-50 text-brand-700'
                            : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                        )}
                      >
                        不绑定
                      </button>
                      {BUILTIN_PERSONAS.map((persona) => (
                        <button
                          key={persona.id}
                          type="button"
                          disabled={bindingPersona !== null}
                          title={persona.summary}
                          onClick={() => handleBindPersona(p, persona.id)}
                          className={cn(
                            'rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                            p.persona?.id === persona.id
                              ? 'border-brand-400 bg-brand-50 text-brand-700'
                              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                          )}
                        >
                          {persona.name}
                          {recommended?.id === persona.id && (
                            <span className="ml-0.5 text-[9px] text-amber-600">★</span>
                          )}
                        </button>
                      ))}
                    </div>
                    {p.persona && (
                      <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">
                        {p.persona.summary}
                      </p>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
