// ============================================================================
// 技能存储测试：注入块构建 + 按应用环节分类筛选（纯函数部分，不依赖 Dexie）
// ============================================================================
import { describe, it, expect } from 'vitest';
import { buildSkillsPromptBlock } from './store';
import type { WritingSkill } from '@/types';

function skill(over: Partial<WritingSkill>): WritingSkill {
  return {
    id: 'x',
    name: '技能',
    category: 'style',
    source: 'builtin',
    builtin: true,
    enabled: true,
    description: '',
    instruction: '指令内容',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as WritingSkill;
}

describe('buildSkillsPromptBlock', () => {
  it('无启用技能返回空串', () => {
    expect(buildSkillsPromptBlock([])).toBe('');
  });
  it('剔除未启用技能', () => {
    const s = skill({ enabled: false });
    expect(buildSkillsPromptBlock([s])).toBe('');
  });
  it('剔除空指令', () => {
    const s = skill({ instruction: '  ' });
    expect(buildSkillsPromptBlock([s])).toBe('');
  });
  it('拼接已启用技能的名称与指令', () => {
    const a = skill({ name: 'A', instruction: '第一条' });
    const b = skill({ id: 'y', name: 'B', instruction: '第二条', category: 'hook' });
    const block = buildSkillsPromptBlock([a, b]);
    expect(block).toContain('A');
    expect(block).toContain('第一条');
    expect(block).toContain('B');
    expect(block).toContain('第二条');
  });
});