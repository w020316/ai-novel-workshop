'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  getWorldview,
  saveWorldview,
} from '@/lib/db/queries';
import {
  generateWorldviewTemplate,
  isWorldviewEmpty,
} from '@/lib/worldview/template';
import { generateWorldviewWithLLM } from '@/lib/llm/generators/worldview';
import type { Genre, Worldview } from '@/types';
import { Sparkles, Wand2, Loader2, RotateCcw } from 'lucide-react';

interface WorldviewGeneratorProps {
  projectId: string;
  genre: Genre;
  title: string;
  summary: string;
  onGenerated?: () => void;
}

export function WorldviewGenerator({
  projectId,
  genre,
  title,
  summary,
  onGenerated,
}: WorldviewGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  const handleGenerate = async (forceOverwrite = false) => {
    setGenerating(true);
    try {
      const existing = await getWorldview(projectId);
      const exists = !isWorldviewEmpty(existing);
      setHasExisting(exists);

      if (exists && !forceOverwrite && !overwriteOpen) {
        // 第一次发现已有内容时弹出确认
        setOverwriteOpen(true);
        return;
      }

      // LLM 主生成，失败降级为本地题材模板（兼容离线/无配额场景），保证始终产出可保存内容
      let generated: Worldview;
      let usedTemplate = false;
      try {
        generated = await generateWorldviewWithLLM({ projectId, genre, title, summary });
      } catch {
        generated = generateWorldviewTemplate({ projectId, genre, title, summary });
        usedTemplate = true;
      }

      // 若已有数据，保留 id 与 locked 状态，仅替换内容
      if (existing) {
        generated.id = existing.id;
        generated.locked = existing.locked;
      }

      await saveWorldview(generated);
      toast.success('世界观已生成', {
        description: usedTemplate
          ? `LLM 暂不可用，已用题材模板生成 · 可在下方编辑器中修改`
          : `已根据「${title || genre}」与简介由 AI 生成 · 可在下方编辑器中修改`,
      });
      onGenerated?.();
      setOverwriteOpen(false);
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const cancelOverwrite = () => {
    setOverwriteOpen(false);
    setGenerating(false);
  };

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/50 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-brand-600" />
              AI 一键生成
            </CardTitle>
            <CardDescription className="mt-1">
              结合题材、书名与简介，由 AI 生成世界观（失败时自动回退题材模板）
            </CardDescription>
          </div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            LLM 生成 · 模板兜底
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-stone-200 bg-white p-3 text-xs text-stone-600">
          <p className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-brand-500" />
            <span>题材：</span>
            <span className="font-medium text-stone-800">{genre}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-brand-500" />
            <span>项目：</span>
            <span className="font-medium text-stone-800">{title || '（未命名）'}</span>
          </p>
          {summary && (
            <p className="mt-1 flex items-start gap-1.5">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-brand-500" />
              <span>简介：</span>
              <span className="line-clamp-2 text-stone-700">{summary}</span>
            </p>
          )}
        </div>

        {overwriteOpen ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">
              检测到已有世界观内容，确定要覆盖吗？
            </p>
            <p className="text-[11px] text-amber-700">
              此操作将替换世界架构、力量体系、地理、时代、势力与规则字段，但会保留锁定状态。
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleGenerate(true)}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                确认覆盖
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelOverwrite} disabled={generating}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              size="sm"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  {hasExisting ? '重新生成' : '一键生成世界观'}
                </>
              )}
            </Button>
            {hasExisting && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleGenerate(true)}
                disabled={generating}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                覆盖现有
              </Button>
            )}
          </div>
        )}

        <p className="text-[10px] text-stone-400">
          优先调用已配置的 LLM 基于简介生成个性化设定；当 LLM 不可用或未配置时，自动回退到基于题材的内置模板，确保一键生成始终可用。
        </p>
      </CardContent>
    </Card>
  );
}
