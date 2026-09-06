'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea, Label, Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { generateDeconstruction, deconstructionToSkill } from '@/lib/deconstruct/analyzer';
import { saveSkill } from '@/lib/skills/store';
import {
  saveDeconstruction,
  saveInspirationCards,
  listDeconstructions,
  listInspirationCards,
  listAllInspirationCards,
  deleteDeconstruction,
  deleteInspirationCard,
} from '@/lib/db/queries';
import { countChineseWords } from '@/lib/utils';
import { mergeCardIntoOutline } from '@/lib/inspiration/merge';
import { buildSimilarTrendHints, type SimilarTrendHints } from '@/lib/deconstruct/trend-hints';
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
  Bone,
  Link2,
  Sigma,
  Wrench,
  TrendingUp,
} from 'lucide-react';

const RHYTHM_LABEL: Record<string, string> = { fast: '快节奏', medium: '中等', slow: '慢节奏' };
const SKELETON_LABEL: Record<keyof Deconstruction['skeleton'] & string, string> = {
  goal: '核心目标',
  openingHook: '开篇钩子',
  conflict: '核心冲突',
  payoff: '爽点/情绪点',
  cliffhanger: '章末悬念',
};
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
  // 全局灵感库卡片（供「从灵感库导入」选择器）
  const [allCards, setAllCards] = useState<InspirationCard[]>([]);
  // 「从灵感库导入」当前选中项（选中后立即复位，便于重复导入同一张卡）
  const [importPick, setImportPick] = useState('');
  // 平台相似风向参考（每次拆书成功后按样本文本重算）
  const [trendHints, setTrendHints] = useState<SimilarTrendHints | null>(null);

  const loadData = useCallback(async () => {
    const [hs, cs, globals] = await Promise.all([
      listDeconstructions(projectId),
      listInspirationCards(projectId),
      listAllInspirationCards(50),
    ]);
    setHistory(hs);
    setSavedCards(cs);
    setAllCards(globals);
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 导入候选：全局灵感库 + 本项目灵感卡，按 id 合并去重（新→旧）
  const importCandidates = useMemo(() => {
    const seen = new Set<string>();
    const merged: InspirationCard[] = [];
    for (const c of [...allCards, ...savedCards]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    return merged.sort((a, b) => b.createdAt - a.createdAt);
  }, [allCards, savedCards]);

  // 从灵感库导入：内容填入参考文本（可再编辑），参考片段名为空时一并回填书名
  const handleImportCard = (id: string) => {
    setImportPick('');
    const card = importCandidates.find((c) => c.id === id);
    if (!card) return;
    setText(card.content);
    if (!titleInput.trim()) setTitleInput(card.title);
    toast.info(`已导入灵感卡：${card.title}`, { description: '内容已填入参考文本，可继续编辑' });
  };

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
      setTrendHints(buildSimilarTrendHints(text));
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
    setTrendHints(null);
    await loadData();
    toast.info('已删除该拆解与关联灵感卡');
  };

  const handleDeleteCard = async (id: string) => {
    await deleteInspirationCard(id);
    await loadData();
    toast.info('灵感卡已移除');
  };

  const handleMergeCard = async (c: InspirationCard) => {
    try {
      await mergeCardIntoOutline(projectId, c);
      toast.success('已并入大纲（创作工作台 · 大纲视图可查看）');
    } catch {
      toast.error('并入失败');
    }
  };

  // 当前新建的灵感卡（未落库的），点击即收藏
  const saveUnsavedCard = async (card: InspirationCard) => {
    await saveInspirationCards([card]);
    await loadData();
    toast.success('灵感卡已收藏');
  };

  // 拆解沉淀为自定义技能（plot 环节注入写作流程）
  const handleSaveSkill = async (dec: Deconstruction) => {
    try {
      const sk = deconstructionToSkill(dec);
      await saveSkill(sk);
      toast.success('已存为技能', { description: '在「技能库」中启用后，会在情节编排环节自动注入' });
    } catch (e) {
      toast.error('存为技能失败', { description: e instanceof Error ? e.message : String(e) });
    }
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
            <Label>从灵感库导入</Label>
            <select
              value={importPick}
              onChange={(e) => handleImportCard(e.target.value)}
              disabled={importCandidates.length === 0}
              className="flex h-10 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">
                {importCandidates.length === 0
                  ? '灵感库暂无卡片，先去趋势灵感/创作中收藏'
                  : '全局灵感库 + 本项目灵感卡，选中即填入'}
              </option>
              {importCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}｜{c.content.replace(/\s+/g, ' ').slice(0, 40)}
                </option>
              ))}
            </select>
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
              <div className="min-w-0 rounded border border-stone-200 p-2">
                <p className="flex items-center gap-1 truncate text-stone-400">
                  <MessageSquare className="h-3 w-3 shrink-0" /> 对话占比
                </p>
                <p className="mt-0.5 text-base font-semibold leading-tight text-stone-800">
                  {Math.round(deconstruction.metrics.dialogueRatio * 100)}%
                </p>
              </div>
              <div className="min-w-0 rounded border border-stone-200 p-2">
                <p className="flex items-center gap-1 truncate text-stone-400">
                  <Clock3 className="h-3 w-3 shrink-0" /> 节奏
                </p>
                <p className="mt-0.5 text-base font-semibold leading-tight text-stone-800">
                  {RHYTHM_LABEL[deconstruction.metrics.rhythm]}
                </p>
                <p className="truncate text-[10px] text-stone-500">
                  {deconstruction.metrics.avgSentenceLength}字/句
                </p>
              </div>
              <div className="min-w-0 rounded border border-stone-200 p-2">
                <p className="flex items-center gap-1 truncate text-stone-400">
                  <Zap className="h-3 w-3 shrink-0" /> 爽点密度
                </p>
                <p className="mt-0.5 text-base font-semibold leading-tight text-stone-800">
                  {deconstruction.metrics.coolPointDensity}/千字
                </p>
                {deconstruction.metrics.coolPointHits.length > 0 && (
                  <p className="mt-0.5 truncate text-[10px] text-stone-500">
                    {deconstruction.metrics.coolPointHits.join('、')}
                  </p>
                )}
              </div>
              <div className="min-w-0 rounded border border-stone-200 p-2">
                <p className="truncate text-stone-400">钩子 / 断章</p>
                <p className="mt-0.5 text-base font-semibold leading-tight text-stone-800">
                  {deconstruction.metrics.hookCount} 处钩子
                </p>
                <p className="truncate text-[10px] text-stone-500">
                  结尾{deconstruction.metrics.hasCliffhanger ? '留钩' : '无钩'}
                </p>
              </div>
            </div>

            {/* 平台相似风向参考（确定性题材匹配 + 内置平台风向，纯本地计算） */}
            {trendHints && trendHints.hints.length > 0 && (
              <div className="rounded-md border border-brand-200 bg-brand-50/40 p-3">
                <p className="mb-1.5 flex flex-wrap items-center gap-1 text-xs font-medium text-brand-700">
                  <TrendingUp className="h-3 w-3" />
                  平台相似风向参考
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-brand-600">
                    匹配题材：{trendHints.genre}
                  </span>
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-stone-600">
                  {trendHints.hints.map((h, i) => (
                    <li
                      key={i}
                      className={i === trendHints.hints.length - 1 ? 'text-brand-700' : undefined}
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 剧情骨架五件套 + 因果链 + 可复用公式 */}
            {(deconstruction.skeleton || deconstruction.causalChain?.length || deconstruction.formula) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1 text-xs font-medium text-stone-700">
                    <Bone className="h-3 w-3 text-brand-500" />
                    剧情骨架（拆骨不拆皮 · 只学结构不抄情节）
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void handleSaveSkill(deconstruction)}>
                    <Wrench className="mr-1 h-3 w-3" />
                    存为技能
                  </Button>
                </div>
                {deconstruction.skeleton && (
                  <div className="grid gap-2 text-[11px] md:grid-cols-5">
                    {(Object.keys(SKELETON_LABEL) as Array<keyof typeof SKELETON_LABEL>).map((k) => (
                      <div key={k} className="rounded border border-stone-200 p-2">
                        <p className="text-stone-400">{SKELETON_LABEL[k]}</p>
                        <p className="mt-0.5 leading-relaxed text-stone-700">{deconstruction.skeleton?.[k]}</p>
                      </div>
                    ))}
                  </div>
                )}
                {deconstruction.causalChain && deconstruction.causalChain.length > 0 && (
                  <div className="rounded-md border border-stone-200 p-3">
                    <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-stone-700">
                      <Link2 className="h-3 w-3 text-brand-500" />
                      因果链（逐步升级）
                    </p>
                    <ol className="list-decimal space-y-1 pl-4 text-xs text-stone-600">
                      {deconstruction.causalChain.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {deconstruction.formula && (
                  <div className="rounded-md border border-brand-200 bg-brand-50/50 p-3">
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-700">
                      <Sigma className="h-3 w-3" />
                      可复用公式（填入任意题材）
                    </p>
                    <p className="text-xs leading-relaxed text-stone-700">{deconstruction.formula}</p>
                  </div>
                )}
              </div>
            )}

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
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void handleMergeCard(c)}
                      className="text-xs text-brand-600 hover:text-brand-700"
                    >
                      并入大纲
                    </button>
                  </div>
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
                  setTrendHints(buildSimilarTrendHints(h.samplePreview));
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
