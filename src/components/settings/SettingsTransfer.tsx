'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Store, Upload, Download, Loader2 } from 'lucide-react';
import { getWorldview, saveWorldview, listCharacters, saveCharacter } from '@/lib/db/queries';
import {
  serializeSettingsBundle,
  parseSettingsBundle,
  importSettingsBundle,
} from '@/lib/settings-transfer';

interface SettingsTransferProps {
  projectId: string;
}

/** 跨书「宇宙设定」迁移：导出当前世界观+人物为 JSON，或从 JSON 导入 */
export function SettingsTransfer({ projectId }: SettingsTransferProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const handleExport = async () => {
    setBusy('export');
    try {
      const [wv, chars] = await Promise.all([getWorldview(projectId), listCharacters(projectId)]);
      const json = serializeSettingsBundle(wv, chars);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `novel-settings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('已导出设定包', {
        description: `世界观${wv ? 1 : 0} 项 · 人物 ${chars.length} 位`,
      });
    } catch (e) {
      toast.error('导出失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (file: File) => {
    setBusy('import');
    try {
      const text = await file.text();
      const bundle = parseSettingsBundle(text);
      const res = await importSettingsBundle(bundle, projectId, {
        saveWorldview: async (w) => { await saveWorldview(w); },
        saveCharacter: async (c) => { await saveCharacter(c); },
        resolveWorldview: async (id) => getWorldview(id),
      });
      toast.success('设定包导入完成', {
        description: `世界观${res.importedWorldview ? 1 : 0} 项（目标已有则不覆盖） · 人物 ${res.importedCharacters} 位`,
      });
    } catch (e) {
      toast.error('导入失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4 text-brand-500" />
          宇宙设定迁移
        </CardTitle>
        <CardDescription>
          把当前世界观 + 人物库导出为 JSON「设定包」，可在新项目导入，实现系列作 / 同世界观续写复用（导入只会新增，不覆盖目标已有内容）。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={busy !== null}>
          {busy === 'export' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
          导出设定包
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === 'import' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          导入设定包
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
          }}
        />
      </CardContent>
    </Card>
  );
}