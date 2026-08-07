'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Wand2, RotateCcw } from 'lucide-react';

interface ChapterEditorProps {
  content: string;
  onChange: (content: string) => void;
  onRewrite: (selection: { start: number; end: number; instruction: string }) => void;
  disabled?: boolean;
}

export function ChapterEditor({ content, onChange, onRewrite, disabled }: ChapterEditorProps) {
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const [showRewrite, setShowRewrite] = useState(false);

  const handleSelect = useCallback(() => {
    const textarea = document.querySelector('#chapter-content') as HTMLTextAreaElement;
    if (textarea) {
      setSelectionStart(textarea.selectionStart);
      setSelectionEnd(textarea.selectionEnd);
    }
  }, []);

  const handleRewrite = useCallback(() => {
    if (selectionStart === selectionEnd || !rewriteInstruction.trim()) return;
    onRewrite({
      start: selectionStart,
      end: selectionEnd,
      instruction: rewriteInstruction.trim(),
    });
    setRewriteInstruction('');
    setShowRewrite(false);
  }, [selectionStart, selectionEnd, rewriteInstruction, onRewrite]);

  const wordCount = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-500" />
            章节正文
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">{wordCount} 字</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRewrite(!showRewrite)}
              disabled={disabled}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              重写段落
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          id="chapter-content"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onSelect={handleSelect}
          onMouseUp={handleSelect}
          disabled={disabled}
          className="min-h-[400px] w-full rounded-md border border-stone-200 p-4 font-serif text-sm leading-relaxed text-stone-800 focus:border-brand-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-stone-50"
          placeholder="生成的章节内容将显示在这里..."
        />

        {/* 重写面板 */}
        {showRewrite && (
          <Card className="border-brand-200 bg-brand-50/50">
            <CardContent className="space-y-3 py-3">
              <div className="flex items-center gap-2 text-xs text-stone-600">
                <Wand2 className="h-3 w-3 text-brand-500" />
                {selectionStart === selectionEnd
                  ? '请在正文中选中要重写的段落'
                  : `已选中 ${selectionEnd - selectionStart} 个字符`}
              </div>
              <textarea
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                placeholder="输入重写要求，例如：让这段对话更幽默、增加环境描写..."
                className="min-h-[60px] w-full rounded-md border border-stone-200 p-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowRewrite(false); setRewriteInstruction(''); }}>
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleRewrite}
                  disabled={selectionStart === selectionEnd || !rewriteInstruction.trim()}
                >
                  确认重写
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}