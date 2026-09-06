import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock, ErrorClass } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  ErrorClass: class LLMClientErrorMock extends Error {
    statusCode = 0;
    retryable = false;
    constructor(message: string, statusCode = 0, retryable = false) {
      super(message);
      this.statusCode = statusCode;
      this.retryable = retryable;
    }
  },
}));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
  LLMClientError: ErrorClass,
}));

import {
  generateCharacterWithLLM,
  generateCharacterFromInspiration,
  extractInspirationKeywords,
  sanitizeCharacterName,
} from './character';

const input = {
  projectId: 'p1',
  name: '',
  keywords: '冷酷剑修 孤独 复仇',
  role: 'protagonist' as const,
  genre: '玄幻' as const,
};

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateCharacterWithLLM', () => {
  it('解析正常 JSON 并返回完整人物档案（未锁定、roles 关联）', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          name: '洛渊',
          appearance: '一袭玄衣，眉目清冷',
          personality: '隐忍而决绝，对旧事绝口不提',
          catchphrase: '剑在，人在。',
          background: '没落世族遗孤',
          motivation: '为师复仇，重振门楣',
          weakness: '触及旧事时易冲动',
          growthArc: '从独行到执剑护道',
          speechStyle: '惜字如金',
          behaviorPattern: '遇险先以剑开路',
        })
      )
    );

    const c = await generateCharacterWithLLM(input);
    expect(c.projectId).toBe('p1');
    expect(c.role).toBe('protagonist');
    expect(c.locked).toBe(false);
    expect(c.name).toBe('洛渊');
    expect(c.personality).toContain('隐忍');
    expect(c.catchphrase).toBe('剑在，人在。');
    expect(c.relationships).toEqual([]);
    expect(c.id.startsWith('char')).toBe(true);
  });

  it('姓名缺失时用 LLM 返回解析，LLM 也未给姓名则由模板补齐非空', async () => {
    chatMock.mockResolvedValue(
      chatResult(JSON.stringify({ personality: '沉稳而孤傲的性格描述' }))
    );
    const c = await generateCharacterWithLLM(input);
    expect(c.personality).toBe('沉稳而孤傲的性格描述');
    expect(c.name.trim().length).toBeGreaterThan(0);
    // 缺失字段补齐为模板内容（非空）
    expect(c.appearance.trim().length).toBeGreaterThan(0);
    expect(c.background.trim().length).toBeGreaterThan(0);
  });

  it('核心字段 personality 缺失时抛出 LLMClientError 供上层回退', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ name: '无名氏' })));
    await expect(generateCharacterWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('无效文本 / chat 失败时向上抛出', async () => {
    chatMock.mockResolvedValue(chatResult('no json'));
    await expect(generateCharacterWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    await expect(generateCharacterWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('prompt 包含角色定位、关键词、姓名与题材', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ personality: 'x' })));
    await generateCharacterWithLLM(input);
    const [messages] = chatMock.mock.calls[0] as [{ content?: string }[]];
    const combined = messages.map((m: { content?: string }) => m.content ?? '').join('\n');
    expect(combined).toContain('主角');
    expect(combined).toContain('冷酷剑修');
    expect(combined).toContain('玄幻');
  });
});

describe('sanitizeCharacterName', () => {
  it('去掉括号附注（原名等说明）', () => {
    expect(sanitizeCharacterName('寂灭者（原名：虚空行者·赫尔墨斯）')).toBe('寂灭者');
    expect(sanitizeCharacterName('沈凌霄(别名:剑魔)')).toBe('沈凌霄');
    expect(sanitizeCharacterName('叶红绫【药谷传人】')).toBe('叶红绫');
  });

  it('去掉引号包裹与破折号补充说明', () => {
    expect(sanitizeCharacterName('"沈凌霄"')).toBe('沈凌霄');
    expect(sanitizeCharacterName('沈凌霄——化身暗影的少年')).toBe('沈凌霄');
  });

  it('超过 12 字截断；空名返回空串交由模板兜底', () => {
    expect(sanitizeCharacterName('一个特别长的名字超过十二个字了')).toBe(
      '一个特别长的名字超过十二个字'.slice(0, 12)
    );
    expect(sanitizeCharacterName('   ')).toBe('');
  });

  it('LLM 返回带附注的姓名时档案使用清洗后的名字', async () => {
    chatMock.mockResolvedValue(
      chatResult(JSON.stringify({ name: '寂灭者（原名：虚空行者）', personality: '疯狂偏执' }))
    );
    const c = await generateCharacterWithLLM(input);
    expect(c.name).toBe('寂灭者');
  });
});

