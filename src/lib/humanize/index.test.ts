// ============================================================================
// 去AI味重写 测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { humanizeChapter } from './index';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));

describe('humanizeChapter（定点修复 spot-fix）', () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it('无 AI 痕迹时不做 LLM 调用，直接返回原文', async () => {
    const clean = '刀光闪过，李默侧身避开。';
    const res = await humanizeChapter({ content: clean });
    expect(res.changed).toBe(false);
    expect(res.content).toBe(clean);
    expect(res.spots).toEqual([]);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('定点修复：仅改写命中句，未命中部分原样保留', async () => {
    const dirty =
      '他笑了笑，缓缓说道：“这事就这样吧。”刀光闪过，李默侧身避开。';
    chatMock.mockResolvedValue({
      content: JSON.stringify({ '1': '他抬了下下巴：“这事就定了。”' }),
    });

    const res = await humanizeChapter({ content: dirty, title: '试', chapterNo: 3 });
    expect(res.changed).toBe(true);
    expect(res.mode).toBe('spot');
    expect(res.spots).toHaveLength(1);
    expect(res.spots[0].original).toContain('笑了笑');
    expect(res.spots[0].rewritten).toContain('定了');
    expect(res.content).toContain('这事就定了');
    // 未命中句原样保留（spot-fix 不重写整章）
    expect(res.content).toContain('刀光闪过，李默侧身避开。');
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('定点修复 JSON 解析失败时自动降级为整章重写', async () => {
    const dirty = '他笑了笑，缓缓说道：“这事就这样吧。”';
    chatMock
      .mockResolvedValueOnce({ content: '这不是合法 JSON 的返回' })
      .mockResolvedValueOnce({ content: '他抬了下下巴：“这事就定了。”' });

    const res = await humanizeChapter({ content: dirty });
    expect(res.changed).toBe(true);
    expect(res.mode).toBe('full');
    expect(res.content).toContain('定了');
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it('LLM 抛错时安全返回原稿', async () => {
    const dirty = '他点了点头，缓缓说道：“嗯。”';
    chatMock.mockRejectedValue(new Error('network'));
    const res = await humanizeChapter({ content: dirty });
    expect(res.changed).toBe(false);
    expect(res.content.trim()).toBe(dirty.trim());
  });

  it('full 模式下 LLM 返回空或未改动时返回原稿', async () => {
    const dirty = '他缓缓抬起手，默默看了一眼。';
    chatMock.mockResolvedValue({ content: dirty }); // 判定为未改动
    const res = await humanizeChapter({ content: dirty, mode: 'full' });
    expect(res.changed).toBe(false);
    expect(res.content).toBe(dirty);
  });

  it('定点修复超过上限时均匀抽样限量发送', async () => {
    // 构造 60 个命中句，验证单次发送不超过 40 句
    const dirty = Array.from({ length: 60 }, () => '他笑了笑。').join('');
    chatMock.mockResolvedValue({ content: JSON.stringify({ '1': '他嘴角一勾。' }) });

    const res = await humanizeChapter({ content: dirty });
    expect(res.changed).toBe(true);
    expect(res.mode).toBe('spot');
    // 首次调用（spot）发送的待改写句子不超过上限
    const firstPrompt = chatMock.mock.calls[0][0][1].content as string;
    const numbered = firstPrompt.match(/^\d+\. /gm) ?? [];
    expect(numbered.length).toBeGreaterThan(0);
    expect(numbered.length).toBeLessThanOrEqual(40);
    // 抽样命中的句子被定点替换
    expect(res.content).toContain('他嘴角一勾。');
  });

  it('传入叙述者人格时，spot 与 full 降级的 system prompt 均注入人格约束', async () => {
    const dirty = '他笑了笑，缓缓说道：“这事就这样吧。”刀光闪过，李默侧身避开。';
    // spot 成功
    chatMock.mockResolvedValueOnce({
      content: JSON.stringify({ '1': '他抬了下下巴：“这事就定了。”' }),
    });

    const persona = {
      id: 'persona-poison',
      name: '毒舌编辑',
      summary: '犀利叙述者',
      narration: '叙述带刺但精准',
      dialogue: '台词短、快、带钩子',
      emotion: '情绪靠反差演',
      avoid: '抒情排比、书面腔',
    };

    const res = await humanizeChapter({ content: dirty, persona });
    expect(res.changed).toBe(true);
    const spotSystem = chatMock.mock.calls[0][0][0].content as string;
    expect(spotSystem).toContain('叙述者人格');
    expect(spotSystem).toContain('毒舌编辑');
    expect(spotSystem).toContain('叙述带刺但精准');

    // spot 失败降级 full：system prompt 同样带人格
    chatMock.mockReset();
    chatMock
      .mockResolvedValueOnce({ content: '非法 JSON' })
      .mockResolvedValueOnce({ content: '他抬了下下巴：“这事就定了。”' });
    await humanizeChapter({ content: dirty, persona });
    const fullSystem = chatMock.mock.calls[1][0][0].content as string;
    expect(fullSystem).toContain('叙述者人格');
    expect(fullSystem).toContain('毒舌编辑');
  });

  it('未传人格时 system prompt 保持原样（不含人格块）', async () => {
    const dirty = '他笑了笑，缓缓说道：“这事就这样吧。”';
    chatMock.mockResolvedValue({ content: JSON.stringify({ '1': '他抬了下下巴：“定了。”' }) });
    await humanizeChapter({ content: dirty });
    const system = chatMock.mock.calls[0][0][0].content as string;
    expect(system).not.toContain('叙述者人格');
  });
});
