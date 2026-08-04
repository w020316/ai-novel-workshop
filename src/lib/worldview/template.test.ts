import { describe, it, expect } from 'vitest';
import {
  generateWorldviewTemplate,
  isWorldviewEmpty,
  normalizeRules,
} from './template';
import type { Genre } from '@/types';

describe('worldview/template', () => {
  describe('generateWorldviewTemplate', () => {
    it('应为玄幻题材生成完整世界观', () => {
      const wv = generateWorldviewTemplate({
        projectId: 'proj_test',
        genre: '玄幻',
        title: '仙道长青',
        summary: '一个凡人修仙的故事',
      });
      expect(wv.id).toMatch(/^wv_/);
      expect(wv.projectId).toBe('proj_test');
      expect(wv.worldStructure).toContain('九重天渊');
      expect(wv.powerSystem).toContain('炼气');
      expect(wv.powerSystem).toContain('筑基');
      expect(wv.geography).toContain('东荒大陆');
      expect(wv.era).toBeTruthy();
      expect(wv.factions).toContain('正道六宗');
      expect(wv.rules.length).toBeGreaterThanOrEqual(3);
      expect(wv.rules.some((r) => r.includes('越阶'))).toBe(true);
      expect(wv.locked).toBe(false);
    });

    it('应为每个主流题材生成对应模板', () => {
      const genres: Genre[] = ['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他'];
      for (const genre of genres) {
        const wv = generateWorldviewTemplate({
          projectId: 'proj_x',
          genre,
          title: `测试-${genre}`,
          summary: '',
        });
        expect(wv.worldStructure.length, `${genre} worldStructure`).toBeGreaterThan(10);
        expect(wv.powerSystem.length, `${genre} powerSystem`).toBeGreaterThan(0);
        expect(wv.rules.length, `${genre} rules`).toBeGreaterThanOrEqual(3);
      }
    });

    it('简介应附加到世界架构末尾', () => {
      const wv = generateWorldviewTemplate({
        projectId: 'proj_test',
        genre: '玄幻',
        title: '测试',
        summary: '  独特的世界设定提示  ',
      });
      expect(wv.worldStructure).toContain('项目简介提示');
      expect(wv.worldStructure).toContain('独特的世界设定提示');
    });

    it('空简介不应附加提示', () => {
      const wv = generateWorldviewTemplate({
        projectId: 'proj_test',
        genre: '玄幻',
        title: '测试',
        summary: '',
      });
      expect(wv.worldStructure).not.toContain('项目简介提示');
    });

    it('每次生成应有不同的 id', () => {
      const a = generateWorldviewTemplate({
        projectId: 'p1',
        genre: '玄幻',
        title: 'a',
        summary: '',
      });
      const b = generateWorldviewTemplate({
        projectId: 'p1',
        genre: '玄幻',
        title: 'b',
        summary: '',
      });
      expect(a.id).not.toBe(b.id);
    });

    it('rules 应为独立副本（修改不影响模板）', () => {
      const a = generateWorldviewTemplate({
        projectId: 'p1',
        genre: '玄幻',
        title: 'a',
        summary: '',
      });
      a.rules.push('新规则');
      const b = generateWorldviewTemplate({
        projectId: 'p1',
        genre: '玄幻',
        title: 'b',
        summary: '',
      });
      expect(b.rules).not.toContain('新规则');
    });
  });

  describe('isWorldviewEmpty', () => {
    it('null 应视为空', () => {
      expect(isWorldviewEmpty(null)).toBe(true);
    });

    it('undefined 应视为空', () => {
      expect(isWorldviewEmpty(undefined)).toBe(true);
    });

    it('全空字段应视为空', () => {
      const wv = {
        id: 'wv_1',
        projectId: 'p1',
        worldStructure: '',
        powerSystem: '',
        geography: '',
        era: '',
        factions: '',
        rules: [],
        locked: false,
        updatedAt: Date.now(),
      };
      expect(isWorldviewEmpty(wv)).toBe(true);
    });

    it('仅空白字符应视为空', () => {
      const wv = {
        id: 'wv_1',
        projectId: 'p1',
        worldStructure: '   ',
        powerSystem: '',
        geography: '',
        era: '',
        factions: '',
        rules: [],
        locked: false,
        updatedAt: Date.now(),
      };
      expect(isWorldviewEmpty(wv)).toBe(true);
    });

    it('有内容应视为非空', () => {
      const wv = generateWorldviewTemplate({
        projectId: 'p1',
        genre: '玄幻',
        title: 'x',
        summary: '',
      });
      expect(isWorldviewEmpty(wv)).toBe(false);
    });

    it('仅有 rules 也应视为非空', () => {
      const wv = {
        id: 'wv_1',
        projectId: 'p1',
        worldStructure: '',
        powerSystem: '',
        geography: '',
        era: '',
        factions: '',
        rules: ['唯一规则'],
        locked: false,
        updatedAt: Date.now(),
      };
      expect(isWorldviewEmpty(wv)).toBe(false);
    });
  });

  describe('normalizeRules', () => {
    it('应去除空字符串', () => {
      expect(normalizeRules(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
    });

    it('应去除前后空白', () => {
      expect(normalizeRules(['  规则一  ', '规则二'])).toEqual(['规则一', '规则二']);
    });

    it('应去重（保留首次出现）', () => {
      expect(normalizeRules(['规则一', '规则一', '规则二', '  规则一  '])).toEqual([
        '规则一',
        '规则二',
      ]);
    });

    it('空数组应返回空数组', () => {
      expect(normalizeRules([])).toEqual([]);
    });

    it('全空数组应返回空数组', () => {
      expect(normalizeRules(['', '  ', ''])).toEqual([]);
    });
  });
});
