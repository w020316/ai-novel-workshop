'use client';

// ============================================================================
// AI 一键生成全套人物（全流程优先）：提案 → 勾选/微调 → 批量生成档案
// 人工干预被压缩为「勾选与改词」，其余（命名、定位、关键词、完整档案）均由 AI 完成。
// ============================================================================
import { useState } from 'react';
import { toast } from 'sonner';
import { Users, Loader2, Wand2, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { saveCharacter, getProject, getWorldview } from '@/lib/db/queries';
import { generateCastProposal, type CastMemberProposal } from '@/lib/character/cast';
import { generateCharacterTemplate, getRoleLabel } from '@/lib/character/template';
import { generateCharacterWithLLM } from '@/lib/llm/generators/character';
import { getRoleBadgeClass } from '@/lib/character/template';
import type { Character, Genre } from '@/types';
import { cn } from '@/lib/utils';

interface CastGeneratorProps {
  projectId: string;
  onGenerated: (c: Character) => void;
}

export function CastGenerator({ projectId, onGenerated }: CastGeneratorProps) {
  const [proposals, setProposals] = useState<CastMemberProposal[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [proposing, setProposing] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [usedFallback, setUsedFallback] = useState(false);

  const toggle = (i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const patchProposal = (i: number, patch: Partial<CastMemberProposal>) => {
    setProposals((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const handlePropose = async () => {
    setProposing(true);
    try {
      const project = await getProject(projectId);
      let worldviewSummary = '';
      try {
        const wv = await getWorldview(projectId);
        if (wv) {
          worldviewSummary = [wv.worldStructure, wv.powerSystem, wv.factions]
            .filter(Boolean)
            .join('；');
        }
      } catch {
        /* 世界观缺失不阻断提案 */
      }
      const { proposals: list, usedFallback: fb } = await generateCastProposal({
        genre: project?.genre as Genre | undefined,
        summary: project?.summary,
        worldviewSummary,
      });
      setProposals(list);
      setChecked(list.map(() => true));
      setUsedFallback(fb);
      if (fb) {
        toast.info('AI 暂不可用，已按题材生成提案', {
          description: '可修改关键词后再批量生成，或重新生成提案',
        });
      }
    } catch (e) {
      toast.error('提案生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setProposing(false);
    }
  };

  const handleBatchGenerate = async () => {
    const selected = proposals.filter((_, i) => checked[i]);
    if (selected.length === 0) {
      toast.warning('请至少勾选一位人物');
      return;
    }
    setBatchGenerating(true);
    setProgress({ done: 0, total: selected.length });
    try {
      const project = await getProject(projectId);
      let usedTemplate = false;
      for (let i = 0; i < selected.length; i++) {
        const p = selected[i];
        let character: Character;
        try {
          character = await generateCharacterWithLLM({
            projectId,
            keywords: p.keywords,
            name: p.name,
            role: p.role,
            genre: project?.genre,
          });
        } catch {
          character = generateCharacterTemplate({
            projectId,
            keywords: p.keywords,
            name: p.name,
            role: p.role,
          });
          usedTemplate = true;
        }
        await saveCharacter(character);
        onGenerated(character);
        setProgress({ done: i + 1, total: selected.length });
      }
      toast.success(`已生成 ${selected.length} 位人物档案`, {
        description: usedTemplate ? '部分人物 LLM 暂不可用，已用模板兜底' : '全部由 AI 生成，可在列表中继续编辑',
      });
      setProposals([]);
      setChecked([]);
    } catch (e) {
      toast.error('批量生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBatchGenerating(false);
    }
  };

  const selectedCount = checked.filter(Boolean).length;

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/60 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-brand-600" />
              AI 一键生成全套人物
            </CardTitle>
            <CardDescription>
              AI 按题材与世界观设计人物团（姓名、定位、关键词全自动），勾选后批量生成完整档案
            </CardDescription>
          </div>
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            推荐 · 全流程 AI
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 第一步：生成提案 */}
        {proposals.length === 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handlePropose} disabled={proposing} size="sm">
              {proposing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  AI 设计人物团中…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  生成人物团提案
                </>
              )}
            </Button>
            <span className="text-[10px] text-stone-400">
              按项目题材 / 简介 / 世界观一次性产出 4-6 位人物提案，可重新生成
            </span>
          </div>
        )}

        {/* 第二步：勾选与微调 */}
        {proposals.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <span>
                  已勾选 {selectedCount} / {proposals.length} 位 · 可修改姓名与关键词后再生成
                </span>
                {usedFallback && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                    题材启发式提案
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePropose}
                disabled={proposing || batchGenerating}
              >
                {proposing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                重新生成提案
              </Button>
            </div>

            <div className="space-y-2">
              {proposals.map((p, i) => (
                <div
                  key={`${p.role}-${i}`}
                  className={cn(
                    'rounded-md border p-3 transition-colors',
                    checked[i] ? 'border-brand-300 bg-brand-50/40' : 'border-stone-200 bg-white'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      disabled={batchGenerating}
                      aria-label={checked[i] ? '取消勾选' : '勾选'}
                      className={cn(
                        'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        checked[i]
                          ? 'border-brand-500 bg-brand-600 text-white'
                          : 'border-stone-300 bg-white'
                      )}
                    >
                      {checked[i] && <Check className="h-3 w-3" />}
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={p.name}
                          onChange={(e) => patchProposal(i, { name: e.target.value })}
                          placeholder="姓名（留空由 AI 命名）"
                          className="h-8 max-w-40"
                          disabled={batchGenerating}
                        />
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                            getRoleBadgeClass(p.role)
                          )}
                        >
                          {getRoleLabel(p.role)}
                        </span>
                      </div>
                      <Input
                        value={p.keywords}
                        onChange={(e) => patchProposal(i, { keywords: e.target.value })}
                        placeholder="关键词"
                        className="h-8"
                        disabled={batchGenerating}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleBatchGenerate} disabled={batchGenerating || selectedCount === 0} size="sm">
                {batchGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    生成中 {progress.done}/{progress.total}…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3.5 w-3.5" />
                    批量生成{selectedCount > 0 ? ` ${selectedCount} 位` : ''}档案
                  </>
                )}
              </Button>
              <span className="text-[10px] text-stone-400">
                逐位调用 AI 生成完整档案（外貌/性格/背景/成长线），失败自动模板兜底
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
