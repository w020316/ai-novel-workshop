'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, StopCircle, Loader2, Plus, Trash2, Settings2 } from 'lucide-react';
import type { GenerationStage } from '@/types';

interface PlotPointInputProps {
  plotPoints: string[];
  onChange: (points: string[]) => void;
  disabled?: boolean;
}

function PlotPointInput({ plotPoints, onChange, disabled }: PlotPointInputProps) {
  const add = () => onChange([...plotPoints, '']);
  const update = (i: number, v: string) => onChange(plotPoints.map((p, j) => (j === i ? v : p)));
  const remove = (i: number) => onChange(plotPoints.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      {plotPoints.map((point, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={point}
            onChange={(e) => update(i, e.target.value)}
            disabled={disabled}
            className="flex-1 rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-stone-50"
            placeholder={`剧情要点 ${i + 1}`}
          />
          {plotPoints.length > 1 && !disabled && (
            <button onClick={() => remove(i)} className="text-xs text-red-400 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3 w-3" />
          添加要点
        </Button>
      )}
    </div>
  );
}

interface GenerationParamsProps {
  temperature: number;
  topP: number;
  onChange: (params: { temperature: number; topP: number }) => void;
  disabled?: boolean;
}

function GenerationParams({ temperature, topP, onChange, disabled }: GenerationParamsProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"
      >
        <Settings2 className="h-3 w-3" />
        生成参数
      </button>
      {expanded && (
        <div className="mt-2 space-y-3 rounded-md border border-stone-200 bg-stone-50 p-3">
          <div>
            <label className="mb-1 block text-xs text-stone-600">温度 (Temperature): {temperature.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => onChange({ temperature: parseFloat(e.target.value), topP })}
              disabled={disabled}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-stone-400">
              <span>精确</span>
              <span>创意</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-600">Top-P: {topP.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => onChange({ temperature, topP: parseFloat(e.target.value) })}
              disabled={disabled}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ChapterGeneratorProps {
  title: string;
  plotPoints: string[];
  generating: boolean;
  stage: GenerationStage | null;
  onTitleChange: (title: string) => void;
  onPlotPointsChange: (points: string[]) => void;
  onGenerate: () => void;
  onAbort: () => void;
  hasExistingContent: boolean;
}

export function ChapterGenerator({
  title,
  plotPoints,
  generating,
  onTitleChange,
  onPlotPointsChange,
  onGenerate,
  onAbort,
  hasExistingContent,
}: ChapterGeneratorProps) {
  const [temperature, setTemperature] = useState(0.8);
  const [topP, setTopP] = useState(0.9);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="h-4 w-4 text-brand-500" />
          生成控制
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 章节标题 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">章节标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={generating}
            className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-stone-50"
            placeholder="输入章节标题"
          />
        </div>

        {/* 剧情要点 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-stone-600">剧情要点</label>
          <p className="mb-2 text-xs text-stone-400">输入本章的关键剧情，每个要点将驱动 Agent 设计场景</p>
          <PlotPointInput plotPoints={plotPoints} onChange={onPlotPointsChange} disabled={generating} />
        </div>

        {/* 生成参数 */}
        <GenerationParams
          temperature={temperature}
          topP={topP}
          onChange={(p) => { setTemperature(p.temperature); setTopP(p.topP); }}
          disabled={generating}
        />

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={onGenerate} disabled={generating} size="lg">
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {hasExistingContent ? '重新生成' : '开始生成'}
              </>
            )}
          </Button>
          {generating && (
            <Button variant="outline" onClick={onAbort}>
              <StopCircle className="mr-2 h-4 w-4" />
              停止生成
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}