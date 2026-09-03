import { describe, it, expect, vi } from 'vitest';
import {
  serializeSettingsBundle,
  parseSettingsBundle,
  rebindBundleToProject,
  importSettingsBundle,
} from './settings-transfer';
import type { Character, Worldview } from '@/types';

const wv: Worldview = {
  id: 'wv_src',
  projectId: 'p1',
  worldStructure: '九重天渊',
  powerSystem: '炼气至大乘',
  geography: '东荒',
  era: '太初',
  factions: '正道六宗',
  rules: ['天道反噬'],
  locked: true,
  updatedAt: 1,
};

const char: Character = {
  id: 'char_src',
  projectId: 'p1',
  name: '李文渊',
  role: 'protagonist',
  appearance: '清瘦',
  personality: '沉稳坚韧，外冷内热，面对强敌从不退缩。',
  catchphrase: '走吧',
  background: '边荒遗孤',
  motivation: '寻母证道',
  weakness: '重情',
  growthArc: '从孤狼到领袖',
  relationships: [],
  speechStyle: '惜字如金',
  behaviorPattern: '谋定后动',
  locked: true,
  updatedAt: 1,
};

describe('lib/settings-transfer', () => {
  it('序列化含世界观与人物', () => {
    const json = serializeSettingsBundle(wv, [char]);
    const b = parseSettingsBundle(json);
    expect(b.kind).toBe('novel-settings-bundle');
    expect(b.worldview?.worldStructure).toContain('九重天渊');
    expect(b.characters).toHaveLength(1);
    expect(b.characters[0].name).toBe('李文渊');
  });

  it('非法 JSON 抛错', () => {
    expect(() => parseSettingsBundle('not json')).toThrow();
  });

  it('非本应用包抛错', () => {
    expect(() => parseSettingsBundle('{"kind":"other"}')).toThrow('不是本应用生成的设定包');
  });

  it('缺失人物抛错', () => {
    expect(() => parseSettingsBundle('{"kind":"novel-settings-bundle"}')).toThrow('缺少人物档案');
  });

  it('rebind 重建 id/projectId 并解锁', () => {
    const { worldview, characters } = rebindBundleToProject(
      { kind: 'novel-settings-bundle', version: 1, exportedAt: 0, worldview: wv, characters: [char] },
      'p2'
    );
    expect(worldview?.projectId).toBe('p2');
    expect(worldview?.id).not.toBe(wv.id);
    expect(worldview?.locked).toBe(false);
    expect(characters[0]).toBeDefined();
    expect(characters[0].projectId).toBe('p2');
    expect(characters[0].id).not.toBe(char.id);
    expect(characters[0].locked).toBe(false);
    // 人物关系引用保留（关系随目标项目人物 id 变化，此处不重写，交由用户在目标内重建）
    expect(characters[0].motivation).toBe('寻母证道');
  });

  it('导入：写入重绑后的世界观与人物，返回计数', async () => {
    const saveWorldview = vi.fn().mockResolvedValue(undefined);
    const saveCharacter = vi.fn().mockResolvedValue(undefined);
    const resolveWorldview = vi.fn().mockResolvedValue(undefined); // 目标无世界观 → 写入
    const res = await importSettingsBundle(
      { kind: 'novel-settings-bundle', version: 1, exportedAt: 0, worldview: wv, characters: [char] },
      'p2',
      { saveWorldview, saveCharacter, resolveWorldview }
    );
    expect(res.importedWorldview).toBe(true);
    expect(res.importedCharacters).toBe(1);
    expect(saveWorldview).toHaveBeenCalledTimes(1);
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });

  it('导入：目标已有世界观则不覆盖，但人物仍写入', async () => {
    const saveWorldview = vi.fn();
    const saveCharacter = vi.fn();
    const resolveWorldview = vi.fn().mockResolvedValue({
      ...wv,
      id: 'wv_target',
      projectId: 'p2',
      rules: ['已有规则'],
    });
    const res = await importSettingsBundle(
      { kind: 'novel-settings-bundle', version: 1, exportedAt: 0, worldview: wv, characters: [char] },
      'p2',
      { saveWorldview, saveCharacter, resolveWorldview }
    );
    expect(res.importedWorldview).toBe(false);
    expect(saveWorldview).not.toHaveBeenCalled();
    expect(res.importedCharacters).toBe(1);
    expect(saveCharacter).toHaveBeenCalledTimes(1);
  });
});