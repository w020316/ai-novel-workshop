'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import {
  Loader2,
  BookOpen,
  Plus,
  Trash2,
  Power,
  GitBranch,
  Globe,
  Sparkles,
  PenLine,
  Link2,
  ClipboardPaste,
  Rocket,
  ExternalLink,
  Search,
  Upload,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  listSkills,
  ensureSeedSkills,
  toggleSkillEnabled,
  deleteSkill,
  saveSkill,
  exportSkillsJson,
  importSkillsJson,
} from '@/lib/skills/store';
import type { WritingSkill } from '@/types';

/** 技能发现目录：可导入技能的平台 / 站点 / 领域来源（供"复制链接导入"参考） */
const DISCOVERY_SOURCES: { name: string; desc: string; example: string; hint: string }[] = [
  {
    name: 'ant-design / 各开源写作 Agent 仓库',
    desc: '开源项目自带的 SKILL.md / 写作规范',
    example: 'https://github.com/<owner>/<repo>',
    hint: '粘贴 GitHub 仓库链接即可自动检索 SKILL.md 或 README',
  },
  {
    name: 'HuggingFace 写作 Space',
    desc: '社区写作 / 长文 Agent space 中的提示词',
    example: 'https://huggingface.co/spaces/<user>/<space>/blob/main/README.md',
    hint: '支持 .md / .markdown 直链',
  },
  {
    name: 'Antropic / OpenAI Agent Skills 库',
    desc: '各家公开的 Skill 定义仓库',
    example: 'https://github.com/anthropics/skills',
    hint: '多为 SKILL.md 结构，可直接导入',
  },
  {
    name: '文学写作课程 / 教程页',
    desc: '任意网站上的写作技法正文',
    example: 'https://example.com/写作教程',
    hint: '粘贴网页链接，自动提取标题与正文为技能指令',
  },
  {
    name: 'X / 博客 / 公众号长文',
    desc: '分享的文风与叙事方法论',
    example: 'https://…',
    hint: '复制原文文本后，可在下方"从剪贴板导入"',
  },
];

const CATEGORY_LABEL: Record<WritingSkill['category'], string> = {
  style: '风格',
  plot: '情节',
  hook: '钩子',
  review: '审稿',
  rewrite: '修改',
  outline: '大纲',
  other: '其它',
};

const CATEGORIES: (WritingSkill['category'] | 'all')[] = [
  'all', 'style', 'plot', 'hook', 'review', 'rewrite', 'outline', 'other',
];

