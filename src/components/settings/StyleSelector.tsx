'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { listStylePresets, updateProject } from '@/lib/db/queries';
import { cn, countChineseWords } from '@/lib/utils';
import type { StylePreset, NarrativePerspective, Pacing, DescriptionDensity } from '@/types';
import {
  Palette,
  Check,
  Loader2,
  Eye,
  MessageCircle,
  Gauge,
  Sparkles,
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

  const load = async () => {
    setLoading(true);
    try {
      const list = await listStylePresets();
      setPresets(list);
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
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-brand-600" />
          文风预设
        </CardTitle>
        <CardDescription>
          选择内置预设或将&ldquo;基于样本&rdquo;生成的项目专属预设应用到当前项目
        </CardDescription>
      </CardHeader>
      <CardContent>
        {presets.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">
            暂无预设，请先在样本上传区上传样本生成项目专属预设
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {presets.map((p) => {
              const isActive = p.id === currentStylePresetId;
              const isCustom = p.id.startsWith('style-proj-');
              return (
                <button
                  key={p.id}
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
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
