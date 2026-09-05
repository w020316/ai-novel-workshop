import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}));

import { chat } from '@/lib/llm/client';
import {
  heuristicBookPackage,
  generateBookPackage,
  bookPackageToSummary,
  type BookPackage,
} from './book-package';

const mockChat = vi.mocked(chat);

beforeEach(() => {
  mockChat.mockReset();
});

describe('heuristicBookPackage', () => {
  it('灵感关键词推断题材与金手指', () => {
    const bp = heuristicBookPackage('赘婿被岳家羞辱，实际是隐藏大佬');
    expect(bp.genre).toBe('都市');
    expect(bp.goldenFinger).toContain('身份反差');
    expect(bp.fromLLM).toBe(false);
    expect(bp.mainConflict.length).toBeGreaterThan(0);
    expect(bp.longHook.length).toBeGreaterThan(0);
    expect(bp.worldviewSeed).toContain('都市');
  });

  it('无法识别题材时回落玄幻与通用模板，不抛错', () => {
    const bp = heuristicBookPackage('随便写写');
    expect(bp.genre).toBe('玄幻');
    expect(bp.goldenFinger).toContain('独门天赋');
    expect(bp.title.length).toBeGreaterThan(0);
  });

  it('书名从灵感首段提取且限长', () => {
    const bp = heuristicBookPackage('星际流浪者，飞船 AI 觉醒');
    expect(bp.title).toBe('星际流浪者');
    expect(bp.titleAlternatives.length).toBeGreaterThan(0);
  });

  it('纯函数确定性：同输入同输出', () => {
    const idea = '系统签到百年，我成了幕后黑手';
    expect(heuristicBookPackage(idea)).toEqual(heuristicBookPackage(idea));
  });
});

describe('generateBookPackage', () => {
  it('LLM 可用：返回 LLM 开书包并校验题材白名单', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        title: '签到百年',
        titleAlternatives: ['幕后签到', '百年守护'],
        genre: '都市',
        summary: '签到百年后，守护的家族陷落，他终于出手。',
        goldenFinger: '签到系统：每日获得一份奖励',
        mainConflict: '隐藏守护者 VS 幕后搅局势力',
      }),
    } as never);

    const bp = await generateBookPackage('系统签到百年，我成了幕后黑手');
    expect(bp.fromLLM).toBe(true);
    expect(bp.title).toBe('签到百年');
    expect(bp.genre).toBe('都市');
    expect(bp.titleAlternatives).toEqual(['幕后签到', '百年守护']);
    // LLM 未给 longHook/worldviewSeed → 回落启发式补位
    expect(bp.longHook).toContain('系统背后的真正目的');
  });

  it('LLM 产出题材不在白名单 → 整包退回启发式', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        title: '某书',
        genre: '轻小说',
        summary: 'x',
        goldenFinger: 'y',
        mainConflict: 'z',
      }),
    } as never);
    const bp = await generateBookPackage('都市赘婿故事');
    expect(bp.fromLLM).toBe(false);
    expect(bp.genre).toBe('都市');
  });

  it('LLM 产出缺关键字段 → 整包退回启发式', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({ title: '只有书名' }),
    } as never);
    const bp = await generateBookPackage('末世囤货求生');
    expect(bp.fromLLM).toBe(false);
    expect(bp.genre).toBe('末世');
  });

  it('LLM 失败 → 降级启发式且不抛错', async () => {
    mockChat.mockRejectedValueOnce(new Error('quota exhausted'));
    const bp = await generateBookPackage('修仙宗门废柴逆袭');
    expect(bp.fromLLM).toBe(false);
    expect(bp.genre).toBe('玄幻');
  });

  it('灵感过短（<4 字）不调 LLM 直接启发式', async () => {
    const bp = await generateBookPackage('  试  ');
    expect(bp.fromLLM).toBe(false);
    expect(mockChat).not.toHaveBeenCalled();
  });
});

describe('bookPackageToSummary', () => {
  it('四要素拼接并限长 300', () => {
    const bp: BookPackage = {
      title: '甲',
      titleAlternatives: [],
      genre: '玄幻',
      summary: '简介。',
      goldenFinger: '金指。',
      mainConflict: '冲突。',
      longHook: '钩子。',
      worldviewSeed: '种子。',
      fromLLM: true,
    };
    const s = bookPackageToSummary(bp);
    expect(s).toContain('简介。');
    expect(s).toContain('金手指：金指。');
    expect(s).toContain('主线冲突：冲突。');
    expect(s).toContain('长线钩子：钩子。');
    expect(s.length).toBeLessThanOrEqual(300);
  });
});
