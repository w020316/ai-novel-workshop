'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { saveCharacter, listCharacters, markChapterNeedsRecheck, getProject } from '@/lib/db/queries';
import { suggestRelations, getRoleLabel } from '@/lib/character/template';
import { generateCharacterFromInspiration } from '@/lib/llm/generators/character';
import { countChineseWords } from '@/lib/utils';
import type { Character, CharacterRole, CharacterRelation } from '@/types';
import {
  Save,
  X,
  Plus,
  Trash2,
  Loader2,
  Link2,
  Sparkles,
  Wand2,
} from 'lucide-react';

interface CharacterFormProps {
  projectId: string;
  initial?: Character | null;
  onClose: () => void;
  onSaved: () => void;
}

const ROLE_OPTIONS: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];

const FIELD_CONFIG: Array<{
  key: keyof Pick<
    Character,
    | 'appearance'
    | 'personality'
    | 'catchphrase'
    | 'background'
    | 'motivation'
    | 'weakness'
    | 'growthArc'
    | 'speechStyle'
    | 'behaviorPattern'
  >;
  label: string;
  placeholder: string;
  required?: boolean;
  minHeight?: number;
}> = [
  {
    key: 'appearance',
    label: '外貌',
    placeholder: '身高、五官、衣着、气质…',
    minHeight: 80,
  },
  {
    key: 'personality',
    label: '性格',
    placeholder: '至少 10 字描述其核心性格…',
    required: true,
    minHeight: 80,
  },
  { key: 'catchphrase', label: '口头禅', placeholder: '标志性台词…', minHeight: 40 },
  {
    key: 'background',
    label: '背景',
    placeholder: '出身、经历、关键事件…',
    minHeight: 100,
  },
  { key: 'motivation', label: '核心执念', placeholder: '驱动其行动的根本目的…', minHeight: 60 },
  { key: 'weakness', label: '弱点', placeholder: '性格弱点或软肋…', minHeight: 60 },
  { key: 'growthArc', label: '成长线', placeholder: '从…到…的变化…', minHeight: 80 },
  { key: 'speechStyle', label: '说话风格', placeholder: '语气、用词习惯、句式…', minHeight: 60 },
  {
    key: 'behaviorPattern',
    label: '行为模式',
    placeholder: '遇事如何反应、决策习惯…',
    minHeight: 60,
  },
];

