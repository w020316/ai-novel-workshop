'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea, Label, Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateDeconstruction } from '@/lib/deconstruct/analyzer';
import {
  saveDeconstruction,
  saveInspirationCards,
  listDeconstructions,
  listInspirationCards,
  deleteDeconstruction,
  deleteInspirationCard,
} from '@/lib/db/queries';
import { countChineseWords } from '@/lib/utils';
import type { Deconstruction, InspirationCard } from '@/types';
import {
  BookOpen,
  Loader2,
  Sparkles,
  Trash2,
  Scale,
  Zap,
  MessageSquare,
  Clock3,
  Lightbulb,
  FileText,
} from 'lucide-react';

const RHYTHM_LABEL: Record<string, string> = { fast: '快节奏', medium: '中等', slow: '慢节奏' };
const KIND_LABEL: Record<InspirationCard['kind'], string> = {
  'golden-three': '黄金三章',
  hook: '钩子',
  coolpoint: '爽点',
  pacing: '节奏',
  character: '人物',
  structure: '结构',
  other: '其他',
};

export default function DeconstructPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [titleInput, setTitleInput] = useState('');
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);

  const [deconstruction, setDeconstruction] = useState<Deconstruction | null>(null);
  const [cards, setCards] = useState<InspirationCard[]>([]);
  const [history, setHistory] = useState<Deconstruction[]>([]);
  const [savedCards, setSavedCards] = useState<InspirationCard[]>([]);

  const loadData = useCallback(async () => {
    const [hs, cs] = await Promise.all([
      listDeconstructions(projectId),
      listInspirationCards(projectId),
    ]);
    setHistory(hs);
    setSavedCards(cs);
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRun = async () => {
    if (!text.trim()) {
      toast.warning('请先粘贴参考片段');
      return;
    }
    if (countChineseWords(text) < 100) {
      toast.error('样本至少 100 个中文字符');
      return;
    }
    setRunning(true);
    try {
      const { deconstruction: dec, cards: generated } = await generateDeconstruction(
        projectId,
        titleInput.trim(),
        text
      );
      setDeconstruction(dec);
      setCards(generated);
      await saveDeconstruction(dec);
      if (generated.length > 0) await saveInspirationCards(generated);
      await loadData();
      toast.success(
        dec.fromLLM
          ? `拆解完成${generated.length > 0 ? `，生成 ${generated.length} 张灵感卡` : ''}`
          : '拆解完成（样本较短或 LLM 不可用，已用本地启发式）'
      );
    } catch (e) {
      toast.error('拆解失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDeconstruction(id);
    setDeconstruction(null);
    setCards([]);
    await loadData();
    toast.info('已删除该拆解与关联灵感卡');
  };

  const handleDeleteCard = async (id: string) => {
    await deleteInspirationCard(id);
    await loadData();
    toast.info('灵感卡已移除');
  };

  // 当前新建的灵感卡（未落库的），点击即收藏
  const saveUnsavedCard = async (card: InspirationCard) => {
    await saveInspirationCards([card]);
    await loadData();
    toast.success('灵感卡已收藏');
  };

  return (
    <div className="space-y-4">
      {/* 输入区 */}
      <Card className="border-brand-200 bg-gradient-to-br from-brand-50/30 to-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-brand-600" />
            <CardTitle className="text-base">拆书工坊</CardTitle>
          </div>
          <CardDescription>
            粘贴一本书/片段的节选，系统拆解钩子、爽点、节奏与断章，沉淀可收藏的灵感卡反哺创作
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>参考片段名（可选）</Label>
            <Input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="例如：《XXX》第三章"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>参考文本</Label>
              <span className="text-[10px] text-stone-400">
                {countChineseWords(text)} 字 · 建议 500+ 字
              </span>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'粘贴参考章节/片段…\n支持任意题材，尽量选择你想学习的写法。'}
              style={{ minHeight: 160 }}
              className="font-serif"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleRun} disabled={running || !text.trim()}>
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Scale className="mr-1.5 h-3.5 w-3.5" />
              )}
              开始拆解
            </Button>
            <span className="text-[10px] text-stone-400">结果自动保存到项目，可随时回看</span>
          </div>
        </CardContent>
      </Card>

      {/* 当前拆解结果 */}
      {deconstruction && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-500" />
                <CardTitle className="text-base">
                  {deconstruction.sourceTitle || '未命名参考片段'}
                </CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(deconstruction.id)}>
                <Trash2 className="mr-1 h-3.5 w-3.5 text-red-400" />
                删除
              </Button>
            </div>
            <CardDescription className="line-clamp-2 text-xs">
              {deconstruction.samplePreview}…
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 指标 */}
            <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
              <div className="rounded border border-stone-200 p-2">
                <p className="flex items-center gap-1 text-stone-400">
                  <MessageSquare className="h-3 w-3" /> 对话占比
                </p>
                <p className="mt-0.5 text-base font-semibold text-stone-800">
                  {Math.round(deconstruction.metrics.dialogueRatio * 100)}%
                </p>
              </div>
              <div className="rounded border border-stone-200 p-2">
                <p className="flex items-center gap-1 text-stone-400">
                  <Clock3 className="h-3 w-3" /> 节奏
                </p>
                <p className="mt-0.5 text-base font-semibold text-stone-800">
                  {RHYTHM_LABEL[deconstruction.metrics.rhythm]} ·{' '}
                  {deconstruction.metrics.avgSentenceLength}字/句
                </p>
              </div>
              <div className="rounded border border-stone-200 p-2">
                <p className="flex items-center gap-1 text-stone-400">
                  <Zap className="h-3 w-3" /> 爽点密度
                </p>
                <p className="mt-0.5 text-base font-semibold text-stone-800">
                  {deconstruction.metrics.coolPointDensity}/千字
                  {deconstruction.metrics.coolPointHits.length > 0 && (
                    <span className="ml-1 text-xs text-stone-500">
                      ({deconstruction.metrics.coolPointHits.join('、')})
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded border border-stone-200 p-2">
                <p className="text-stone-400">钩子 / 断章</p>
                <p className="mt-0.5 text-base font-semibold text-stone-800">
                  {deconstruction.metrics.hookCount} 处钩子
                  <span className="text-xs text-stone-500"> · 结尾{deconstruction.metrics.hasCliffhanger ? '留钩' : '无钩'}</span>
                </p>
              </div>
            </div>

            {/* 建议 */}
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-stone-700">
                <Lightbulb className="h-3 w-3 text-brand-500" />
                可借鉴建议
                {deconstruction.fromLLM && (
                  <span className="ml-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-600">
                    LLM
                  </span>
                )}
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-stone-600">
                {deconstruction.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {/* 灵感卡 */}
            {cards.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-stone-700">本次生成的灵感卡（点击收藏）</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void saveUnsavedCard(c)}
                      className="rounded-md border border-brand-200 bg-brand-50/40 p-3 text-left transition-colors hover:bg-brand-100/60"
                    >
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                        {KIND_LABEL[c.kind]}
                      </span>
                      <p className="mt-1 text-xs font-medium text-stone-800">{c.title}</p>
                      <p className="mt-0.5 text-xs text-stone-600">{c.content}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 灵感卡收藏库 */}
      {savedCards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-brand-500" />
              已收藏灵感卡（{savedCards.length}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {savedCards.map((c) => (
                <div key={c.id} className="group relative rounded-md border border-stone-200 p-3">
                  <span className="inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                    {KIND_LABEL[c.kind]}
                  </span>
                  <p className="mt-1 text-xs font-medium text-stone-800">{c.title}</p>
                  <p className="mt-0.5 text-xs text-stone-600">{c.content}</p>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCard(c.id)}
                    className="absolute right-2 top-2 text-stone-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    aria-label="删除灵感卡"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 历史 */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">历史拆解</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setDeconstruction(h);
                  setCards(
                    savedCards.filter((c) => c.sourceDeconstructionId === h.id)
                  );
                  toast.info(`已回看：${h.sourceTitle}`);
                }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-stone-600 hover:bg-stone-100"
              >
                {h.sourceTitle} · {h.metrics.wordCount} 字 ·{' '}
                {new Date(h.createdAt).toLocaleString('zh-CN')}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}