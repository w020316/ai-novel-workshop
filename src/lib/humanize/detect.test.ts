// ============================================================================
// AI 痕迹检测器 测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { detectAITraces, summarizeTraces } from './detect';

describe('detectAITraces', () => {
  it('应识别无效空动作与总结式旁白等常见 AI 味', () => {
    const content =
      '他笑了笑，缓缓抬起手，默默看了一眼远处的灯火。' +
      '原来，这一切都是命运的安排。或许，这就是宿命。';
    const report = detectAITraces(content);
    expect(report.totalCount).toBeGreaterThan(0);
    const emptyAction = report.categories.find((c) => c.id === 'empty_action');
    const summary = report.categories.find((c) => c.id === 'summary_narrate');
    expect(emptyAction).toBeDefined();
    expect(emptyAction!.count).toBeGreaterThanOrEqual(3);
    expect(summary).toBeDefined();
    expect(summary!.examples.length).toBeGreaterThan(0);
    expect(report.categories.every((c) => c.examples.length > 0)).toBe(true);
  });

  it('对干净的口语化网文不误报', () => {
    const content =
      '刀光闪过，李默一个侧身避开。"交货的地点在城东，"掌柜压低声音说，"你最好别带太多人。"';
    const report = detectAITraces(content);
    expect(report.flagged).toBe(false);
  });

  it('命中总数达到阈值时标记 flagged，并按次数降序', () => {
    // 大量「笑了笑/点了点头」凑足计数
    const blob = '他笑了笑，她笑了笑，众人笑了笑，师兄笑了笑，师妹笑了笑，师傅笑了笑，掌门笑了笑。';
    const report = detectAITraces(blob);
    expect(report.flagged).toBe(true);
    const counts = report.categories.map((c) => c.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('summarizeTraces 返回人类可读摘要', () => {
    expect(summarizeTraces({ flagged: false, totalCount: 0, categoryCount: 0, categories: [] }))
      .toContain('未发现');
    const report = detectAITraces('他点了点头，缓缓说道："这事就这样吧。"');
    expect(summarizeTraces(report)).toContain('AI 痕迹');
  });
});