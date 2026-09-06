'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useProjectStore } from '@/lib/store/project-store';
import { polishSummary } from '@/lib/summary/polish';
import { Sparkles, Save, Loader2, PenLine } from 'lucide-react';

interface SummaryPolisherProps {
  projectId: string;
  genre: string;
  title: string;
  /** 当前项目简介（作为编辑区初始值） */
  initialSummary: string;
}

/**
 * 一句话简介编辑区 + AI 润色（需求 6 前半）。
 * AI 结果仅填入输入框，由用户确认后手动保存（人工可控）。
 */
export function SummaryPolisher({
  projectId,
  genre,
  title,
  initialSummary,
}: SummaryPolisherProps) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const [summary, setSummary] = useState(initialSummary);
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 项目简介在其他入口被更新（保存后 store 刷新）时同步
  useEffect(() => {
    setSummary(initialSummary);
    setDirty(false);
  }, [initialSummary]);

  const handlePolish = async () => {
    if (polishing) return;
    if (summary.trim().length < 4) {
      toast.warning('简介过短，无需润色', { description: '请先输入至少 4 个字的简介' });
      return;
    }
    setPolishing(true);
    try {
      const { summary: polished, fromLLM } = await polishSummary({ genre, title, summary });
      setSummary(polished); // 仅填入输入框，不直接保存
      setDirty(true);
      if (fromLLM) {
        toast.success('AI 润色完成', {
          description: '结果已填入输入框，确认无误后请点击「保存简介」',
        });
      } else {
        toast.info('AI 暂不可用，已做本地清理', {
          description: '结果已填入输入框，确认无误后请点击「保存简介」',
        });
      }
    } catch (e) {
      toast.error('润色简介失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPolishing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProject(projectId, { summary: summary.trim() });
      toast.success('项目简介已保存');
    } catch (e) {
      toast.error('保存简介失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/50 to-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4 text-brand-600" />
          一句话简介
        </CardTitle>
        <CardDescription className="mt-1">
          简介是一键生成与 AI 完善的关键输入，可让 AI 以网文编辑口吻帮你润色得更抓人。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>项目简介</Label>
          <Textarea
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setDirty(true);
            }}
            placeholder="用一两句话写清金手指、核心冲突与钩子…"
            disabled={saving}
            style={{ minHeight: 90 }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handlePolish} disabled={polishing || saving}>
            {polishing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                润色中…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                AI 润色简介
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving || polishing || !dirty}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            保存简介
          </Button>
        </div>
        <p className="text-[10px] text-stone-400">
          AI 润色结果会先填入输入框，由你确认后再保存；LLM 不可用时自动降级为本地清理（压缩空白、截断 200 字）。
        </p>
      </CardContent>
    </Card>
  );
}
