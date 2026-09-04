// ============================================================================
// 一致性自愈 单测（纯函数）
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  aggregateConsistencyIssues,
  buildCharacterFixProposal,
  issueKey,
  topCriticalIssues,
} from './consistency-heal';
import type { ConsistencyReport } from '@/types';

const rep = (chapterId: string, issues: ConsistencyReport['issues']): ConsistencyReport => ({
  chapterId,
  passed: issues.length === 0,
  issues,
  checkedAt: Date.now(),
});

describe('aggregateConsistencyIssues', () => {
  it('空报告返回全零', () => {
    const r = aggregateConsistencyIssues([]);
    expect(r.settingIssues).toEqual([]);
    expect(r.totalIssues).toBe(0);
  });

  it('性格类问题跨章聚合为一条，含命中章与次数', () => {
    const reports = [
      rep('c1', [{ type: 'character', severity: 'error', description: '主角性格前后矛盾', suggestion: '统一人设' }]),
      rep('c2', [{ type: 'character', severity: 'error', description: '主角性格前后矛盾', suggestion: '统一人设' }]),
      rep('c3', [{ type: 'plot', severity: 'warning', description: '剧情节奏拖沓', suggestion: '收紧' }]),
    ];
    const r = aggregateConsistencyIssues(reports);
    expect(r.totalIssues).toBe(3);
    expect(r.settingIssues).toHaveLength(1);
    expect(r.settingIssues[0].count).toBe(2);
    expect(r.settingIssues[0].chapters).toEqual(['c1', 'c2']);
    expect(r.settingIssues[0].maxSeverity).toBe('error');
    expect(r.contentSideCount).toBe(1); // plot 计入正文侧
  });

  it('世界观问题归入设定侧，相似问题去重', () => {
    const reports = [
      rep('c1', [{ type: 'worldview', severity: 'warning', description: '力量体系 上限矛盾', suggestion: '补规则' }]),
      rep('c2', [{ type: 'worldview', severity: 'warning', description: '力量体系 上限矛盾', suggestion: '补规则' }]),
    ];
    const r = aggregateConsistencyIssues(reports);
    expect(r.settingIssues).toHaveLength(1);
    expect(r.settingIssues[0].count).toBe(2);
    expect(r.settingIssues[0].type).toBe('worldview');
  });

  it('error 级多次出现的问题优先排序', () => {
    const reports = [
      rep('c1', [{ type: 'character', severity: 'error', description: 'A问题', suggestion: '' }]),
      rep('c2', [{ type: 'character', severity: 'error', description: 'A问题', suggestion: '' }]),
      rep('c3', [{ type: 'character', severity: 'warning', description: 'B问题', suggestion: '' }]),
    ];
    const r = aggregateConsistencyIssues(reports);
    // A 命中 2 次 error 在最前
    expect(r.settingIssues[0].description).toBe('A问题');
    expect(r.settingIssues[0].maxSeverity).toBe('error');
  });
});

describe('buildCharacterFixProposal / topCriticalIssues / issueKey', () => {
  it('生成可复制的人物修订建议', () => {
    const reports = [
      rep('c1', [{ type: 'character', severity: 'error', description: '主角性格前后矛盾', suggestion: '统一为冷静沉着' }]),
      rep('c2', [{ type: 'character', severity: 'error', description: '主角性格前后矛盾', suggestion: '统一为冷静沉着' }]),
    ];
    const r = aggregateConsistencyIssues(reports);
    const text = buildCharacterFixProposal(r.settingIssues[0]);
    expect(text).toContain('人物一致性修订建议');
    expect(text).toContain('统一为冷静沉着');
    expect(text).toContain('涉及 2 章');
  });

  it('topCriticalIssues 只返回 error 且受 max 限制', () => {
    const reports = [
      rep('c1', [{ type: 'character', severity: 'error', description: 'E1', suggestion: '' }]),
      rep('c2', [{ type: 'character', severity: 'warning', description: 'W1', suggestion: '' }]),
      rep('c3', [{ type: 'character', severity: 'error', description: 'E2', suggestion: '' }]),
    ];
    const r = aggregateConsistencyIssues(reports);
    const top = topCriticalIssues(r, 1);
    expect(top.length).toBe(1);
    expect(top[0].maxSeverity).toBe('error');
  });

  it('issueKey 忽略空白差异', () => {
    expect(issueKey({ type: 'character', description: '主 角 矛 盾' })).toBe(
      issueKey({ type: 'character', description: '主角矛盾' })
    );
  });
});