describe('extractInspirationKeywords', () => {
  it('按标点与空白切分短语，去重并限量 6 个', () => {
    expect(extractInspirationKeywords('废柴少年 觉醒古镜，复仇！废柴少年、隐藏血脉')).toEqual([
      '废柴少年',
      '觉醒古镜',
      '复仇',
      '隐藏血脉',
    ]);
  });

  it('过滤单字与超长短语，空文本返回空数组', () => {
    expect(extractInspirationKeywords('剑 歌')).toEqual([]);
    expect(
      extractInspirationKeywords('一个超过十个字的长短语片段不应被收录比如这句就是')
    ).toEqual([]);
    expect(extractInspirationKeywords('   ')).toEqual([]);
  });
});

describe('generateCharacterFromInspiration', () => {
  const ideaInput = {
    genre: '玄幻',
    summary: '废柴少年 觉醒古镜 踏上复仇路',
    role: 'protagonist' as const,
  };

  it('LLM 成功：返回字段齐备的草稿，fromLLM 为 true，relationships 留空', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          name: '洛无咎',
          role: 'antagonist',
          appearance: '玄衣负手，眉间一道旧疤',
          personality: '隐忍狠戾，笑里藏刀',
          catchphrase: '镜中人，你说谎。',
          background: '古镜之灵',
          motivation: '吞噬气运，重塑真身',
          weakness: '惧怕本心',
          growthArc: '从器灵到魔主',
          speechStyle: '古雅反问',
          behaviorPattern: '借人之手，从不亲自动手',
        })
      )
    );
    const d = await generateCharacterFromInspiration(ideaInput);
    expect(d.fromLLM).toBe(true);
    expect(d.name).toBe('洛无咎');
    expect(d.role).toBe('antagonist');
    expect(d.personality).toContain('隐忍');
    expect(d.relationships).toEqual([]);
  });

  it('LLM 返回非法 role 时回落传入的 role', async () => {
    chatMock.mockResolvedValue(
      chatResult(JSON.stringify({ name: '某人', role: 'boss', personality: '沉稳老练的角色' }))
    );
    const d = await generateCharacterFromInspiration(ideaInput);
    expect(d.role).toBe('protagonist');
  });

  it('chat 失败：确定性降级不抛错，personality/motivation 含灵感关键词，fromLLM 为 false', async () => {
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    const d = await generateCharacterFromInspiration(ideaInput);
    expect(d.fromLLM).toBe(false);
    expect(d.role).toBe('protagonist');
    expect(d.personality).toContain('废柴少年');
    expect(d.motivation).toContain('觉醒古镜');
    // 其余字段由模板兜底，保证草稿齐备可微调
    expect(d.appearance?.trim().length).toBeGreaterThan(0);
    expect(d.speechStyle?.trim().length).toBeGreaterThan(0);
  });

  it('非法 JSON 输出：同样走降级路径', async () => {
    chatMock.mockResolvedValue(chatResult('no json'));
    const d = await generateCharacterFromInspiration(ideaInput);
    expect(d.fromLLM).toBe(false);
    expect(d.personality).toContain('废柴少年');
  });

  it('灵感文本优先取 summary 而非 ideaText', async () => {
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    const d = await generateCharacterFromInspiration({
      genre: '科幻',
      summary: '灵气复苏',
      ideaText: '星际迷航',
      role: 'supporting',
    });
    expect(d.fromLLM).toBe(false);
    expect(d.role).toBe('supporting');
    expect(d.personality).toContain('灵气复苏');
    expect(d.personality).not.toContain('星际迷航');
  });

  it('prompt 包含题材、灵感文本与角色定位', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ personality: '果敢坚毅的冒险者' })));
    await generateCharacterFromInspiration(ideaInput);
    const [messages] = chatMock.mock.calls[0] as [{ content?: string }[]];
    const combined = messages.map((m: { content?: string }) => m.content ?? '').join('\n');
    expect(combined).toContain('玄幻');
    expect(combined).toContain('废柴少年');
    expect(combined).toContain('主角');
  });

  it('summary 与 ideaText 均为空时仍降级产出可用草稿', async () => {
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    const d = await generateCharacterFromInspiration({ role: 'minor' });
    expect(d.fromLLM).toBe(false);
    expect(d.role).toBe('minor');
    expect(d.personality?.trim().length).toBeGreaterThan(0);
    expect(d.motivation?.trim().length).toBeGreaterThan(0);
  });
});