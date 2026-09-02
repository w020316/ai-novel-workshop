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

  it('v2 新规则：识别「不是而是」/ 破折号 / 连续了 / 排比堆砌', () => {
    const content = [
      '这不是他不想救，而是来不及了。',
      '风声呼啸——他猛地回头。',
      '他吃了饭，洗了碗，拖了地，睡了觉。',
      '像火，像风，像雷。',
    ].join('\n');
    const report = detectAITraces(content);
    const ids = report.categories.map((c) => c.id);
    expect(ids).toContain('not_but_cliche');
    expect(ids).toContain('dash_abuse');
    expect(ids).toContain('consecutive_le');
    expect(ids).toContain('parallelism_density');
  });

  it('超长段落命中，且位置信息覆盖整段', () => {
    const long = '他挥出一拳。'.repeat(60); // 360 字，超过 350 上限
    const report = detectAITraces(long);
    const lp = report.categories.find((c) => c.id === 'long_paragraph');
    expect(lp).toBeDefined();
    expect(lp!.count).toBe(1);
    expect(lp!.matches[0].start).toBe(0);
    expect(lp!.matches[0].end).toBe(long.length);
  });

  it('每个命中类别都携带位置信息（供定点修复）', () => {
    const content = '他笑了笑，然后转身离开。这不是巧合，而是有人安排。';
    const report = detectAITraces(content);
    expect(report.categories.length).toBeGreaterThan(0);
    for (const cat of report.categories) {
      expect(cat.matches.length).toBeGreaterThan(0);
      for (const m of cat.matches) {
        expect(m.end).toBeGreaterThan(m.start);
        expect(content.slice(m.start, m.end)).toBe(m.text);
      }
    }
  });
});