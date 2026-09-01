// ============================================================================
// 读者冷读复核 测试
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { localReaderReview, reviewChapter } from './reader-review';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));

const gripping = (): string => {
  // 组装约 1600 字、开篇有钩子、含对话、段尾留悬念的真实章节
  const paras: string[] = [
    '刀光一闪，黑衣人从巷口扑出的刹那，李默已经侧身闪开。寒刃擦着后颈划过，割断了几根发丝。他反手扣住对方手腕，重重往后一拧，黑衣人闷哼一声，匕首当啷落地。',
    '"你跑不掉了。"黑衣人喘着粗气，死死盯着他。"大当家的交代，东西今天必须带回去。"',
    '李默慢慢直起身，踩着匕首，居高临下望着他。"那就让大当家亲自来拿。"他顿了顿，"看他敢不敢。"',
    '黑衣人脸色骤变，正要挣扎，巷尾忽地传来一声轰响。尘土飞扬中，一道模糊的身影笼在月光里，缓缓抬起了手。',
  ];
  // 反复拼接以逼近单章正文字数，仅用于本地评分校准
  const filler: string[] = [];
  for (let i = 0; i < 15; i++) {
    filler.push(
      `李默没有给他喘息的机会。他脚步一沉，掌风卷向对方面门，逼得黑衣人连连倒退。夜色下，两道身影在窄巷里腾挪交错。他屈膝、出拳、再退半步，动作干净利落。黑衣人气力渐渐不支，气息却愈发狠厉。李默冷冷盯着他，心道这哪是什么抢东西的，分明是来取他性命的杀手。`
    );
  }
  const cliff = '可就在这时，那把落地的匕首，却无风自动，缓缓升了起来。';
  return [...paras, ...filler, cliff].join('\n');
};

describe('localReaderReview（确定性，无 LLM）', () => {
  it('对有钩子、断章、均衡篇幅的章节给高分 gripping', () => {
    const r = localReaderReview(gripping());
    expect(r.fromLLM).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.verdict).toBe('gripping');
    expect(r.metrics.hasOpeningHook).toBe(true);
    expect(r.metrics.hasCliffhanger).toBe(true);
    expect(r.metrics.wordCount).toBeGreaterThan(0);
  });

  it('对过短的章节给低分并在 weaknesses 中提示', () => {
    const r = localReaderReview('他突然睁开眼。');
    expect(r.verdict).toBe('dull');
    expect(r.metrics.wordCount).toBeLessThan(800);
    expect(r.weaknesses.some((w) => w.includes('篇幅过短') || w.includes('缺乏钩子'))).toBe(true);
  });

  it('对话占比异常高时给出建议', () => {
    const denseDialogue = Array.from({ length: 20 }, () => '"好吧好吧。"他说。"行。"她答。').join('\n');
    const r = localReaderReview(denseDialogue);
    expect(r.metrics.dialogueRatio).toBeGreaterThan(0.8);
    expect(r.suggestions.some((s) => s.includes('对话'))).toBe(true);
  });
});

describe('reviewChapter（LLM 赋能，带降级）', () => {
  // 不设 beforeEach(chatMock.mockClear/mockReset)：该版本的 vitest 会在
  // beforeEach 清理后，把 mock 内 throw / Promise.reject 产生的错误误判为
  // 未处理错误，导致降级用例误报失败。本文件每个用例都自行用
  // mockResolvedValue / mockImplementation 覆盖实现，无需清理。
  it('LLM 返回合法 JSON 时采用 LLM 评分与建议', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        score: 92,
        strengths: ['钩子够劲', '节奏快'],
        weaknesses: ['配角脸谱化'],
        suggestions: ['给黑衣人加个台词细节'],
      }),
    });
    const r = await reviewChapter({ content: gripping(), chapterNo: 1, title: '初遇' });
    expect(r.fromLLM).toBe(true);
    expect(r.score).toBe(92);
    expect(r.verdict).toBe('gripping');
    expect(r.strengths).toContain('钩子够劲');
  });

  it('LLM 返回带 markdown 围栏的 JSON 也能解析', async () => {
    chatMock.mockResolvedValue({
      content: '```json\n{"score": 75, "weaknesses": ["拖"], "suggestions": ["删减"]}\n```',
    });
    const r = await reviewChapter({ content: gripping() });
    expect(r.score).toBe(75);
    expect(r.weaknesses).toContain('拖');
  });

  it('LLM 抛错时安全回退到本地评分', async () => {
    chatMock.mockImplementation(() => Promise.reject(new Error('api down')));
    const r = await reviewChapter({ content: gripping() });
    expect(r.fromLLM).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('LLM 返回非法评分时忽略并保留本地分', async () => {
    chatMock.mockResolvedValue({ content: JSON.stringify({ score: 999, strengths: ['x'] }) });
    const r = await reviewChapter({ content: gripping() });
    expect(r.score).toBeLessThan(100); // 非法分被忽略
  });
});