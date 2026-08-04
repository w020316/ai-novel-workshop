'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { saveStylePreset, updateProject, getProjectStylePreset } from '@/lib/db/queries';
import {
  analyzeTextStyle,
  sampleToPreset,
  validateSampleText,
  type StyleStats,
} from '@/lib/style/profile';
import { countChineseWords } from '@/lib/utils';
import type { StylePreset } from '@/types';
import {
  Upload,
  Loader2,
  FileText,
  Trash2,
  Sparkles,
  BarChart3,
} from 'lucide-react';

interface StyleSampleUploaderProps {
  projectId: string;
  onSaved: () => void;
}

export function StyleSampleUploader({ projectId, onSaved }: StyleSampleUploaderProps) {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<StyleStats | null>(null);
  const [existingPreset, setExistingPreset] = useState<StylePreset | null>(null);

  const loadExisting = async () => {
    try {
      const existing = await getProjectStylePreset(projectId);
      setExistingPreset(existing ?? null);
      if (existing?.sampleText) {
        setText(existing.sampleText);
        setStats(analyzeTextStyle(existing.sampleText));
      }
    } catch {
      // 静默失败，首次上传时无需展示
    }
  };

  useEffect(() => {
    void loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleAnalyze = () => {
    if (!text.trim()) {
      toast.warning('请先粘贴样本内容');
      return;
    }
    setAnalyzing(true);
    try {
      const result = analyzeTextStyle(text);
      setStats(result);
      toast.success('分析完成', {
        description: `${result.sentenceCount} 句 · 平均 ${result.avgSentenceLength} 字/句`,
      });
    } catch (e) {
      toast.error('分析失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    const validation = validateSampleText(text);
    if (!validation.ok) {
      toast.error(validation.message ?? '样本不足');
      return;
    }
    if (validation.message) {
      toast.warning(validation.message, {
        description: '可继续保存，但建议补充样本以提升准确性',
      });
    }

    setSaving(true);
    try {
      const preset = sampleToPreset({
        projectId,
        sampleText: text,
      });
      await saveStylePreset(preset);
      await updateProject(projectId, { stylePresetId: preset.id });
      setExistingPreset(preset);
      toast.success('项目专属文风已生成并应用', {
        description: `${preset.narrativePerspective} · ${preset.pacing} · 对话 ${Math.round(
          preset.dialogueRatio * 100
        )}%`,
      });
      onSaved();
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setText('');
    setStats(null);
  };

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/30 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-brand-600" />
              上传文风样本
            </CardTitle>
            <CardDescription>
              粘贴 3-5 章样本文本，系统将自动提取文风特征生成项目专属预设
            </CardDescription>
          </div>
          {existingPreset && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
              <Sparkles className="h-3 w-3" />
              已有专属预设
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>样本文本</Label>
            <span className="text-[10px] text-stone-400">
              {countChineseWords(text)} 字 · 建议 500+ 字
            </span>
          </div>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setStats(null);
            }}
            placeholder="粘贴 1-5 章正文文本…&#10;支持任意题材，最好与目标小说风格一致。"
            disabled={saving}
            style={{ minHeight: 200 }}
            className="font-serif"
          />
          {text && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-accent-600"
            >
              <Trash2 className="h-2.5 w-2.5" />
              清空
            </button>
          )}
        </div>

        {/* 操作 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing || !text.trim()}
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BarChart3 className="h-3.5 w-3.5" />
            )}
            分析
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !text.trim()}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            生成并应用
          </Button>
          <span className="text-[10px] text-stone-400">
            生成后将自动保存到项目专属预设并设为当前文风
          </span>
        </div>

        {/* 统计结果 */}
        {stats && (
          <div className="rounded-md border border-stone-200 bg-white p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-stone-700">
              <FileText className="h-3 w-3 text-brand-500" />
              文风分析结果
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
              <div>
                <p className="text-stone-400">句子数</p>
                <p className="font-medium text-stone-700">{stats.sentenceCount}</p>
              </div>
              <div>
                <p className="text-stone-400">平均句长</p>
                <p className="font-medium text-stone-700">{stats.avgSentenceLength} 字</p>
              </div>
              <div>
                <p className="text-stone-400">对话数</p>
                <p className="font-medium text-stone-700">{stats.dialogueCount}</p>
              </div>
              <div>
                <p className="text-stone-400">对话占比</p>
                <p className="font-medium text-stone-700">
                  {Math.round(stats.dialogueRatio * 100)}%
                </p>
              </div>
            </div>
            {stats.topTrigrams.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-stone-400">高频三字词组</p>
                <div className="flex flex-wrap gap-1">
                  {stats.topTrigrams.slice(0, 8).map((g) => (
                    <span
                      key={g}
                      className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
