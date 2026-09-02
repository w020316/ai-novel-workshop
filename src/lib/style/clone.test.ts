// ============================================================================
// 文风仿写（风格克隆）测试
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import type { StylePreset } from '@/types';

const chatMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/client', () => ({ chat: chatMock }));

import {
  deriveStyleGuideFromStats,
  generateStyleGuide,
  styleGuideToPrompt,
  enrichPresetWithStyleGuide,
} from './clone';
import { analyzeTextStyle } from './profile';

// 约 500+ 中文字符样本，保证 LLM 调用路径而非降级路径
const SAMPLE = `
夜色如墨，京城的朱雀大街上空无一人。李沉舟拢了拢大氅，脚步不快不慢，靴底碾过青石，发出细碎的声响。
巷口忽然传来一声闷响。他脚步一顿，目光斜斜扫过去，只见一道黑影贴着墙根滑落，像被人随手扔开的破布。
"谁在那里？"他压低嗓音，手已经按上腰间的刀柄。
黑影动了动，却没答话。片刻后，一只苍白的手从阴影里探出来，指尖叩了三下地面。
李沉舟瞳孔微缩。这是接头暗号，第五记。他松开刀柄，快步走了过去。
"东西呢？"他蹲下身，声音压得更低。
黑影抬起脸。那张脸他认得——三日前本该死在城西的探子。
"货……出了岔子。"探子喉咙里挤出几个字，血沫子顺着嘴角往下淌。
李沉舟没接话，目光落在他怀里鼓起的包袱上。探子读懂了他的意思一般，把包袱推了过来。
他掂了掂，分量不对。
"少了三成。"他说。
探子张了张嘴，最终只吐出一句："是雷家动的手。"
李沉舟点了点头。他站起身，靴尖在地上划了一道弧线，把墙角那滩血迹蹭掉，才道："回去。你的命，我替你记着。"
探子的手垂了下去。李沉舟没回头，身影很快融进夜色里。朱雀大街重新安静下来，只有风还在巷口打着旋。`;
// 保持与文字量一致的小样本（用于降级路径）
const SHORT_SAMPLE = '短短几句话，没有足够的内容。';

describe('deriveStyleGuideFromStats（确定性降级）', () => {
  it('基于统计指纹生成四维指南，短语长推断节奏', () => {
    const stats = analyzeTextStyle(SHORT_SAMPLE);
    const guide = deriveStyleGuideFromStats(stats);
    expect(guide.summary.length).toBeGreaterThan(0);
    expect(guide.rhythm.length).toBeGreaterThan(0);
    expect(guide.tone.length).toBeGreaterThan(0);
    expect(guide.wordPreferences.length).toBeGreaterThan(0);
    expect(guide.taboos.length).toBeGreaterThan(0);
    // 短句 → 应判为节奏明快
    expect(guide.rhythm).toContain('短句');
  });

  it('无需 LLM 即可稳定返回可用指南', () => {
    const guide = deriveStyleGuideFromStats(analyzeTextStyle(SAMPLE));
    expect(guide.summary).toMatch(/对话|叙述/);
  });
});

describe('generateStyleGuide（LLM 赋能，带降级）', () => {
  it('LLM 返回合法 JSON 时采用 LLM 指南', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        summary: '冷峻克制的都市悬疑笔法',
        rhythm: '开场长句布景，对话短句卡点',
        tone: '冷叙，用动作而非形容词表现情绪',
        wordPreferences: '多用"顿了顿""扫过去"等内敛动作词',
        taboos: '避免模板化抒情与总结旁白',
      }),
    });
    const guide = await generateStyleGuide(SAMPLE);
    expect(guide.summary).toContain('冷峻克制');
    expect(guide.rhythm).toContain('短句卡点');
    expect(guide.taboos).toContain('模板化');
  });

  it('LLM 返回带 markdown 围栏的 JSON 也能解析', async () => {
    chatMock.mockResolvedValue({
      content: '```json\n{"summary": "硬核爽文节奏", "rhythm": "一章一爽点", "tone": "热血", "wordPreferences": "拳拳到肉", "taboos": "拖沓"}\n```',
    });
    const guide = await generateStyleGuide(SAMPLE);
    expect(guide.summary).toBe('硬核爽文节奏');
  });

  it('LLM 抛错时安全降级为统计指纹指南', async () => {
    chatMock.mockImplementation(() => Promise.reject(new Error('api down')));
    const guide = await generateStyleGuide(SAMPLE);
    expect(guide.summary.length).toBeGreaterThan(0);
    expect(guide.rhythm.length).toBeGreaterThan(0);
  });

  it('样本过短时不调用 LLM，直接返回指纹派生指南', async () => {
    chatMock.mockReset();
    const guide = await generateStyleGuide(SHORT_SAMPLE);
    expect(chatMock).not.toHaveBeenCalled();
    expect(guide.summary).toContain('统计指纹');
  });

  it('LLM 返回非法 JSON 时回落指纹派生', async () => {
    chatMock.mockResolvedValue({ content: '这不是 JSON' });
    const guide = await generateStyleGuide(SAMPLE);
    expect(guide.summary).toContain('统计指纹');
  });
});

describe('styleGuideToPrompt（注入写作提示词）', () => {
  it('生成可直接插入 Prompt 的文风文本块', () => {
    const guide = deriveStyleGuideFromStats(analyzeTextStyle(SAMPLE));
    const prompt = styleGuideToPrompt(guide);
    expect(prompt).toContain('【文风仿写指南（严格模仿）】');
    expect(prompt).toContain('节奏句式');
    expect(prompt).toContain('绝对避免');
  });
});

describe('enrichPresetWithStyleGuide', () => {
  it('为预设注入 LLM 风格指南', async () => {
    chatMock.mockResolvedValue({
      content: JSON.stringify({
        summary: '都市悬疑',
        rhythm: 'a',
        tone: 'b',
        wordPreferences: 'c',
        taboos: 'd',
      }),
    });
    const preset: StylePreset = {
      id: 'style-proj-p1',
      name: 'x',
      narrativePerspective: 'third-limited',
      pacing: 'medium',
      descriptionDensity: 'medium',
      dialogueRatio: 0.4,
      sampleText: SAMPLE,
    };
    const enriched = await enrichPresetWithStyleGuide(preset);
    expect(enriched.styleGuide?.summary).toBe('都市悬疑');
  });

  it('无样本时也保证有降级指南', async () => {
    chatMock.mockReset();
    const preset: StylePreset = {
      id: 'style-proj-p2',
      name: 'y',
      narrativePerspective: 'third-limited',
      pacing: 'medium',
      descriptionDensity: 'medium',
      dialogueRatio: 0.3,
    };
    const enriched = await enrichPresetWithStyleGuide(preset);
    expect(enriched.styleGuide?.summary.length).toBeGreaterThan(0);
    expect(chatMock).not.toHaveBeenCalled();
  });
});