function sourceChip(s: WritingSkill) {
  if (s.source === 'builtin') return { icon: <Sparkles className="h-3 w-3" />, text: '内置' };
  if (s.source === 'github') return { icon: <GitBranch className="h-3 w-3" />, text: s.sourceName || 'GitHub' };
  if (s.source === 'huggingface') return { icon: <PenLine className="h-3 w-3" />, text: s.sourceName || 'HuggingFace' };
  return { icon: <Globe className="h-3 w-3" />, text: s.sourceName || '自定义' };
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<WritingSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<WritingSkill['category'] | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  // 链接导入
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<{ name: string; instruction: string; category: WritingSkill['category']; description?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 剪贴板导入
  const [clipText, setClipText] = useState('');
  const [clipName, setClipName] = useState('');

  // 添加表单
  const [name, setName] = useState('');
  const [categoryNew, setCategoryNew] = useState<WritingSkill['category']>('style');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');

  const load = useCallback(async () => {
    try {
      await ensureSeedSkills();
      setSkills(await listSkills());
    } catch {
      toast.error('加载技能库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (s: WritingSkill) => {
    await toggleSkillEnabled(s.id, !s.enabled);
    setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
  };

  const handleDelete = async (s: WritingSkill) => {
    if (s.builtin) return;
    await deleteSkill(s.id);
    setSkills((prev) => prev.filter((x) => x.id !== s.id));
    toast.success('已删除技能');
  };

  const handleSubmit = async () => {
    if (!name.trim() || !instruction.trim()) {
      toast.warning('请填写技能名称与指令内容');
      return;
    }
    try {
      await saveSkill({
        name: name.trim(),
        category: categoryNew,
        source: 'custom',
        sourceName: sourceName.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        description: description.trim(),
        instruction: instruction.trim(),
        enabled: false,
      });
      toast.success('技能已保存（默认未启用，可在列表开启）');
      setName(''); setSourceName(''); setSourceUrl(''); setDescription(''); setInstruction('');
      setShowForm(false);
      setSkills(await listSkills());
    } catch {
      toast.error('保存失败');
    }
  };

  /** 从 URL 抓取并解析技能（服务端 fetch 绕过 CORS） */
  const handleImportUrl = async () => {
    const u = importUrl.trim();
    if (!/^https?:\/\//i.test(u)) {
      toast.warning('请输入有效的 http(s) 链接');
      return;
    }
    setImporting(true);
    setPreview(null);
    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(data.message || '导入失败');
        return;
      }
      setPreview({
        name: data.draft.name,
        instruction: data.draft.instruction,
        category: data.draft.category,
        description: data.draft.description,
      });
      toast.success('解析成功，预览后确认入库');
    } catch {
      toast.error('导入失败，请检查网络或链接');
    } finally {
      setImporting(false);
    }
  };

  /** 确认导入到技能库，fromLink 表示来源是链接 */
  const confirmImportInternal = async (enable: boolean) => {
    if (!preview) return;
    try {
      await saveSkill({
        name: preview.name,
        category: preview.category,
        source: 'web',
        sourceName: '链接导入',
        sourceUrl: importUrl.trim() || undefined,
        description: preview.description ?? '',
        instruction: preview.instruction,
        enabled: enable,
      });
      toast.success(enable ? '已导入并启用技能，后续生成的章节将遵循其指令' : '已导入技能（可在列表开启）');
      setPreview(null);
      setImportUrl('');
      setSkills(await listSkills());
    } catch {
      toast.error('保存失败');
    }
  };

  const confirmImport = () => void confirmImportInternal(false);
  const confirmImportEnabled = () => void confirmImportInternal(true);

  /** 从剪贴板文本导入 */
  const handleImportClip = async () => {
    const text = clipText.trim();
    const nm = clipName.trim();
    if (!text) {
      toast.warning('请粘贴技能原文文本');
      return;
    }
    try {
      await saveSkill({
        name: nm || text.split('\n')[0].replace(/^#+\s*/, '').slice(0, 30) || '粘贴导入技能',
        category: 'other',
        source: 'custom',
        sourceName: '剪贴板导入',
        description: '',
        instruction: text,
        enabled: false,
      });
      toast.success('已导入技能（可在列表开启）');
      setClipText('');
      setClipName('');
      setSkills(await listSkills());
    } catch {
      toast.error('保存失败');
    }
  };

  /** 导出全部技能为 JSON 文件 */
  const handleExportJson = async () => {
    try {
      const json = await exportSkillsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skills-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('已导出技能 JSON（可换设备导入）');
    } catch {
      toast.error('导出失败');
    }
  };

  /** 从 JSON 文件批量导入 */
  const handleImportJsonFile = async (file: File) => {
    try {
      const text = await file.text();
      const count = await importSkillsJson(text);
      setSkills(await listSkills());
      toast.success(`已导入 ${count} 个技能（默认未启用，可在列表开启）`);
    } catch {
      toast.error('JSON 导入失败，请检查文件格式');
    }
  };

  const visible = category === 'all' ? skills : skills.filter((s) => s.category === category);
  const enabledCount = skills.filter((s) => s.enabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-xl text-stone-800">
            <BookOpen className="h-5 w-5 text-brand-500" /> 写作技能库
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            从 GitHub / HuggingFace / 各类 skill 站点 / 自定义收集写作技能；启用后会自动注入到章节生成，塑造你的文风与叙事
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportJsonFile(f);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            导入 JSON
          </Button>
          <Button variant="outline" onClick={() => void handleExportJson()}>
            <Download className="mr-1.5 h-4 w-4" />
            导出 JSON
          </Button>
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1.5 h-4 w-4" />
            添加技能
          </Button>
        </div>
      </div>

      {/* 状态摘要 */}
      <Card className="border-brand-200 bg-brand-50/30">
        <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm text-stone-600">
          <span>共 {skills.length} 个技能</span>
          <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', enabledCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500')}>
            已启用 {enabledCount} 个
          </span>
          {enabledCount === 0 && <span className="text-xs text-stone-400">启用任意技能后，生成的章节将遵循其指令</span>}
        </CardContent>
      </Card>

      {/* 导入入口 */}
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
              <Link2 className="h-3.5 w-3.5" /> 从链接导入
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-stone-100 px-2 py-1 text-xs text-stone-500">
              <ClipboardPaste className="h-3.5 w-3.5" /> 从剪贴板导入
            </span>
            <span className="text-xs text-stone-400">支持 GitHub / HuggingFace / 任意 skill 站 / 教程网页</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="粘贴 GitHub 仓库 / SKILL.md / HuggingFace / 网页 链接…"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleImportUrl(); }}
            />
            <Button onClick={() => void handleImportUrl()} disabled={importing}>
              {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
              {importing ? '解析中…' : '解析导入'}
            </Button>
          </div>

          {/* 导入预览 */}
          {preview && (
            <div className="rounded-md border border-brand-200 bg-brand-50/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-stone-800">解析到技能：{preview.name}</p>
                  <p className="text-xs text-stone-500">{CATEGORY_LABEL[preview.category]}{preview.description ? ` · ${preview.description}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>取消</Button>
                  <Button size="sm" variant="outline" onClick={confirmImport}>
                    <Rocket className="mr-1.5 h-3.5 w-3.5" /> 仅导入
                  </Button>
                  <Button size="sm" onClick={confirmImportEnabled}>
                    <Power className="mr-1.5 h-3.5 w-3.5" /> 导入并启用
                  </Button>
                </div>
              </div>
              <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded bg-white/60 p-2 font-mono text-[11px] text-stone-500">
                {preview.instruction}
              </p>
            </div>
          )}

          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 text-xs font-medium text-stone-500">从剪贴板粘贴技能原文（适合无直链的网页 / 长文）</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input value={clipName} onChange={(e) => setClipName(e.target.value)} placeholder="技能名称（留空自动取首行）" />
              <Input value={clipText} onChange={(e) => setClipText(e.target.value)} placeholder="粘贴技能指令原文…" />
              <Button variant="outline" size="sm" onClick={() => void handleImportClip()}>导入</Button>
            </div>
          </div>

          {/* 技能发现目录 */}
          <div className="border-t border-stone-100 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-500">
              <ExternalLink className="h-3.5 w-3.5" /> 技能发现目录 · 可从这些地方找到写作技能再粘贴导入
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DISCOVERY_SOURCES.map((d) => (
                <div key={d.name} className="rounded-md border border-stone-100 bg-white p-2.5">
                  <p className="text-xs font-medium text-stone-700">{d.name}</p>
                  <p className="text-[11px] text-stone-500">{d.desc}</p>
                  <p className="mt-1 font-mono text-[10px] text-brand-600">{d.example}</p>
                  <p className="mt-0.5 text-[10px] text-stone-400">{d.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 添加表单 */}
      {showForm && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="skill-name">技能名称 *</Label>
                <Input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：更克制的人称叙述" />
              </div>
              <div className="space-y-1">
                <Label>适用环节</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(Object.keys(CATEGORY_LABEL) as WritingSkill['category'][]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategoryNew(c)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs transition-colors',
                        categoryNew === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-300 text-stone-500 hover:border-brand-400'
                      )}
                    >
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="skill-source">来源名称（可选）</Label>
                <Input id="skill-source" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="如：GitHub 某仓库 / 某 skill 站" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="skill-url">来源链接（可选）</Label>
                <Input id="skill-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="skill-desc">一句话说明（可选）</Label>
              <Input id="skill-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个技能能带来的效果" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="skill-instruction">指令内容 *（粘贴或填写该技能的写法要求）</Label>
              <Textarea
                id="skill-instruction"
                rows={6}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={'示例：\n【写法要求】\n避免滥用AI高频词；用具体动作与口语细节让文字像一个人说的话……'}
              />
              <p className="text-xs text-stone-400">启用后，这段指令会随章节生成一起注入给模型</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleSubmit}>保存技能</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs transition-colors',
              category === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-stone-200 bg-white text-stone-500 hover:border-brand-300'
            )}
          >
            {c === 'all' ? '全部' : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {/* 技能列表 */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-stone-400">
            <BookOpen className="mb-3 h-10 w-10 text-stone-200" />
            <p className="text-sm">暂无该分类技能</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => {
            const chip = sourceChip(s);
            return (
              <Card key={s.id} className={cn('transition-colors', s.enabled && 'border-emerald-300')}>
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stone-800">{s.name}</span>
                        <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">
                          {CATEGORY_LABEL[s.category]}
                        </span>
                        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]',
                          s.source === 'builtin' ? 'bg-brand-50 text-brand-600' : 'bg-stone-100 text-stone-500')}>
                          {chip.icon} {chip.text}
                        </span>
                        {s.enabled && (
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            注入中
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-stone-500">{s.description}</p>
                      <p className="mt-1.5 line-clamp-2 rounded-md bg-stone-50 p-2 font-mono text-[11px] text-stone-500">
                        {s.instruction}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={s.enabled ? 'outline' : 'default'}
                        onClick={() => handleToggle(s)}
                      >
                        <Power className="mr-1.5 h-3.5 w-3.5" />
                        {s.enabled ? '停用' : '启用'}
                      </Button>
                      {!s.builtin && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(s)} aria-label="删除">
                          <Trash2 className="h-3.5 w-3.5 text-stone-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}