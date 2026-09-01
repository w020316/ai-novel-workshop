'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { saveCharacter } from '@/lib/db/queries';
import { generateCharacterTemplate, getRoleLabel } from '@/lib/character/template';
import { generateCharacterWithLLM } from '@/lib/llm/generators/character';
import type { Character, CharacterRole } from '@/types';
import { Wand2, Loader2 } from 'lucide-react';

interface CharacterGeneratorProps {
  projectId: string;
  onGenerated: (c: Character) => void;
}

const ROLE_OPTIONS: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];

export function CharacterGenerator({ projectId, onGenerated }: CharacterGeneratorProps) {
  const [keywords, setKeywords] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CharacterRole>('protagonist');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!keywords.trim() && !name.trim()) {
      toast.warning('请至少输入姓名或关键词');
      return;
    }
    setGenerating(true);
    try {
      // LLM 主生成，失败降级为本地角色模板（兼容离线/无配额场景），保证始终产出可保存档案
      let generated: Character;
      let usedTemplate = false;
      try {
        generated = await generateCharacterWithLLM({
          projectId,
          keywords: keywords.trim(),
          name: name.trim(),
          role,
        });
      } catch {
        generated = generateCharacterTemplate({
          projectId,
          keywords: keywords.trim(),
          name: name.trim(),
          role,
        });
        usedTemplate = true;
      }

      await saveCharacter(generated);
      toast.success('人物档案已生成', {
        description: usedTemplate
          ? `${generated.name} · LLM 暂不可用，已用模板生成`
          : `${generated.name} · 由 AI 生成`,
      });
      onGenerated(generated);

      // 清空输入
      setKeywords('');
      setName('');
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const handlePreviewKeywords = () => {
    if (!keywords.trim()) {
      toast.info('请输入关键词查看预览');
      return;
    }
    // 即时预览（不保存）
    const preview = generateCharacterTemplate({
      projectId,
      keywords: keywords.trim(),
      name: name.trim() || '预览',
      role,
    });
    toast.info(`预览生成（未保存）：${preview.name}`, {
      description: preview.personality.slice(0, 60) + '…',
      duration: 6000,
    });
  };

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/50 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-brand-600" />
              AI 关键词生成
            </CardTitle>
            <CardDescription>
              输入关键词与角色定位，调用 AI 一键生成完整人物档案（失败时自动回退模板）
            </CardDescription>
          </div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            LLM 生成 · 模板兜底
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>姓名（可选）</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="留空则自动命名"
              disabled={generating}
            />
          </div>
          <div className="space-y-1.5">
            <Label>角色定位</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CharacterRole)}
              disabled={generating}
              className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {getRoleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviewKeywords}
              disabled={generating || !keywords.trim()}
              className="w-full"
            >
              预览
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>关键词</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="如：冷酷剑修、孤独、复仇、天赋异禀…"
            disabled={generating}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <p className="text-[11px] text-stone-500">
            支持空格、逗号、顿号分隔。关键词将影响外貌、性格、背景与成长线生成。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={generating} size="sm">
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                生成中…
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" />
                生成人物
              </>
            )}
          </Button>
          <span className="text-[10px] text-stone-400">
            生成后将自动保存到人物列表，可在表单中继续编辑
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
