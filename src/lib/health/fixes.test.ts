// ============================================================================
// 健康体检 · AI 完善方案测试（需求 12）
// 覆盖：LLM 成功解析 fixes / LLM 失败降级 suggestion / 非法 JSON 降级 / 空问题短路
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatResult } from '@/lib/llm/client';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));

vi.mock('@/lib/llm/client', () => ({
  chat: chatMock,
}));

import { generateHealthFixes } from './fixes';
import type { HealthIssue } from './health-check';

function chatResult(content: string): ChatResult {
  return {
    content,
    usage: { promptTokens: 10, completionTokens: 20 },
    provider: 'zhipu',
    model: 'glm-4-flash',
  };
}

const issues: HealthIssue[] = [
  {
    dimension: 'foreshadowing',
    severity: 'warning',
    title: '有 2 条伏笔超期未回收',
    detail: '神秘石符的来历（计划回收于第 5 章）',
    suggestion: '在后续章节中按计划回收，避免伏笔烂尾。',
    relatedChapters: [1, 3],
  },
  {
    dimension: 'character',
    severity: 'warning',
    title: '1 位重点角色疑似被遗忘',
    detail: '林渊 已在连续很长篇幅未出场。',
    suggestion: '在近期章节安排其回归或交代去向，防止角色断层。',
  },
];

describe('generateHealthFixes（需求 12：体检问题 AI 完善）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LLM 成功：解析 fixes，数量与问题对应，prompt 含问题标题与上下文', async () => {
    chatMock.mockResolvedValue(
      chatResult(
        JSON.stringify({
          fixes: [
            {
              title: '有 2 条伏笔超期未回收',
              steps: ['在第 8 章插入一段主角与长老的对话，点明神秘石符的来历', '在第 9 章让石符在关键战斗中兑现为翻盘底牌'],
            },
            {
              title: '1 位重点角色疑似被遗忘',
              steps: ['在第 8 章以一封书信交代林渊闭关进度', '在第 10 章安排林渊正面回归并介入主线冲突'],
            },
          ],
        })
      )
    );

    const res = await generateHealthFixes({
      genre: '玄幻',
      issues,
      contextSummary: '书名《问剑》；简介：少年以剑证道；主线：问鼎武道之巅',
    });

    expect(res.fromLLM).toBe(true);
    expect(res.fixes).toHaveLength(2);
    expect(res.fixes[0].title).toBe(issues[0].title);
    expect(res.fixes[0].steps.length).toBeGreaterThanOrEqual(2);
    expect(res.fixes[1].steps[0]).toContain('林渊');

    // prompt 应包含问题标题、相关章节与项目上下文
    const prompt = JSON.stringify(chatMock.mock.calls[0][0]);
    expect(prompt).toContain('有 2 条伏笔超期未回收');
    expect(prompt).toContain('第 1、3 章');
    expect(prompt).toContain('问鼎武道之巅');
    expect(prompt).toContain('玄幻');
  });

  it('LLM 调用失败：降级为每个问题 suggestion 包装的单步方案，fromLLM=false', async () => {
    chatMock.mockRejectedValue(new Error('网络错误'));

    const res = await generateHealthFixes({ genre: '玄幻', issues, contextSummary: '《问剑》' });

    expect(res.fromLLM).toBe(false);
    expect(res.fixes).toHaveLength(2);
    expect(res.fixes[0].title).toBe(issues[0].title);
    expect(res.fixes[0].steps).toEqual([issues[0].suggestion]);
    expect(res.fixes[1].steps).toEqual([issues[1].suggestion]);
  });

  it('LLM 返回非法 JSON：同样降级为 suggestion 单步方案', async () => {
    chatMock.mockResolvedValue(chatResult('这不是 JSON 输出'));

    const res = await generateHealthFixes({ genre: '玄幻', issues, contextSummary: '《问剑》' });

    expect(res.fromLLM).toBe(false);
    expect(res.fixes).toHaveLength(2);
    expect(res.fixes[1].steps[0]).toBe(issues[1].suggestion);
  });

  it('LLM 返回缺字段/脏数据：过滤无效项后若为空则降级', async () => {
    chatMock.mockResolvedValue(
      chatResult(JSON.stringify({ fixes: [{ title: '', steps: [] }, { title: '只有标题' }] }))
    );

    const res = await generateHealthFixes({ genre: '玄幻', issues, contextSummary: '《问剑》' });

    expect(res.fromLLM).toBe(false);
    expect(res.fixes).toHaveLength(2);
    expect(res.fixes[0].steps[0]).toBe(issues[0].suggestion);
  });

  it('无问题清单：直接返回空方案，不调用 LLM', async () => {
    const res = await generateHealthFixes({ genre: '玄幻', issues: [], contextSummary: '' });

    expect(res.fixes).toEqual([]);
    expect(res.fromLLM).toBe(false);
    expect(chatMock).not.toHaveBeenCalled();
  });
});
