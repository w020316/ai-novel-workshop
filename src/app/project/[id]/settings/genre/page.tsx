'use client';

import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GenreTemplateList } from '@/components/settings/GenreTemplateList';
import { useProjectStore } from '@/lib/store/project-store';
import type { GenreTemplate } from '@/types';
import { Library } from 'lucide-react';

export default function GenrePage() {
  const { currentProject } = useProjectStore();

  if (!currentProject) return null;

  const handleSelect = async (template: GenreTemplate) => {
    // 题材模板目前仅作为参考。用户可手动选择应用，但不会覆盖 project.genre（避免破坏一致性）。
    // 实际使用：将其作为生成大纲与爽点设计的输入参数（在 P5 多智能体中接入）。
    toast.success(`已选择「${template.genre}」题材模板`, {
      description: '将在大纲生成与爽点设计时作为参考',
    });
    // TODO: P5 多智能体阶段，将所选模板存入 project 元数据供 orchestrator 使用
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Library className="h-4 w-4 text-brand-600" />
            题材模板库
          </CardTitle>
          <CardDescription>
            浏览 30+ 个题材模板（10 大类 × 3 流派变体），含节奏规律、爽点设计与典型弧线
            <br />
            当前项目题材：
            <span className="font-medium text-brand-700">{currentProject.genre}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GenreTemplateList currentGenre={currentProject.genre} onSelect={handleSelect} />
        </CardContent>
      </Card>
    </div>
  );
}
