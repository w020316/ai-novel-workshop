import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  chat: vi.fn(),
}));

import { chat } from '@/lib/llm/client';
import {
  heuristicBookPackage,
  generateBookPackage,
  bookPackageToSummary,
  bookPackageOriginalityText,
  checkBookPackageOriginality,
  type BookPackage,
} from './book-package';
import { WORKS_DB } from '@/lib/originality/works-db';

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

  it('注入 avoidancePrompt：写入用户消息用于原创性规避', async () => {
    mockChat.mockResolvedValueOnce({
      content: JSON.stringify({
        title: '差异新书',
        genre: '都市',
        summary: '简介',
        goldenFinger: '金指',
        mainConflict: '冲突',
      }),
    } as never);
    await generateBookPackage('都市逆袭故事', { avoidancePrompt: '【原创性要求·请务必遵守】不要复刻《某书》' });
    const userMsg = mockChat.mock.calls[0][0].find((m) => m.role === 'user');
    expect(userMsg?.content).toContain('【原创性要求·请务必遵守】');
    expect(userMsg?.content).toContain('差异化创新');
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

describe('bookPackageOriginalityText / checkBookPackageOriginality', () => {
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

  it('查重文本覆盖开书包六个要素', () => {
    const t = bookPackageOriginalityText(bp);
    for (const part of [bp.title, bp.summary, bp.goldenFinger, bp.mainConflict, bp.longHook, bp.worldviewSeed]) {
      expect(t).toContain(part);
    }
  });

  it('未撞梗：passed=true 且原创度 100', () => {
    const r = checkBookPackageOriginality(bp);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.hits).toHaveLength(0);
  });

  it('书名命中内置代表作：passed=false 且给出规避提示', () => {
    const hitWork = WORKS_DB[0];
    const r = checkBookPackageOriginality(
      { ...bp, title: hitWork.title, genre: hitWork.genre as BookPackage['genre'] },
      { liveTitles: [] }
    );
    expect(r.passed).toBe(false);
    expect(r.hits.some((h) => h.workTitle === hitWork.title)).toBe(true);
    expect(r.hints.some((h) => h.includes(hitWork.title))).toBe(true);
  });

  it('liveTitles 命中实时榜单热书名：撞梗被叠加检出', () => {
    const r = checkBookPackageOriginality({ ...bp, title: '雾镇银鱼' }, { liveTitles: ['雾镇银鱼'] });
    expect(r.passed).toBe(false);
    expect(r.hits.some((h) => h.workTitle === '雾镇银鱼')).toBe(true);
  });
});
