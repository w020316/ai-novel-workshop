import { describe, it, expect } from 'vitest';
import {
  generateCharacterTemplate,
  parseKeywords,
  getRoleLabel,
  getRoleBadgeClass,
  suggestRelations,
} from './template';
import type { Character, CharacterRole } from '@/types';

describe('character/template', () => {
  describe('parseKeywords', () => {
    it('应按空格分割', () => {
      expect(parseKeywords('冷酷 剑修 复仇')).toEqual(['冷酷', '剑修', '复仇']);
    });

    it('应按逗号分割（含中文逗号）', () => {
      expect(parseKeywords('冷酷，剑修，复仇')).toEqual(['冷酷', '剑修', '复仇']);
    });

    it('应按顿号分割', () => {
      expect(parseKeywords('冷酷、剑修、复仇')).toEqual(['冷酷', '剑修', '复仇']);
    });

    it('应按分号分割（含中文分号）', () => {
      expect(parseKeywords('冷酷;剑修；复仇')).toEqual(['冷酷', '剑修', '复仇']);
    });

    it('应去除空白', () => {
      expect(parseKeywords('  冷酷   剑修  ')).toEqual(['冷酷', '剑修']);
    });

    it('应过滤空字符串', () => {
      expect(parseKeywords(' , , , ')).toEqual([]);
    });

    it('最多保留 5 个关键词', () => {
      expect(parseKeywords('一 二 三 四 五 六 七').length).toBe(5);
    });
  });

  describe('generateCharacterTemplate', () => {
    it('应基于主角角色生成档案', () => {
      const c = generateCharacterTemplate({
        projectId: 'p1',
        keywords: '冷酷 剑修 复仇',
        name: '李云渊',
        role: 'protagonist',
      });
      expect(c.id).toMatch(/^char_/);
      expect(c.projectId).toBe('p1');
      expect(c.name).toBe('李云渊');
      expect(c.role).toBe('protagonist');
      expect(c.appearance).toContain('剑修');
      expect(c.personality.length).toBeGreaterThan(10);
      expect(c.motivation).toBeTruthy();
      expect(c.weakness).toBeTruthy();
      expect(c.growthArc).toBeTruthy();
      expect(c.relationships).toEqual([]);
      expect(c.locked).toBe(false);
    });

    it('应基于配角角色生成档案', () => {
      const c = generateCharacterTemplate({
        projectId: 'p1',
        keywords: '聪慧 体贴',
        name: '玉笙',
        role: 'supporting',
      });
      expect(c.role).toBe('supporting');
      expect(c.personality).toContain('聪慧');
    });

    it('应基于反派角色生成档案', () => {
      const c = generateCharacterTemplate({
        projectId: 'p1',
        keywords: '城府深 阴鸷',
        name: '萧夜',
        role: 'antagonist',
      });
      expect(c.role).toBe('antagonist');
      expect(c.personality).toContain('城府');
    });

    it('姓名留空时应自动命名', () => {
      const c = generateCharacterTemplate({
        projectId: 'p1',
        keywords: '剑修',
        name: '',
        role: 'protagonist',
      });
      expect(c.name.length).toBeGreaterThanOrEqual(2);
      expect(c.name.length).toBeLessThanOrEqual(3);
    });

    it('关键词留空时应使用 fallback', () => {
      const c = generateCharacterTemplate({
        projectId: 'p1',
        keywords: '',
        name: '主角',
        role: 'protagonist',
      });
      expect(c.appearance).toBeTruthy();
      expect(c.personality).toBeTruthy();
    });

    it('每次生成应有不同 id', () => {
      const a = generateCharacterTemplate({
        projectId: 'p1',
        keywords: 'a',
        name: 'a',
        role: 'protagonist',
      });
      const b = generateCharacterTemplate({
        projectId: 'p1',
        keywords: 'b',
        name: 'b',
        role: 'protagonist',
      });
      expect(a.id).not.toBe(b.id);
    });

    it('生成的档案字段均不为空', () => {
      const roles: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];
      for (const role of roles) {
        const c = generateCharacterTemplate({
          projectId: 'p1',
          keywords: '关键词',
          name: `角色-${role}`,
          role,
        });
        expect(c.appearance.length, `${role} appearance`).toBeGreaterThan(5);
        expect(c.personality.length, `${role} personality`).toBeGreaterThan(5);
        expect(c.background.length, `${role} background`).toBeGreaterThan(5);
        expect(c.motivation.length, `${role} motivation`).toBeGreaterThan(0);
        expect(c.weakness.length, `${role} weakness`).toBeGreaterThan(0);
        expect(c.growthArc.length, `${role} growthArc`).toBeGreaterThan(0);
        expect(c.speechStyle.length, `${role} speechStyle`).toBeGreaterThan(0);
        expect(c.behaviorPattern.length, `${role} behaviorPattern`).toBeGreaterThan(0);
        expect(c.catchphrase.length, `${role} catchphrase`).toBeGreaterThan(0);
      }
    });
  });

  describe('getRoleLabel', () => {
    it('应返回角色中文标签', () => {
      expect(getRoleLabel('protagonist')).toBe('主角');
      expect(getRoleLabel('supporting')).toBe('配角');
      expect(getRoleLabel('antagonist')).toBe('反派');
      expect(getRoleLabel('minor')).toBe('次要');
    });
  });

  describe('getRoleBadgeClass', () => {
    it('每个角色都应返回非空 class', () => {
      const roles: CharacterRole[] = ['protagonist', 'supporting', 'antagonist', 'minor'];
      for (const r of roles) {
        expect(getRoleBadgeClass(r).length).toBeGreaterThan(0);
      }
    });

    it('不同角色应有不同 class', () => {
      const set = new Set([
        getRoleBadgeClass('protagonist'),
        getRoleBadgeClass('supporting'),
        getRoleBadgeClass('antagonist'),
        getRoleBadgeClass('minor'),
      ]);
      expect(set.size).toBe(4);
    });
  });

  describe('suggestRelations', () => {
    const makeChar = (id: string, role: CharacterRole, name?: string): Character => ({
      id,
      projectId: 'p1',
      name: name ?? id,
      role,
      appearance: '',
      personality: '中性的性格描述',
      catchphrase: '',
      background: '',
      motivation: '',
      weakness: '',
      growthArc: '',
      relationships: [],
      speechStyle: '',
      behaviorPattern: '',
      locked: false,
      updatedAt: Date.now(),
    });

    it('主角与反派应建议宿敌关系', () => {
      const list = [makeChar('c1', 'protagonist'), makeChar('c2', 'antagonist')];
      const relations = suggestRelations(list, 'c1');
      expect(relations).toHaveLength(1);
      expect(relations[0].relation).toBe('宿敌');
      expect(relations[0].targetId).toBe('c2');
    });

    it('主角与配角应建议伙伴关系', () => {
      const list = [makeChar('c1', 'protagonist'), makeChar('c2', 'supporting')];
      const relations = suggestRelations(list, 'c1');
      expect(relations[0].relation).toBe('伙伴');
    });

    it('配角之间应建议同伴关系', () => {
      const list = [makeChar('c1', 'supporting'), makeChar('c2', 'supporting')];
      const relations = suggestRelations(list, 'c1');
      expect(relations[0].relation).toBe('同伴');
    });

    it('当前人物不存在时应返回空', () => {
      const list = [makeChar('c1', 'protagonist')];
      expect(suggestRelations(list, 'unknown')).toEqual([]);
    });

    it('应排除自身', () => {
      const list = [
        makeChar('c1', 'protagonist'),
        makeChar('c2', 'supporting'),
        makeChar('c3', 'antagonist'),
      ];
      const relations = suggestRelations(list, 'c1');
      expect(relations.every((r) => r.targetId !== 'c1')).toBe(true);
      expect(relations).toHaveLength(2);
    });
  });
});
