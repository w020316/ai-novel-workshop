// ============================================================================
// 黄金三章·开篇专项强化 单元测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { goldenThreePrompt, GOLDEN_THREE_CHAPTERS } from './golden-three';

describe('lib/agents/golden-three（黄金三章开篇强化）', () => {
  it('仅前 3 章返回非空 Prompt，其余章号为空串', () => {
    expect(goldenThreePrompt(1)).not.toBe('');
    expect(goldenThreePrompt(2)).not.toBe('');
    expect(goldenThreePrompt(GOLDEN_THREE_CHAPTERS)).not.toBe('');
    expect(goldenThreePrompt(4)).toBe('');
    expect(goldenThreePrompt(0)).toBe('');
    expect(goldenThreePrompt(-1)).toBe('');
    expect(goldenThreePrompt(Number.NaN)).toBe('');
  });

  it('第 1 章：切入点 + 代入感 + 钩子密度三法则齐备', () => {
    const p = goldenThreePrompt(1);
    expect(p).toContain('【黄金三章·开篇专项法则');
    expect(p).toContain('【切入点】');
    expect(p).toContain('【代入感】');
    expect(p).toContain('【钩子密度】');
    expect(p).toContain('前三段内完成');
  });

  it('第 2 章：先给再压 + 金手指亮相', () => {
    const p = goldenThreePrompt(2);
    expect(p).toContain('【先给再压】');
    expect(p).toContain('【金手指亮相】');
  });

  it('第 3 章：第一个小高潮 + 期待升级', () => {
    const p = goldenThreePrompt(3);
    expect(p).toContain('【第一个小高潮】');
    expect(p).toContain('【期待升级】');
  });

  it('每章块都含借鉴高成绩开头结构但严禁照抄的约束', () => {
    for (const n of [1, 2, 3]) {
      const p = goldenThreePrompt(n);
      expect(p).toContain('借鉴同题材高成绩作品');
      expect(p).toContain('严禁照抄');
    }
  });
});
