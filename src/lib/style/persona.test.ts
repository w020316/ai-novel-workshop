// ============================================================================
// 叙述者人格库 测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_PERSONAS,
  getBuiltinPersona,
  isBuiltinPersonaId,
  recommendPersonaForGenre,
  personaToPrompt,
} from './persona';
import { GENRE_OPTIONS } from '@/lib/validators';

describe('BUILTIN_PERSONAS', () => {
  it('内置 6 款人格且 id 唯一', () => {
    expect(BUILTIN_PERSONAS.length).toBe(6);
    const ids = BUILTIN_PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每款人格七字段均为非空中文描述', () => {
    for (const p of BUILTIN_PERSONAS) {
      expect(p.name.trim()).toBeTruthy();
      expect(p.summary.trim()).toBeTruthy();
      expect(p.narration.trim()).toBeTruthy();
      expect(p.dialogue.trim()).toBeTruthy();
      expect(p.emotion.trim()).toBeTruthy();
      expect(p.avoid.trim()).toBeTruthy();
      // 不允许中英混杂的占位内容
      expect(p.narration).not.toMatch(/[a-zA-Z]{4,}/);
    }
  });
});

describe('getBuiltinPersona / isBuiltinPersonaId', () => {
  it('按 id 命中返回人格，未命中返回 undefined', () => {
    const p = getBuiltinPersona('persona-poison');
    expect(p?.name).toBe('毒舌编辑');
    expect(getBuiltinPersona('persona-nope')).toBeUndefined();
  });

  it('合法性判断与查询一致', () => {
    expect(isBuiltinPersonaId('persona-cold')).toBe(true);
    expect(isBuiltinPersonaId('custom-123')).toBe(false);
  });
});

describe('recommendPersonaForGenre', () => {
  it('覆盖全部题材且恒返回内置人格（确定性）', () => {
    for (const g of GENRE_OPTIONS) {
      const p = recommendPersonaForGenre(g.value);
      expect(isBuiltinPersonaId(p.id)).toBe(true);
      expect(recommendPersonaForGenre(g.value).id).toBe(p.id);
    }
  });

  it('关键映射符合题材气质', () => {
    expect(recommendPersonaForGenre('玄幻').id).toBe('persona-hard');
    expect(recommendPersonaForGenre('言情').id).toBe('persona-tender');
    expect(recommendPersonaForGenre('宫斗').id).toBe('persona-poison');
    expect(recommendPersonaForGenre('都市').id).toBe('persona-smoke');
    expect(recommendPersonaForGenre('悬疑').id).toBe('persona-cold');
    expect(recommendPersonaForGenre('游戏').id).toBe('persona-snark');
  });
});

describe('personaToPrompt', () => {
  it('输出包含全部维度与章节 prompt 可识别的分节头', () => {
    const text = personaToPrompt(BUILTIN_PERSONAS[0]);
    expect(text).toContain('【叙述者人格');
    expect(text).toContain('人格：毒舌编辑');
    expect(text).toContain('叙述习惯：');
    expect(text).toContain('台词习惯：');
    expect(text).toContain('情绪演法：');
    expect(text).toContain('绝对避免：');
  });
});