export function CharacterForm({ projectId, initial, onClose, onSaved }: CharacterFormProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<CharacterRole>(initial?.role ?? 'protagonist');
  const [fields, setFields] = useState<Record<string, string>>({
    appearance: initial?.appearance ?? '',
    personality: initial?.personality ?? '',
    catchphrase: initial?.catchphrase ?? '',
    background: initial?.background ?? '',
    motivation: initial?.motivation ?? '',
    weakness: initial?.weakness ?? '',
    growthArc: initial?.growthArc ?? '',
    speechStyle: initial?.speechStyle ?? '',
    behaviorPattern: initial?.behaviorPattern ?? '',
  });
  const [relationships, setRelationships] = useState<CharacterRelation[]>(
    initial?.relationships ?? []
  );
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [newRelationTarget, setNewRelationTarget] = useState('');
  const [newRelationDesc, setNewRelationDesc] = useState('');
  // 灵感一键生成（需求 7）：项目题材/简介 + 可折叠灵感输入区
  const [projectGenre, setProjectGenre] = useState('');
  const [projectSummary, setProjectSummary] = useState('');
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void listCharacters(projectId).then((list) => {
      setAllCharacters(list.filter((c) => c.id !== initial?.id));
    });
  }, [projectId, initial?.id]);

  useEffect(() => {
    void getProject(projectId).then((p) => {
      if (p) {
        setProjectGenre(p.genre);
        setProjectSummary(p.summary ?? '');
      }
    });
  }, [projectId]);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  /** 灵感一键生成：只填充表单草稿，不直接落库，用户可逐字段微调后再保存 */
  const handleInspirationFill = async () => {
    if (!projectSummary.trim() && !ideaText.trim()) {
      setIdeaOpen(true);
      toast.warning('项目简介为空，请先粘贴灵感文本再生成');
      return;
    }
    // 编辑已有人物：覆盖表单当前值前需确认
    if (initial && !confirm('将从灵感重新生成并覆盖表单当前内容，确定继续？')) return;
    setGenerating(true);
    try {
      const draft = await generateCharacterFromInspiration({
        genre: projectGenre || undefined,
        summary: projectSummary,
        ideaText,
        role,
      });
      if (draft.name) setName(draft.name);
      if (draft.role) setRole(draft.role);
      setFields((prev) => ({
        appearance: draft.appearance ?? prev.appearance,
        personality: draft.personality ?? prev.personality,
        catchphrase: draft.catchphrase ?? prev.catchphrase,
        background: draft.background ?? prev.background,
        motivation: draft.motivation ?? prev.motivation,
        weakness: draft.weakness ?? prev.weakness,
        growthArc: draft.growthArc ?? prev.growthArc,
        speechStyle: draft.speechStyle ?? prev.speechStyle,
        behaviorPattern: draft.behaviorPattern ?? prev.behaviorPattern,
      }));
      toast.success(
        draft.fromLLM
          ? '已生成人物草稿，可逐字段微调后保存'
          : 'LLM 暂不可用，已按灵感关键词生成草稿，可微调后保存'
      );
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGenerating(false);
    }
  };

  const addRelation = () => {
    if (!newRelationTarget) {
      toast.warning('请选择目标人物');
      return;
    }
    if (!newRelationDesc.trim()) {
      toast.warning('请输入关系描述');
      return;
    }
    const target = allCharacters.find((c) => c.id === newRelationTarget);
    if (!target) return;
    if (relationships.some((r) => r.targetId === target.id)) {
      toast.warning('已存在该人物的关系');
      return;
    }
    setRelationships((prev) => [
      ...prev,
      { targetId: target.id, targetName: target.name, relation: newRelationDesc.trim() },
    ]);
    setNewRelationTarget('');
    setNewRelationDesc('');
  };

  const removeRelation = (targetId: string) => {
    setRelationships((prev) => prev.filter((r) => r.targetId !== targetId));
  };

  const autoSuggestRelations = () => {
    if (allCharacters.length === 0) {
      toast.info('暂无其他人物可建立关系');
      return;
    }
    const suggested = suggestRelations(allCharacters, initial?.id ?? '');
    // 仅添加尚不存在的
    const existing = new Set(relationships.map((r) => r.targetId));
    const toAdd = suggested.filter((s) => !existing.has(s.targetId));
    if (toAdd.length === 0) {
      toast.info('已无可自动推荐的关系');
      return;
    }
    setRelationships((prev) => [...prev, ...toAdd]);
    toast.success(`已添加 ${toAdd.length} 段推荐关系`);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('请输入人物姓名');
      return;
    }
    if (fields.personality.trim().length < 10) {
      toast.error('性格描述至少 10 字');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const character: Character = {
        id: initial?.id ?? `char_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        name: name.trim(),
        role,
        appearance: fields.appearance.trim(),
        personality: fields.personality.trim(),
        catchphrase: fields.catchphrase.trim(),
        background: fields.background.trim(),
        motivation: fields.motivation.trim(),
        weakness: fields.weakness.trim(),
        growthArc: fields.growthArc.trim(),
        relationships,
        speechStyle: fields.speechStyle.trim(),
        behaviorPattern: fields.behaviorPattern.trim(),
        locked: initial?.locked ?? false,
        updatedAt: now,
      };
      await saveCharacter(character);

      // 若已锁定且有已完成章节，标记需重新校验
      if (character.locked) {
        await markChapterNeedsRecheck(projectId);
      }

      toast.success(initial ? '人物已更新' : '人物已创建', {
        description: `${character.name} · ${getRoleLabel(character.role)}`,
      });
      onSaved();
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const totalWords = Object.values(fields).reduce((sum, v) => sum + countChineseWords(v), 0);

  return (
    <Card className="border-brand-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              {initial ? `编辑：${initial.name}` : '新建人物'}
            </CardTitle>
            <CardDescription>
              完整的人物档案可显著提升长篇一致性 · 当前共 {totalWords} 字
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 灵感一键生成（需求 7）：填充表单草稿，可逐字段人工微调后再保存 */}
        <div className="space-y-2 rounded-md border border-brand-200 bg-brand-50/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-medium text-stone-700">
                <Wand2 className="h-3.5 w-3.5 text-brand-600" />
                从灵感一键生成
              </p>
              <p className="text-[11px] text-stone-500">
                {projectSummary.trim()
                  ? '将按项目简介生成各字段草稿，生成后可逐字段微调再保存'
                  : '项目简介为空：可展开灵感输入框粘贴灵感文本后再生成'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIdeaOpen((v) => !v)}
                disabled={generating || saving || initial?.locked}
              >
                {ideaOpen ? '收起灵感' : '灵感文本'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleInspirationFill()}
                disabled={generating || saving || initial?.locked}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                从灵感生成
              </Button>
            </div>
          </div>
          {ideaOpen && (
            <Textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="粘贴灵感卡或一段灵感描述：身份、能力、冲突、名场面…"
              style={{ minHeight: 60 }}
              disabled={generating || saving || initial?.locked}
            />
          )}
        </div>

        {/* 基础信息 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>姓名 *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：李云渊"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label>角色定位 *</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CharacterRole)}
              disabled={saving}
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
            <span className="text-xs text-stone-500">
              {initial?.locked ? '已锁定（需在列表中解锁后修改）' : '未锁定'}
            </span>
          </div>
        </div>

        {/* 详细字段 */}
        {FIELD_CONFIG.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="flex items-center gap-1">
              {f.label}
              {f.required && <span className="text-accent-600">*</span>}
            </Label>
            <Textarea
              value={fields[f.key]}
              onChange={(e) => updateField(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={saving || initial?.locked}
              style={{ minHeight: f.minHeight ?? 60 }}
              className={f.required && !fields[f.key].trim() ? 'border-amber-300' : ''}
            />
            <p className="text-right text-[10px] text-stone-400">
              {countChineseWords(fields[f.key])} 字
            </p>
          </div>
        ))}

        {/* 关系列表 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>人物关系</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={autoSuggestRelations}
              disabled={saving || allCharacters.length === 0}
            >
              <Sparkles className="h-3 w-3" />
              自动推荐
            </Button>
          </div>
          {relationships.length > 0 && (
            <ul className="space-y-1.5">
              {relationships.map((r) => (
                <li
                  key={r.targetId}
                  className="flex items-center justify-between gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-1.5">
                    <Link2 className="h-3 w-3 text-brand-500" />
                    <span className="font-medium text-stone-700">{r.targetName}</span>
                    <span className="text-stone-400">→</span>
                    <span className="text-stone-600">{r.relation}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRelation(r.targetId)}
                    disabled={saving}
                    className="text-stone-400 hover:text-accent-600"
                    aria-label="删除关系"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              value={newRelationTarget}
              onChange={(e) => setNewRelationTarget(e.target.value)}
              disabled={saving || allCharacters.length === 0}
              className="flex h-9 min-w-[140px] flex-1 rounded-md border border-stone-300 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">选择目标人物…</option>
              {allCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{getRoleLabel(c.role)}）
                </option>
              ))}
            </select>
            <Input
              value={newRelationDesc}
              onChange={(e) => setNewRelationDesc(e.target.value)}
              placeholder="如：师徒 / 恋人 / 仇敌"
              disabled={saving}
              className="h-9 min-w-[140px] flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRelation();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRelation}
              disabled={saving || !newRelationTarget || !newRelationDesc.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
              添加
            </Button>
          </div>
        </div>

        {/* 操作 */}
        <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || initial?.locked}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
