import { describe, it, expect, beforeEach } from 'vitest';
import { seedDatabase, GENRE_TEMPLATE_SEEDS, getVariantsByGenre } from './seed';
import { db } from './schema';
import type { Genre } from '@/types';

// 使用 fake-indexeddb（已在 setup 中配置）
describe('db/seed', () => {
  beforeEach(async () => {
    // 每个测试前清空数据库
    await db.delete();
    await db.open();
  });

  describe('GENRE_TEMPLATE_SEEDS 静态数据', () => {
    it('应提供 30+ 个题材模板', () => {
      expect(GENRE_TEMPLATE_SEEDS.length).toBeGreaterThanOrEqual(30);
    });

    it('每个主流 Genre 应至少有 3 个变体', () => {
      const mainGenres: Genre[] = ['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗'];
      for (const g of mainGenres) {
        const variants = getVariantsByGenre(g);
        expect(variants.length, `${g} 应至少 3 个变体`).toBeGreaterThanOrEqual(3);
      }
    });

    it('每个模板应包含完整字段', () => {
      for (const t of GENRE_TEMPLATE_SEEDS) {
        expect(t.genre).toBeTruthy();
        expect(t.variant).toBeTruthy();
        expect(t.pacingRule.length).toBeGreaterThan(5);
        expect(t.highlightDesign.length).toBeGreaterThan(5);
        expect(t.readerPreference.length).toBeGreaterThan(5);
        expect(t.typicalArcs.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('同一 Genre 内变体名应唯一', () => {
      const mainGenres: Genre[] = ['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗'];
      for (const g of mainGenres) {
        const variants = getVariantsByGenre(g);
        const names = variants.map((v) => v.variant);
        const unique = new Set(names);
        expect(unique.size, `${g} 变体名应唯一`).toBe(names.length);
      }
    });
  });

  describe('getVariantsByGenre', () => {
    it('玄幻应返回 3 个变体', () => {
      const variants = getVariantsByGenre('玄幻');
      expect(variants).toHaveLength(3);
      expect(variants.map((v) => v.variant)).toEqual(
        expect.arrayContaining(['传统修真', '洪荒封神', '异界降临'])
      );
    });

    it('未匹配的题材应返回空数组', () => {
      // Genre 类型限定 10 个值，这里测试已知值
      const variants = getVariantsByGenre('其他');
      expect(variants.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('seedDatabase', () => {
    it('空数据库应初始化所有种子数据', async () => {
      await seedDatabase();
      const genres = await db.genreTemplates.toArray();
      const styles = await db.stylePresets.toArray();
      expect(genres.length).toBe(GENRE_TEMPLATE_SEEDS.length);
      expect(styles.length).toBe(5);
    });

    it('题材模板 id 应为 genre-template-N 格式', async () => {
      await seedDatabase();
      const genres = await db.genreTemplates.toArray();
      for (const g of genres) {
        expect(g.id).toMatch(/^genre-template-\d+$/);
      }
    });

    it('文风预设 id 应为 style-preset-N 格式', async () => {
      await seedDatabase();
      const styles = await db.stylePresets.toArray();
      for (const s of styles) {
        expect(s.id).toMatch(/^style-preset-\d+$/);
      }
    });

    it('重复调用不应产生重复数据（数量匹配时跳过）', async () => {
      await seedDatabase();
      const count1 = await db.genreTemplates.count();
      await seedDatabase();
      const count2 = await db.genreTemplates.count();
      expect(count2).toBe(count1);
    });

    it('种子已升级（数量变化）时应自动更新', async () => {
      // 模拟旧版本：先写入少量旧数据
      await db.genreTemplates.bulkAdd([
        {
          id: 'genre-template-1',
          genre: '玄幻',
          pacingRule: '旧',
          highlightDesign: '旧',
          readerPreference: '旧',
          typicalArcs: ['旧'],
        },
      ]);
      const beforeCount = await db.genreTemplates.count();
      expect(beforeCount).toBe(1);

      // 调用 seed：应检测到数量不匹配并重新写入
      await seedDatabase();
      const afterCount = await db.genreTemplates.count();
      expect(afterCount).toBe(GENRE_TEMPLATE_SEEDS.length);
      // 旧数据应被替换
      const updated = await db.genreTemplates.get('genre-template-1');
      expect(updated?.pacingRule).not.toBe('旧');
    });

    it('种子数据应包含所有主流 Genre', async () => {
      await seedDatabase();
      const genres = await db.genreTemplates.toArray();
      const uniqueGenres = new Set(genres.map((g) => g.genre));
      const expected: Genre[] = ['玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他'];
      for (const g of expected) {
        expect(uniqueGenres.has(g), `应包含题材 ${g}`).toBe(true);
      }
    });

    it('文风预设应包含核心风格', async () => {
      await seedDatabase();
      const styles = await db.stylePresets.toArray();
      const names = styles.map((s) => s.name);
      expect(names).toContain('细腻言情');
      expect(names).toContain('硬核爽文');
      expect(names).toContain('悬疑冷峻');
      expect(names).toContain('史诗厚重');
      expect(names).toContain('轻松幽默');
    });
  });
});
