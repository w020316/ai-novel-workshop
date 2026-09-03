// ============================================================================
// 表单校验 Schema 测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  GENRE_OPTIONS,
  PROVIDER_OPTIONS,
  projectFormSchema,
  worldviewFormSchema,
  characterFormSchema,
} from './validators';

function makeValidProject() {
  return {
    title: '我的小说',
    genre: '玄幻',
    summary: '简介',
    targetWords: 50000,
    stylePresetId: 'sp1',
    llmProvider: 'deepseek',
    temperature: 0.8,
    topP: 0.9,
  };
}

describe('validators/projectFormSchema', () => {
  it('合法数据应通过校验', () => {
    const result = projectFormSchema.safeParse(makeValidProject());
    expect(result.success).toBe(true);
  });

  it('标题为空时应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), title: '' });
    expect(result.success).toBe(false);
  });

  it('标题超过 50 字时应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), title: '长'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('非法题材应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), genre: '不存在的题材' });
    expect(result.success).toBe(false);
  });

  it('简介超过 200 字时应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), summary: '字'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('简介为空时允许（可选字段）', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), summary: '' });
    expect(result.success).toBe(true);
  });

  it('目标字数低于 1 万应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), targetWords: 9999 });
    expect(result.success).toBe(false);
  });

  it('目标字数超过 500 万应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), targetWords: 5000001 });
    expect(result.success).toBe(false);
  });

  it('目标字数为非整数应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), targetWords: 123.5 });
    expect(result.success).toBe(false);
  });

  it('文风预设为空应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), stylePresetId: '' });
    expect(result.success).toBe(false);
  });

  it('非法 LLM Provider 应失败', () => {
    const result = projectFormSchema.safeParse({ ...makeValidProject(), llmProvider: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('temperature 超出 0-2 范围应失败', () => {
    expect(projectFormSchema.safeParse({ ...makeValidProject(), temperature: -0.1 }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...makeValidProject(), temperature: 2.1 }).success).toBe(false);
  });

  it('topP 超出 0-1 范围应失败', () => {
    expect(projectFormSchema.safeParse({ ...makeValidProject(), topP: 1.1 }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...makeValidProject(), topP: -0.1 }).success).toBe(false);
  });
});

describe('validators/worldviewFormSchema', () => {
  it('合法数据应通过且可选字段存在默认值', () => {
    const result = worldviewFormSchema.safeParse({ worldStructure: '这是一个超过十个字的完整世界架构设定' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.powerSystem).toBe('');
      expect(result.data.rules).toEqual([]);
    }
  });

  it('世界架构少于 10 字应失败', () => {
    const result = worldviewFormSchema.safeParse({ worldStructure: '太短' });
    expect(result.success).toBe(false);
  });

  it('规则的非法元素应被校验', () => {
    // rules 为字符串数组，非字符串元素会失败
    const result = worldviewFormSchema.safeParse({
      worldStructure: '这是一个足够长度的世界架构设定文本',
      rules: ['合法规则', 123 as unknown as string],
    });
    expect(result.success).toBe(false);
  });
});

describe('validators/characterFormSchema', () => {
  function makeValidCharacter() {
    return {
      name: '林玄',
      role: 'protagonist',
      appearance: '白衣胜雪',
      personality: '坚韧不拔，重情重义，嫉恶如仇',
      catchphrase: '天无绝人之路',
    };
  }

  it('合法数据应通过校验', () => {
    const result = characterFormSchema.safeParse(makeValidCharacter());
    expect(result.success).toBe(true);
  });

  it('姓名为空应失败', () => {
    expect(characterFormSchema.safeParse({ ...makeValidCharacter(), name: '' }).success).toBe(false);
  });

  it('姓名超过 20 字应失败', () => {
    expect(characterFormSchema.safeParse({ ...makeValidCharacter(), name: '长'.repeat(21) }).success).toBe(false);
  });

  it('非法角色应失败', () => {
    expect(characterFormSchema.safeParse({ ...makeValidCharacter(), role: 'npc' }).success).toBe(false);
  });

  it('性格描述少于 10 字应失败', () => {
    expect(characterFormSchema.safeParse({ ...makeValidCharacter(), personality: '太短' }).success).toBe(false);
  });

  it('可选字段应存在默认值', () => {
    const result = characterFormSchema.safeParse(makeValidCharacter());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appearance).toBe('白衣胜雪');
      expect(result.data.catchphrase).toBe('天无绝人之路');
      expect(result.data.background).toBe('');
      expect(result.data.motivation).toBe('');
      expect(result.data.weakness).toBe('');
      expect(result.data.growthArc).toBe('');
      expect(result.data.speechStyle).toBe('');
      expect(result.data.behaviorPattern).toBe('');
    }
  });
});

describe('validators/options', () => {
  it('题材选项应包含全部 genre', () => {
    expect(GENRE_OPTIONS.map((g) => g.value)).toEqual([
      '玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他',
    ]);
  });

  it('Provider 选项应包含四家厂商（gemini 为主）', () => {
    expect(PROVIDER_OPTIONS.map((p) => p.value)).toEqual(['gemini', 'zhipu', 'deepseek', 'qwen']);
  });
});