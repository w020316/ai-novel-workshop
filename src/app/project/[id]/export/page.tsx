'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getProject, listChapters, getWorldview, listCharacters, getOutline, listForeshadowings, listChapterSummaries, getConsistencyReport, listPlotThreads, getProjectStylePreset } from '@/lib/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, FileText, BookMarked, Archive, Upload } from 'lucide-react';
import { exportTxt, downloadTxt } from '@/lib/export/txt';
import { exportMarkdown, downloadMarkdown } from '@/lib/export/markdown';
import { exportEpub, downloadEpub } from '@/lib/export/epub';
import { createBackup, downloadBackup } from '@/lib/export/backup';
import { readBackupFile, restoreBackup } from '@/lib/import/restore';
import { toast } from 'sonner';
import type { NovelProject, Chapter } from '@/types';

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, chs] = await Promise.all([
      getProject(projectId),
      listChapters(projectId),
    ]);
    if (p) setProject(p);
    setChapters(chs);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const completedCount = chapters.filter((c) => c.status === 'completed').length;
  const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);

  const handleExportTxt = async () => {
    if (!project) return;
    setExporting('txt');
    try {
      const content = exportTxt({ project, chapters });
      downloadTxt(content, `${project.title}_全文`);
      toast.success('TXT 导出成功');
    } catch {
      toast.error('TXT 导出失败');
    }
    setExporting(null);
  };

  const handleExportMarkdown = async () => {
    if (!project) return;
    setExporting('md');
    try {
      const content = exportMarkdown({ project, chapters });
      downloadMarkdown(content, `${project.title}_全文`);
      toast.success('Markdown 导出成功');
    } catch {
      toast.error('Markdown 导出失败');
    }
    setExporting(null);
  };

  const handleExportEpub = async () => {
    if (!project) return;
    setExporting('epub');
    try {
      const blob = await exportEpub({ project, chapters });
      downloadEpub(blob, `${project.title}_全文`);
      toast.success('EPUB 导出成功');
    } catch {
      toast.error('EPUB 导出失败，请确认已安装 jszip 依赖');
    }
    setExporting(null);
  };

  const handleExportBackup = async () => {
    if (!project) return;
    setExporting('backup');
    try {
      const [wv, chars, ol, fs, sums, threads, style] = await Promise.all([
        getWorldview(projectId),
        listCharacters(projectId),
        getOutline(projectId),
        listForeshadowings(projectId),
        listChapterSummaries(projectId),
        listPlotThreads(projectId),
        getProjectStylePreset(projectId),
      ]);

      // 收集一致性报告
      const reports = [];
      for (const ch of chapters) {
        const r = await getConsistencyReport(ch.id).catch(() => null);
        if (r) reports.push(r);
      }

      const backup = await createBackup({
        project,
        worldview: wv ?? null,
        characters: chars,
        outline: ol ?? null,
        foreshadowings: fs,
        chapters,
        chapterSummaries: sums,
        consistencyReports: reports,
        plotThreads: threads,
        stylePreset: style ?? null,
      });
      downloadBackup(backup);
      toast.success('JSON 备份导出成功');
    } catch {
      toast.error('备份导出失败');
    }
    setExporting(null);
  };

  const handleImportBackup = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const data = await readBackupFile(file);
        const restoredId = await restoreBackup(data);
        toast.success(`项目 "${data.project.title}" 恢复成功`);
        // 跳转到恢复的项目
        window.location.href = `/project/${restoredId}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '恢复失败';
        toast.error(msg);
      }
      setImporting(false);
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">项目不存在</p>
      </div>
    );
  }

  const exportCards = [
    {
      key: 'txt',
      label: 'TXT 纯文本',
      desc: '简洁的纯文本格式，适合在各种设备上阅读',
      icon: FileText,
      action: handleExportTxt,
      disabled: completedCount === 0,
    },
    {
      key: 'md',
      label: 'Markdown',
      desc: '带目录和格式标记的 Markdown 文件',
      icon: BookMarked,
      action: handleExportMarkdown,
      disabled: completedCount === 0,
    },
    {
      key: 'epub',
      label: 'EPUB 电子书',
      desc: '标准的电子书格式，可在阅读器上打开',
      icon: Download,
      action: handleExportEpub,
      disabled: completedCount === 0,
    },
    {
      key: 'backup',
      label: 'JSON 完整备份',
      desc: '包含全部设定、章节和记忆的完整备份',
      icon: Archive,
      action: handleExportBackup,
      disabled: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-stone-800">导出中心</h1>
          <p className="text-sm text-stone-500">
            导出作品为多种格式 · {completedCount} 章已完成 · 共 {totalWords.toLocaleString()} 字
          </p>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-2xl font-bold text-stone-800">{completedCount}</p>
            <p className="text-xs text-stone-500">已完成章节</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-2xl font-bold text-stone-800">{totalWords.toLocaleString()}</p>
            <p className="text-xs text-stone-500">总字数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-2xl font-bold text-stone-800">{chapters.length}</p>
            <p className="text-xs text-stone-500">全部章节</p>
          </CardContent>
        </Card>
      </div>

      {/* 导出选项 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {exportCards.map((card) => {
          const Icon = card.icon;
          const isExporting = exporting === card.key;
          return (
            <Card key={card.key}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-brand-50 p-2">
                      <Icon className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-stone-800">{card.label}</p>
                      <p className="mt-1 text-xs text-stone-500">{card.desc}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    onClick={card.action}
                    disabled={card.disabled || isExporting}
                    className="w-full"
                    variant={card.key === 'backup' ? 'outline' : 'default'}
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        导出中...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        导出 {card.label}
                      </>
                    )}
                  </Button>
                  {card.disabled && (
                    <p className="mt-1 text-xs text-stone-400">需要先完成至少一章才能导出</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 导入恢复 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-brand-500" />
            从备份恢复
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-stone-600">
            选择之前导出的 JSON 备份文件，恢复完整的项目和设定数据。
            注意：恢复会创建新项目，不会覆盖现有数据。
          </p>
          <Button variant="outline" onClick={handleImportBackup} disabled={importing}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                恢复中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                选择备份文件恢复
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}