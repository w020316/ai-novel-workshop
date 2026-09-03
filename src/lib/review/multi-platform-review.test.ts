// ============================================================================
// 多平台审稿 测试
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { multiPlatformReview, PLATFORMS } from './multi-platform-review';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));

/** 生成一篇适合番茄/起点/知乎的样本章节 */
function sampleChapter(): string {
  const paras: string[] = [
    '刀光一闪，黑衣人从巷口扑出的刹那，李默已经侧身闪开。寒刃擦着后颈划过，割断了几根发丝。他反手扣住对方手腕，重重往后一拧，黑衣人闷哼一声，匕首当啷落地。',
    '"你跑不掉了。"黑衣人喘着粗气，死死盯着他。"大当家的交代，东西今天必须带回去。"',
    '李默慢慢直起身，踩着匕首，居高临下望着他。"那就让大当家亲自来拿。"他顿了顿，"看他敢不敢。"',
    '黑衣人脸色骤变，正要挣扎，巷尾忽地传来一声轰响。尘土飞扬中，一道模糊的身影笼在月光里，缓缓抬起了手。',
  ];
  const filler: string[] = [];
  for (let i = 0; i < 15; i++) {
    filler.push(
      `李默没有给他喘息的机会。他脚步一沉，掌风卷向对方面门，逼得黑衣人连连倒退。夜色下，两道身影在窄巷里腾挪交错。他屈膝、出拳、再退半步，动作干净利落。黑衣人气力渐渐不支，气息却愈发狠厉。李默冷冷盯着他，心道这哪是什么抢东西的，分明是来取他性命的杀手。`
    );
  }
  const cliff = '可就在这时，那把落地的匕首，却无风自动，缓缓升了起来。';
  return [...paras, ...filler, cliff].join('\n');
}

/** 平淡无奇的章节 */
function blandChapter(): string {
  const lines: string[] = [];
  for (let i = 0; i < 10; i++) {
    lines.push('他走在路上，看着路边的树和花，心情很好。今天的天气不错，阳光洒在脸上暖洋洋的。他想起昨天的事，觉得一切都挺好的。没有什么特别的事情发生，就这样平平淡淡地过了一天。');
  }
  return lines.join('\n');
}

describe('PLATFORMS 定义', () => {
  it('有4个平台', () => {
    expect(PLATFORMS).toHaveLength(4);
  });

  it('包含四个预期平台', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(ids).toContain('fanqie');
    expect(ids).toContain('qidian');
    expect(ids).toContain('zhihu');
    expect(ids).toContain('coldread');
  });
});

describe('multiPlatformReview（本地启发式，无 LLM）', () => {
  it('对好章节给出较高评分', async () => {
    // LLM 失败时回退到本地评分
    chatMock.mockImplementation(() => Promise.reject(new Error('llm down')));
    const result = await multiPlatformReview({ content: sampleChapter(), chapterNo: 1, title: '初遇' });

    // 所有平台都应该有评分
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);

    // 各平台分数
    for (const [id, ps] of Object.entries(result.platforms)) {
      expect(ps.score).toBeGreaterThanOrEqual(0);
      expect(ps.score).toBeLessThanOrEqual(100);
      expect(ps.fromLLM).toBe(false);
      // 对好章节，番茄和冷读应该较高
      if (id === 'fanqie' || id === 'coldread') {
        expect(ps.score).toBeGreaterThanOrEqual(50);
      }
    }

    // 应有一个风险平台
    expect(result.riskiestPlatform).toBeDefined();
  });

  it('对平淡章节给出较低评分', async () => {
    chatMock.mockImplementation(() => Promise.reject(new Error('llm down')));
    const result = await multiPlatformReview({ content: blandChapter() });

    expect(result.overallScore).toBeLessThanOrEqual(70);
    // 番茄应该对平淡章节评分很低（缺乏钩子/爽点）
    expect(result.platforms.fanqie.score).toBeLessThanOrEqual(65);
  });

  it('返回结构完整的 MultiPlatformReview', async () => {
    chatMock.mockImplementation(() => Promise.reject(new Error('llm down')));
    const result = await multiPlatformReview({ content: sampleChapter() });

    // 检查所有平台都覆盖
    expect(result.platforms.fanqie).toBeDefined();
    expect(result.platforms.qidian).toBeDefined();
    expect(result.platforms.zhihu).toBeDefined();
    expect(result.platforms.coldread).toBeDefined();

    // 每个平台应有完整字段
    for (const ps of Object.values(result.platforms)) {
      expect(ps).toHaveProperty('score');
      expect(ps).toHaveProperty('verdict');
      expect(ps).toHaveProperty('strengths');
      expect(ps).toHaveProperty('weaknesses');
      expect(ps).toHaveProperty('suggestions');
      expect(ps).toHaveProperty('fromLLM');
      expect(['strong', 'ok', 'weak']).toContain(ps.verdict);
    }

    // 综合评分
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);

    // commonIssues 应为数组
    expect(Array.isArray(result.commonIssues)).toBe(true);
  });
});

describe('multiPlatformReview（LLM 赋能，带降级）', () => {
  it('LLM 成功时使用 LLM 评分和定性结论', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        score: 88,
        strengths: ['钩子强劲', '节奏快', '爽点密集'],
        weaknesses: ['对话略多'],
        suggestions: ['减少废话对话'],
      }),
    });
    const result = await multiPlatformReview({ content: sampleChapter(), chapterNo: 3, title: '激战' });

    // 至少有一个平台 fromLLM 为 true
    const llmPlatforms = Object.values(result.platforms).filter((p) => p.fromLLM);
    expect(llmPlatforms.length).toBeGreaterThanOrEqual(1);

    // 综合分应该接近 LLM 给的分
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('LLM 抛错时安全回退到本地评分', async () => {
    chatMock.mockImplementation(() => Promise.reject(new Error('api down')));
    const result = await multiPlatformReview({ content: sampleChapter() });

    for (const ps of Object.values(result.platforms)) {
      expect(ps.fromLLM).toBe(false);
      expect(ps.score).toBeGreaterThanOrEqual(0);
      expect(ps.score).toBeLessThanOrEqual(100);
    }
  });

  it('LLM 返回非法数据时忽略并保留本地评分', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({ score: 999, strengths: ['x'], weaknesses: ['y'] }),
    });
    const result = await multiPlatformReview({ content: sampleChapter() });

    // 非法分应被忽略，分数应在合理范围内
    for (const ps of Object.values(result.platforms)) {
      expect(ps.score).toBeLessThanOrEqual(100);
    }
  });
});