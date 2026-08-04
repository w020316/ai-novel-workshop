'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  listCharacters,
  saveCharacter,
  deleteCharacter,
  getCharacter,
} from '@/lib/db/queries';
import { CharacterList } from '@/components/settings/CharacterList';
import { CharacterForm } from '@/components/settings/CharacterForm';
import { CharacterRelationGraph } from '@/components/settings/CharacterRelationGraph';
import { CharacterGenerator } from '@/components/settings/CharacterGenerator';
import type { Character } from '@/types';
import { Plus, Loader2 } from 'lucide-react';

export default function CharactersPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Character | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCharacters(projectId);
      setCharacters(list);
    } catch (e) {
      toast.error('加载人物失败', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (c: Character) => {
    setEditing(c);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该人物档案？此操作不可撤销。')) return;
    try {
      await deleteCharacter(id);
      toast.success('人物已删除');
      await load();
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleToggleLock = async (id: string) => {
    try {
      const c = await getCharacter(id);
      if (!c) return;
      const next = !c.locked;
      await saveCharacter({ ...c, locked: next });
      toast.success(next ? '已锁定' : '已解锁');
      await load();
    } catch (e) {
      toast.error('切换锁定失败', { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    void load();
  };

  const handleGraphSelect = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (c) handleEdit(c);
  };

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium text-stone-800">人物档案库</h2>
          <p className="text-xs text-stone-500">
            完整的人物档案是长篇一致性的基石 · 共 {characters.length} 位角色
          </p>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={showForm}>
          <Plus className="h-3.5 w-3.5" />
          新增人物
        </Button>
      </div>

      {/* AI 生成器 */}
      <CharacterGenerator projectId={projectId} onGenerated={() => void load()} />

      {/* 关系图（有数据时显示） */}
      {characters.length > 0 && (
        <CharacterRelationGraph characters={characters} onSelect={handleGraphSelect} />
      )}

      {/* 编辑/创建表单 */}
      {showForm && (
        <CharacterForm
          projectId={projectId}
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* 人物列表 */}
      {loading && !showForm ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        </div>
      ) : (
        <CharacterList
          characters={characters}
          loading={false}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleLock={handleToggleLock}
          onAdd={handleAdd}
        />
      )}
    </div>
  );
}
