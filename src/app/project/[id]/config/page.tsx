'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/store/project-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { toast } from 'sonner';
import { Archive, Trash2, Loader2 } from 'lucide-react';
import { db } from '@/lib/db/schema';
import { PLATFORM_CHAPTER_STANDARDS } from '@/lib/outline/volume-plan';

export default function ProjectConfigPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const { currentProject, updateProject, archiveProject, deleteProject } = useProjectStore();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(currentProject?.title ?? '');
  const [summary, setSummary] = useState(currentProject?.summary ?? '');
  const [targetWords, setTargetWords] = useState(currentProject?.targetWords ?? 300000);
  const [chapterWords, setChapterWords] = useState(currentProject?.chapterWords ?? 2500);

  if (!currentProject) return null;

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await updateProject(projectId, { title, summary, targetWords, chapterWords });
      toast.success('项目信息已保存');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('确认归档此项目？归档后可在项目列表显示已归档项中恢复。')) return;
    await archiveProject(projectId);
    toast.success('项目已归档');
    router.push('/');
  };

  const handleDelete = async () => {
    if (!confirm('确认永久删除此项目？此操作不可撤销，所有章节与设定将被清除。')) return;
    setDeleting(true);
    try {
      await deleteProject(projectId);
      toast.success('项目已删除');
      router.push('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
      setDeleting(false);
    }
  };

  const handleClearAllData = async () => {
    if (!confirm('确认清空浏览器中所有本地数据（所有项目）？此操作不可撤销。')) return;
    await db.delete();
    toast.success('所有本地数据已清空');
    router.push('/');
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-serif text-xl font-bold text-brand-800">项目配置</h1>
        <p className="mt-1 text-sm text-stone-500">编辑项目信息、归档或删除项目</p>
      </header>

      {/* 基础信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">基础信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">标题</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="summary">简介</Label>
            <Input
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="targetWords">目标字数</Label>
            <Input
              id="targetWords"
              type="number"
              step={10000}
              value={targetWords}
              onChange={(e) => setTargetWords(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chapterWords">每章字数（按平台爆款标准）</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                id="chapterWords"
                type="number"
                step={500}
                min={1000}
                max={10000}
                className="max-w-40"
                value={chapterWords}
                onChange={(e) => setChapterWords(Number(e.target.value))}
              />
              {PLATFORM_CHAPTER_STANDARDS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.hint}
                  onClick={() => setChapterWords(p.value)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    chapterWords === p.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-stone-300 bg-white text-stone-600 hover:border-brand-400 hover:text-brand-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              约 {Math.max(1, Math.round(targetWords / (chapterWords || 2500)))} 章 · 档位参考主流平台热门作品，AI 生成正文时按该字数控制每章篇幅
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中…
                </>
              ) : (
                '保存'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 危险操作 */}
      <Card className="border-accent-200">
        <CardHeader>
          <CardTitle className="text-base text-accent-700">危险操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">归档项目</p>
              <p className="text-xs text-stone-500">归档后不在主列表显示，可恢复</p>
            </div>
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="mr-2 h-4 w-4" />
              归档
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">永久删除项目</p>
              <p className="text-xs text-stone-500">删除后无法恢复，所有数据将被清除</p>
            </div>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中…
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 全局数据 */}
      <Card className="border-stone-300">
        <CardHeader>
          <CardTitle className="text-base">本地数据管理</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-stone-800">清空所有本地数据</p>
              <p className="text-xs text-stone-500">删除浏览器中所有项目与设定（不可恢复）</p>
            </div>
            <Button variant="destructive" onClick={handleClearAllData}>
              <Trash2 className="mr-2 h-4 w-4" />
              清空
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
