'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Edit2,
  Trash2,
  Plus,
  Users,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';
import { getRoleLabel, getRoleBadgeClass } from '@/lib/character/template';
import { formatTime, countChineseWords } from '@/lib/utils';
import type { Character, CharacterRole } from '@/types';

interface CharacterListProps {
  characters: Character[];
  loading: boolean;
  onEdit: (c: Character) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onAdd: () => void;
  emptyHint?: string;
}

const ROLE_ORDER: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];

export function CharacterList({
  characters,
  loading,
  onEdit,
  onDelete,
  onToggleLock,
  onAdd,
  emptyHint,
}: CharacterListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        <span className="ml-2 text-sm text-stone-500">加载人物列表…</span>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="rounded-full bg-stone-100 p-3">
              <Users className="h-6 w-6 text-stone-400" />
            </div>
            <h3 className="text-sm font-medium text-stone-700">还没有人物档案</h3>
            <p className="max-w-sm text-xs text-stone-500">
              {emptyHint ?? '点击上方"AI 一键生成全套人物"批量创建，或新增单个人物。'}
            </p>
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
              新增人物
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 按角色等级分组排序
  const sorted = [...characters].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {sorted.map((c) => {
        const totalWords =
          countChineseWords(c.appearance) +
          countChineseWords(c.personality) +
          countChineseWords(c.background);
        return (
          <Card key={c.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col pt-5">
              {/* 头部 */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-stone-800">
                      {c.name}
                    </h3>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getRoleBadgeClass(
                        c.role
                      )}`}
                    >
                      {getRoleLabel(c.role)}
                    </span>
                    {c.locked && (
                      <span className="inline-flex shrink-0 items-center text-amber-600">
                        <Lock className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-stone-500">
                    {c.catchphrase || '（暂无口头禅）'}
                  </p>
                </div>
              </div>

              {/* 简介 */}
              <p className="mt-3 line-clamp-3 flex-1 text-xs leading-relaxed text-stone-600">
                {c.personality || '（暂无性格描述）'}
              </p>

              {/* 元信息 */}
              <div className="mt-3 flex items-center justify-between text-[10px] text-stone-400">
                <span>{totalWords} 字</span>
                <span>{c.relationships.length} 段关系</span>
                <span>{formatTime(c.updatedAt)}</span>
              </div>

              {/* 操作 */}
              <div className="mt-3 flex items-center gap-1 border-t border-stone-100 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => onEdit(c)}
                >
                  <Edit2 className="h-3 w-3" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => onToggleLock(c.id)}
                >
                  {c.locked ? (
                    <>
                      <Unlock className="h-3 w-3" />
                      解锁
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" />
                      锁定
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-accent-600 hover:bg-accent-50 hover:text-accent-700"
                  onClick={() => onDelete(c.id)}
                >
                  <Trash2 className="h-3 w-3" />
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
