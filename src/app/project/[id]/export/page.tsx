'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getProject, listChapters, getWorldview, listCharacters, getOutline, listForeshadowings, listChapterSummaries, getConsistencyReport, listPlotThreads, getProjectStylePreset } from '@/lib/db/queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, FileText, BookMarked, Archive, Upload, ShieldCheck, CheckSquare, Image as ImageIcon } from 'lucide-react';
import { exportTxt, downloadTxt } from '@/lib/export/txt';
import { buildCollisionAppendix } from '@/lib/export/collision-appendix';
import { loadLiveRankedTitles } from '@/lib/rank/store';
import { exportMarkdown, downloadMarkdown } from '@/lib/export/markdown';
import { exportEpub, downloadEpub, buildCoverSvg } from '@/lib/export/epub';
import { createBackup, downloadBackup } from '@/lib/export/backup';
import { readBackupFile, restoreBackup } from '@/lib/import/restore';
import { toast } from 'sonner';
import type { NovelProject, Chapter } from '@/types';

const PLATFORM_TIPS: [string, string, string][] = [
  ['番茄小说', 'EPUB', '免费爽文平台，导入后标题+简介需符合平台规范，附带 AI 披露。'],
  ['起点中文网', 'DOCX/EPUB', '建议完整正文+作者简介+第一卷标题，人工过琵琶初审。'],
  ['晋江文学城', '同一文件', '女频平台，改动敏感/需改标题简介，拆书卡注意边界。'],
  ['知乎盐选', 'Markdown', '盐选专栏，短篇→长文；保留首段钩子与断章。'],
];

export default function ExportPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // 封面/元数据配置
  const [coverTitle, setCoverTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [p, chs] = await Promise.all([
      getProject(projectId),
      listChapters(projectId),
    ]);
    if (p) {
      setProject(p);
      setCoverTitle((prev) => prev || p.title);
      setDescription((prev) => prev || p.summary);
    }
    setChapters(chs);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const buildCollisionAppendixText = async (): Promise<string | undefined> => {
    if (chapters.length === 0) return undefined;
    try {
      const liveTitles = await loadLiveRankedTitles();
      return buildCollisionAppendix(
        chapters.map((c) => ({ id: String(c.chapterNo), title: c.title, content: c.content })),
        { liveTitles }
      );
    } catch {
      return undefined;
    }
  };

  const completedCount = chapters.filter((c) => c.status === 'completed').length;
  const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0);

  const handleExportTxt = async () => {
    if (!project) return;
    setExporting('txt');
    try {
      const appendix = await buildCollisionAppendixText();
      const content = exportTxt({ project, chapters, appendix });
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
      const appendix = await buildCollisionAppendixText();
      const content = exportMarkdown({ project, chapters, appendix });
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
      const blob = await exportEpub({
        project,
        chapters,
        meta: { coverTitle: coverTitle.trim(), author: author.trim(), description: description.trim() },
      });
      downloadEpub(blob, `${coverTitle.trim() || project.title}_全文`);
      toast.success('EPUB 导出成功（含封面与元数据）');
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

      {/* 版权 / 商用合规提示 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-brand-500" />
            导出前 · 版权与商用合规提示
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
            {[
              ['原创性 & 去重自查', '导出前先在「投稿合规体检」清零必改项，可用「扫描AI痕迹」复核文本。'],
              ['AI 内容披露', '番茄 / 起点 / 七猫等平台对 AI 生成文本的披露与声明要求不一，请按目标平台规则标注。'],
              ['拆书灵感边界', '拆书工坊只吸收「手法 / 结构 / 节奏」灵感，勿直接复制他人设定、人物与台词，避免侵权。'],
              ['素材授权', '外链或生成式封面 / 插图需确认授权来源与允许用途。'],
              ['商用 / 出版', '确定商用前请确认已满足平台《AI 创作协议》、版权归属与授权链完整。'],
              ['留存创作记录', '保留设定、拆书灵感卡等过程记录，便于应对「AI 制造」争议或原创性举证。'],
            ].map(([t, d]) => (
              <li key={t} className="flex items-start gap-2">
                <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>
                  <span className="font-medium text-stone-700">{t}</span>
                  <span className="block text-xs text-stone-500">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* 封面 / 元数据 / 多平台建议 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-brand-500" />
              EPUB 封面与元数据
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">书名（封面标题）</label>
              <input
                value={coverTitle}
                onChange={(e) => setCoverTitle(e.target.value)}
                className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                placeholder={project.title}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">作者（笔名）</label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="AI 小说制作工坊"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">作品简介（将写入 EPUB 元数据）</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[72px] w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="一段吸引读者的简介…"
              />
            </div>
            <p className="text-xs text-stone-400">导出 EPUB 自动生成文房风格 SVG 封面并带作者/简介元数据。</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">封面预览</CardTitle>
            </CardHeader>
            <CardContent>
              {/* 用 data URI 展示 SVG 封面预览（本地内联 SVG，非远程图片，无需 next/image 优化） */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(
                  buildCoverSvg(
                    coverTitle.trim() || project.title,
                    project.genre,
                    totalWords.toLocaleString(),
                    author.trim() || 'AI 小说制作工坊'
                  )
                )}`}
                alt="封面预览"
                className="mx-auto w-40 rounded shadow-sm"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">多平台分发建议</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {PLATFORM_TIPS.map(([p, fmt, tip]) => (
                <p key={p} className="text-xs text-stone-500">
                  <span className="font-medium text-stone-700">{p}</span>
                  <span className="ml-1 text-stone-400">({fmt})</span>：{tip}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
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