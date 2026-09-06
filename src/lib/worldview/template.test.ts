import { describe, it, expect } from 'vitest';
import {
  generateWorldviewTemplate,
  getEraOptions,
  pickEra,
  isWorldviewEmpty,
  normalizeRules,
  parseRulesInput,
} from './template';
import type { Genre } from '@/types';

const ALL_GENRES: Genre[] = [
  '玄幻', '仙侠', '武侠', '奇幻', '都市', '历史', '军事', '游戏', '科幻', '末世',
  '脑洞', '体育', '轻小说', '言情', '甜宠', '快穿', '种田', '宫斗', '玄幻言情', '纯爱',
  '悬疑', '灵异', '同人衍生', '现实', '其他',
];

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

  describe('时代背景多样化（era 候选随机挑选）', () => {
    it('全部 25 个题材应提供 3-5 条非空且互不重复的时代背景候选', () => {
      for (const genre of ALL_GENRES) {
        const options = getEraOptions(genre);
        expect(options.length, `${genre} 候选数`).toBeGreaterThanOrEqual(3);
        expect(options.length, `${genre} 候选数`).toBeLessThanOrEqual(5);
        for (const option of options) {
          expect(option.trim().length, `${genre} 候选文本`).toBeGreaterThan(0);
        }
        expect(new Set(options).size, `${genre} 候选应互不重复`).toBe(options.length);
      }
    });

    it('未知题材应回落到「其他」的候选', () => {
      expect(getEraOptions('不存在' as Genre)).toEqual(getEraOptions('其他'));
    });

    it('生成的 era 应来自该题材候选集合', () => {
      const options = getEraOptions('玄幻');
      for (let i = 0; i < 20; i++) {
        const wv = generateWorldviewTemplate({
          projectId: 'p1',
          genre: '玄幻',
          title: 'x',
          summary: '',
        });
        expect(options).toContain(wv.era);
      }
    });

    it('pickEra 应返回候选之一，空候选返回空字符串', () => {
      const candidates = ['纪元A', '纪元B', '纪元C'];
      for (let i = 0; i < 20; i++) {
        expect(candidates).toContain(pickEra(candidates));
      }
      expect(pickEra([])).toBe('');
    });

    it('多次生成可得到不同时代背景（随机性冒烟）', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        seen.add(
          generateWorldviewTemplate({ projectId: 'p1', genre: '仙侠', title: 'x', summary: '' }).era
        );
      }
      // 40 次采样至少覆盖 2 种候选（概率上极大概率命中更多）
      expect(seen.size).toBeGreaterThanOrEqual(2);
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

  describe('parseRulesInput（多行粘贴拆分为多条规则）', () => {
    it('按换行拆分为多条规则', () => {
      expect(parseRulesInput('规则一\n规则二\n规则三')).toEqual([
        '规则一',
        '规则二',
        '规则三',
      ]);
    });

    it('支持 windows 的 \\r\\n 换行', () => {
      expect(parseRulesInput('规则一\r\n规则二\r\n规则三')).toEqual([
        '规则一',
        '规则二',
        '规则三',
      ]);
    });

    it('单行（无换行）返回单条规则', () => {
      expect(parseRulesInput(' 唯一规则 ')).toEqual(['唯一规则']);
    });

    it('去除前后空白与多余空行，并去重', () => {
      expect(parseRulesInput(' 规则A \n\n 规则B \n 规则A \n')).toEqual([
        '规则A',
        '规则B',
      ]);
    });
  });
});
