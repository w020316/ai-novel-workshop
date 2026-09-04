// ============================================================================
// 导出避撞体检附录 单测（纯函数）
// ============================================================================
import { describe, it, expect } from 'vitest';
import { buildCollisionAppendix } from './collision-appendix';

describe('buildCollisionAppendix', () => {
  const tpl = (id: string, title: string, content: string) => ({ id, title, content });

  it('空章节返回“未执行避撞体检”占位', async () => {
    const s = await buildCollisionAppendix([]);
    expect(s).toContain('暂无已完成章节');
  });

  it('无撞梗返回通过说明', async () => {
    const s = await buildCollisionAppendix([tpl('1','第一章','清早小镇的雾漫过石阶。')]);
    expect(s).toContain('未发现与平台代表作 / 实时热书撞梗');
    expect(s).toContain('全书避撞体检报告');
  });

  it('有撞梗时列出最常被撞作品与命中章号', async () => {
    const s = await buildCollisionAppendix([
      tpl('1','第一章','少年喃喃：三十年河东三十年河西，莫欺少年穷。'),
      tpl('2','第二章','他被染香阁退婚，见证斗之气三段的耻辱。'),
    ]);
    expect(s).toContain('发现');
    expect(s).toContain('《斗破苍穹》');
    expect(s).toContain('章号：1、2');
  });

  it('可叠加实时榜单热书黑名单', async () => {
    const s = await buildCollisionAppendix([
      tpl('1','第一章','这书名《盘点万界战力等级》得很好记。'),
    ], { liveTitles: ['盘点万界战力等级'] });
    expect(s).toContain('《盘点万界战力等级》');
  });
});
