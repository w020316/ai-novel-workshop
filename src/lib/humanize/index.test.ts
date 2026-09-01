// ============================================================================
// 去AI味重写 测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { humanizeChapter } from './index';
import { detectAITraces } from './detect';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));

describe('humanizeChapter', () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it('无 AI 痕迹时不做 LLM 调用，直接返回原文', async () => {
    const clean = '刀光闪过，李默侧身避开。';
    const res = await humanizeChapter({ content: clean });
    expect(res.changed).toBe(false);
    expect(res.content).toBe(clean);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('有痕迹且 LLM 改写成功时返回改写稿', async () => {
    const dirty = '他笑了笑，缓缓说道："这事就这样吧。"';
    chatMock.mockResolvedValue({ content: '他抬了下下巴："这事就定了。"' });

    const res = await humanizeChapter({ content: dirty, title: '试', chapterNo: 3 });
    expect(res.changed).toBe(true);
    expect(res.content).toContain('定了');
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('LLM 抛错时安全返回原稿', async () => {
    const dirty = detectAITraces('他点了点头，缓缓说道："嗯。"').totalCount
      ? '他点了点头，缓缓说道："嗯。"'
      : '他笑了笑，默默点了点头。';
    chatMock.mockRejectedValue(new Error('network'));
    const res = await humanizeChapter({ content: dirty });
    expect(res.changed).toBe(false);
    expect(res.content.trim()).toBe(dirty.trim());
  });

  it('LLM 返回空或未改动时返回原稿', async () => {
    const dirty = '他缓缓抬起手，默默看了一眼。';
    chatMock.mockResolvedValue({ content: dirty }); // 判定为未改动
    const res = await humanizeChapter({ content: dirty });
    expect(res.changed).toBe(false);
    expect(res.content).toBe(dirty);
  });
});