'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  getWorldview,
  saveWorldview,
  markChapterNeedsRecheck,
} from '@/lib/db/queries';
import { normalizeRules } from '@/lib/worldview/template';
import { countChineseWords, formatTime } from '@/lib/utils';
import type { Worldview } from '@/types';
import {
  Lock,
  Unlock,
  Save,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface WorldviewEditorProps {
  projectId: string;
}

const FIELD_CONFIG: Array<{
  key: keyof Pick<Worldview, 'worldStructure' | 'powerSystem' | 'geography' | 'era' | 'factions'>;
  label: string;
  placeholder: string;
  required?: boolean;
  minHeight?: number;
}> = [
  {
    key: 'worldStructure',
    label: '世界架构',
    placeholder: '描述世界的整体结构与运行法则…',
    required: true,
    minHeight: 120,
  },
  {
    key: 'powerSystem',
    label: '力量体系',
    placeholder: '修炼境界 / 异能系统 / 科技分级 / 权谋通道等…',
    minHeight: 100,
  },
  {
    key: 'geography',
    label: '地理设定',
    placeholder: '主要区域、地图、场景分布…',
    minHeight: 100,
  },
  {
    key: 'era',
    label: '时代背景',
    placeholder: '故事发生的时代与年代…',
    minHeight: 60,
  },
  {
    key: 'factions',
    label: '势力划分',
    placeholder: '主要势力、利益集团、阵营关系…',
    minHeight: 100,
  },
];

export function WorldviewEditor({ projectId }: WorldviewEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wv, setWv] = useState<Worldview | null>(null);
  const [newRule, setNewRule] = useState('');
  const [dirty, setDirty] = useState(false);

  // 字段值本地缓存（编辑中状态）
  const [fields, setFields] = useState<Record<string, string>>({
    worldStructure: '',
    powerSystem: '',
    geography: '',
    era: '',
    factions: '',
  });
  const [rules, setRules] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const existing = await getWorldview(projectId);
      setWv(existing ?? null);
      setFields({
        worldStructure: existing?.worldStructure ?? '',
        powerSystem: existing?.powerSystem ?? '',
        geography: existing?.geography ?? '',
        era: existing?.era ?? '',
        factions: existing?.factions ?? '',
      });
      setRules(existing?.rules ?? []);
      setDirty(false);
    } catch (e) {
      toast.error('加载世界观失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateField = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    if (rules.includes(trimmed)) {
      toast.warning('该规则已存在');
      return;
    }
    setRules((prev) => [...prev, trimmed]);
    setNewRule('');
    setDirty(true);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const toggleLock = async () => {
    if (!wv) return;
    const next = !wv.locked;
    try {
      const updated: Worldview = { ...wv, locked: next, rules: normalizeRules(rules) };
      await saveWorldview(updated);
      setWv(updated);
      toast.success(next ? '世界观已锁定' : '世界观已解锁', {
        description: next ? '后续生成将强制校验一致性' : '可自由编辑',
      });
    } catch (e) {
      toast.error('切换锁定状态失败', {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleSave = async () => {
    // 校验必填
    if (!fields.worldStructure.trim()) {
      toast.error('世界架构为必填项');
      return;
    }
    if (fields.worldStructure.trim().length < 10) {
      toast.error('世界架构至少 10 字');
      return;
    }

    setSaving(true);
    try {
      const wasLocked = wv?.locked === true;
      const normalizedRules = normalizeRules(rules);
      const now = Date.now();
      const next: Worldview = {
        id: wv?.id ?? `wv_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        worldStructure: fields.worldStructure.trim(),
        powerSystem: fields.powerSystem.trim(),
        geography: fields.geography.trim(),
        era: fields.era.trim(),
        factions: fields.factions.trim(),
        rules: normalizedRules,
        locked: wasLocked, // 保存时不改变锁定状态
        updatedAt: now,
      };
      await saveWorldview(next);

      // 若已锁定且有已完成章节，标记需重新校验
      if (wasLocked) {
        const recheckCount = await markChapterNeedsRecheck(projectId);
        if (recheckCount > 0) {
          toast.info(`已标记 ${recheckCount} 章需重新校验一致性`, {
            description: '下次进入工作台时将自动触发校验',
          });
        }
      }

      setWv(next);
      setRules(normalizedRules);
      setDirty(false);
      toast.success('世界观已保存');
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        <span className="ml-2 text-sm text-stone-500">加载世界观…</span>
      </div>
    );
  }

  const locked = wv?.locked === true;
  const totalWords = Object.values(fields).reduce((sum, v) => sum + countChineseWords(v), 0);

  return (
    <div className="space-y-4">
      {/* 头部状态条 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-center gap-2">
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                <Lock className="h-3 w-3" />
                已锁定
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                <Unlock className="h-3 w-3" />
                未锁定
              </span>
            )}
            <span className="text-xs text-stone-500">
              共 {totalWords} 字 · {rules.length} 条规则
            </span>
            {wv?.updatedAt && (
              <span className="text-xs text-stone-400">
                · 更新于 {formatTime(wv.updatedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={locked ? 'outline' : 'default'}
              size="sm"
              onClick={toggleLock}
              disabled={!wv}
            >
              {locked ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  解锁
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  锁定
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty || locked}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              保存
            </Button>
          </div>
        </CardContent>
      </Card>

      {locked && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">世界观已锁定</p>
            <p className="mt-0.5 text-amber-700">
              如需修改，请先点击&ldquo;解锁&rdquo;。解锁并保存后，已生成章节将自动标记为需要重新校验。
            </p>
          </div>
        </div>
      )}

      {/* 表单主体 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">世界观设定</CardTitle>
          <CardDescription>
            填写世界规则、势力、地理与时代背景。锁定后将在生成章节时强制校验一致性。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
                disabled={locked || saving}
                style={{ minHeight: f.minHeight ?? 80 }}
                className={f.required && !fields[f.key].trim() ? 'border-amber-300' : ''}
              />
              <p className="text-right text-[10px] text-stone-400">
                {countChineseWords(fields[f.key])} 字
              </p>
            </div>
          ))}

          {/* 核心规则（数组） */}
          <div className="space-y-2">
            <Label>核心规则（强制约束）</Label>
            <p className="text-xs text-stone-500">
              如&ldquo;修为不可越阶挑战&rdquo;、&ldquo;凡人不可飞升&rdquo;等不可违反的世界法则
            </p>
            <div className="flex gap-2">
              <Input
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                placeholder="输入一条规则后按回车或点击添加…"
                disabled={locked || saving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addRule();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRule}
                disabled={locked || saving || !newRule.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            {rules.length > 0 && (
              <ul className="space-y-1.5">
                {rules.map((rule, i) => (
                  <li
                    key={`${rule}-${i}`}
                    className="flex items-start justify-between gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                  >
                    <span className="flex items-start gap-2 text-stone-700">
                      <span className="mt-0.5 font-mono text-xs text-stone-400">{i + 1}.</span>
                      <span>{rule}</span>
                    </span>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => removeRule(i)}
                        disabled={saving}
                        className="text-stone-400 transition-colors hover:text-accent-600"
                        aria-label="删除规则"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {dirty && !locked && (
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <AlertCircle className="h-3.5 w-3.5" />
          有未保存的修改
        </div>
      )}
      {!dirty && wv && (
        <div className="flex items-center gap-2 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          已保存
        </div>
      )}
    </div>
  );
}
