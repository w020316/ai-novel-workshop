// ============================================================================
// 投稿合规体检测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { checkContentCompliance } from './check';

describe('checkContentCompliance', () => {
  it('干净正文：高分且通过', () => {
    const content = `她推开门，屋檐下的灯笼在夜风里晃了一晃。
“找到了吗？”老张压低嗓音问。
我没有答，只是把怀里那个沾了灰的木匣子搁上桌。匣盖一开，里面是一卷发黄的信。
屋里安静了几息。
就在这时，巷口忽然响起一阵急促的马蹄声。
“追来了。”我挡住光线，“快走。”`;

    const report = checkContentCompliance(content);
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.passed).toBe(true);
    expect(report.categories).not.toHaveLength(0);
  });

  it('高危内容：强制不通过且给出“必改”优先级', () => {
    const content = '他转身就走，还甩下一句话：“这笔钱是给庄家的，开盘口的人你都认得。”\n有人低声说“押海洛因的货”。';
    const report = checkContentCompliance(content);
    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(70);
    const danger = report.categories.find((c) => c.status === 'danger');
    expect(danger).toBeDefined();
    expect(report.priorities.some((p) => p.startsWith('必改'))).toBe(true);
  });

  it('广告引流：标记需处理', () => {
    const content = '想了解更多请加微信 abc123。本文同步发布在我的公众号。';
    const report = checkContentCompliance(content);
    const ad = report.categories.find((c) => c.id === 'ad_spam');
    expect(ad).toBeDefined();
    expect(ad!.status).toBe('warn');
    expect(ad!.count).toBeGreaterThan(0);
  });

  it('格式残留：识别 Markdown / 占位符 / AI 自报', () => {
    const content = '**重点**\n# 标题\n这里还有 ![图]()\n待补充：TODO\n作为一个AI助手，我无法…';
    const report = checkContentCompliance(content);
    const format = report.categories.find((c) => c.id === 'format_residue');
    expect(format).toBeDefined();
    expect(format!.count).toBeGreaterThanOrEqual(2);
  });

  it('AI 痕迹密度：明显 AI 味时降分并提示去AI味', () => {
    const filler = '他笑了笑，缓缓点了点头，轻声说道：“原来如此。”\n'.repeat(20);
    const content = '夜幕降临，风雨欲来。' + filler;
    const report = checkContentCompliance(content);
    const ai = report.categories.find((c) => c.id === 'ai_trace');
    expect(ai).toBeDefined();
    expect(ai!.status).toBe('warn');
    expect(ai!.count).toBeGreaterThan(0);
  });

  it('过短章节：给出尺度过短建议', () => {
    const content = '他看了一眼。走了。';
    const report = checkContentCompliance(content);
    const scale = report.categories.find((c) => c.id === 'chapter_scale');
    expect(scale).toBeDefined();
    expect(scale!.status).toBe('warn');
    expect(scale!.examples.some((e) => e.includes('偏短'))).toBe(true);
  });

  it('空内容：0 分且不通过', () => {
    const report = checkContentCompliance('   ');
    expect(report.score).toBe(0);
    expect(report.passed).toBe(false);
  });
});