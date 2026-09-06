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

import { generateWorldviewWithLLM, refineWorldviewWithSummary } from './worldview';

const input = { projectId: 'p1', genre: '玄幻' as const, title: '星河黎明', summary: '灵气复苏与星辰修道' };

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

describe('generateWorldviewWithLLM', () => {
  it('解析正常 JSON 并返回完整世界观（未锁定、含 projectId）', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          worldStructure: '九层天穹的星辰修真界',
          powerSystem: '引气→凝星→御辰，三星阶',
          geography: '东神洲、北冥星海',
          era: '星辰暗淡的灵气末法纪元',
          factions: '星辰宗、太虚盟、邪星门',
          rules: ['每晋升一阶需渡星劫', '星辰之力需以媒介稳固'],
        })
      )
    );

    const wv = await generateWorldviewWithLLM(input);
    expect(wv.projectId).toBe('p1');
    expect(wv.locked).toBe(false);
    expect(wv.worldStructure).toBe('九层天穹的星辰修真界');
    expect(wv.powerSystem).toContain('引气');
    expect(wv.rules).toHaveLength(2);
    expect(wv.id.startsWith('wv')).toBe(true);
  });

  it('支持 ```json 围栏包裹的返回', async () => {
    chatMock.mockResolvedValue(
      chatResult('```json\n{"worldStructure":"围栏包裹的世界","rules":["规则A"]}\n```')
    );
    const wv = await generateWorldviewWithLLM(input);
    expect(wv.worldStructure).toBe('围栏包裹的世界');
  });

  it('缺失字段用本地题材模板补齐，核心字段以 LLM 为准', async () => {
    chatMock.mockResolvedValue(
      chatResult(JSON.stringify({ worldStructure: 'LLM 主架构' }))
    );
    const wv = await generateWorldviewWithLLM(input);
    // 核心字段来自 LLM
    expect(wv.worldStructure).toBe('LLM 主架构');
    // 缺失字段补齐为玄幻模板内容（非空）
    expect(wv.powerSystem.trim().length).toBeGreaterThan(0);
    expect(wv.geography.trim().length).toBeGreaterThan(0);
    expect(wv.rules.length).toBeGreaterThan(0);
  });

  it('rules 只保留去重后的非空条目', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          worldStructure: 'W',
          rules: ['同一条', '同一条', '', '  '],
        })
      )
    );
    const wv = await generateWorldviewWithLLM(input);
    expect(wv.rules).toEqual(['同一条']);
  });

  it('核心字段 worldStructure 缺失时抛出 LLMClientError 供上层回退', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ powerSystem: '只有力量' })));
    await expect(generateWorldviewWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('返回空 / 无效文本时抛出 LLMClientError', async () => {
    chatMock.mockResolvedValue(chatResult('这不是 JSON'));
    await expect(generateWorldviewWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('chat 调用失败时向上抛出', async () => {
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    await expect(generateWorldviewWithLLM(input)).rejects.toBeInstanceOf(ErrorClass);
  });

  it('传入的 prompt 包含题材、书名与简介用于约束生成', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ worldStructure: 'x' })));
    await generateWorldviewWithLLM(input);
    expect(chatMock).toHaveBeenCalledTimes(1);
    const [messages] = chatMock.mock.calls[0] as [{ content?: string }[]];
    const combined = messages.map((m: { content?: string }) => m.content ?? '').join('\n');
    expect(combined).toContain('玄幻');
    expect(combined).toContain('星河黎明');
    expect(combined).toContain('灵气复苏');
  });
});

describe('refineWorldviewWithSummary（按简介完善世界观）', () => {
  const current = {
    worldStructure: '原有世界架构',
    powerSystem: '原有力量体系',
    geography: '原有地理',
    era: '原有时代',
    factions: '原有势力',
    rules: ['规则一'],
  };

  it('返回完善后的字段；LLM 缺失字段用当前值补齐', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          worldStructure: '扩写后的更丰富世界架构，包含三层天穹与星轨法则细节',
          // 其余字段缺失 → 用当前值补齐
          rules: ['规则一', '新增规则二'],
        })
      )
    );
    const result = await refineWorldviewWithSummary({
      projectId: 'p1',
      genre: '玄幻',
      title: '星河黎明',
      summary: '灵气复苏与星辰修道',
      current,
    });
    expect(result.worldStructure).toContain('扩写后');
    expect(result.powerSystem).toBe('原有力量体系');
    expect(result.geography).toBe('原有地理');
    expect(result.era).toBe('原有时代');
    expect(result.factions).toBe('原有势力');
    expect(result.rules).toEqual(['规则一', '新增规则二']);
  });

  it('system prompt 约束「扩写而非缩减、篇幅不少于原文」', async () => {
    chatMock.mockResolvedValue(chatResult(JSON.stringify({ worldStructure: 'x' })));
    await refineWorldviewWithSummary({
      projectId: 'p1',
      genre: '玄幻',
      title: '星河黎明',
      summary: '灵气复苏与星辰修道',
      current,
    });
    const [messages] = chatMock.mock.calls[0] as [{ content?: string }[]];
    const system = messages[0]?.content ?? '';
    expect(system).toContain('扩写而非缩减');
    expect(system).toContain('不得少于原文');
    // user prompt 应携带当前各字段供 AI 在其基础上完善
    const user = messages[1]?.content ?? '';
    expect(user).toContain('原有世界架构');
    expect(user).toContain('规则一');
  });

  it('返回空 / 无效文本时抛出错误', async () => {
    chatMock.mockResolvedValue(chatResult('这不是 JSON'));
    await expect(
      refineWorldviewWithSummary({
        projectId: 'p1',
        genre: '玄幻',
        title: '星河黎明',
        summary: '灵气复苏与星辰修道',
        current,
      })
    ).rejects.toBeInstanceOf(ErrorClass);
  });

  it('chat 调用失败时向上抛出', async () => {
    chatMock.mockRejectedValue(new ErrorClass('LLM 不可用', 503, true));
    await expect(
      refineWorldviewWithSummary({
        projectId: 'p1',
        genre: '玄幻',
        title: '星河黎明',
        summary: '灵气复苏与星辰修道',
        current,
      })
    ).rejects.toBeInstanceOf(ErrorClass);
  });
});