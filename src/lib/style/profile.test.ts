import { describe, it, expect } from 'vitest';
import {
  splitSentences,
  extractDialogues,
  extractNGrams,
  analyzeTextStyle,
  sampleToPreset,
  validateSampleText,
} from './profile';

describe('style/profile', () => {
  describe('splitSentences', () => {
    it('应按句末标点切分', () => {
      const result = splitSentences('第一句。第二句！第三句？');
      expect(result).toEqual(['第一句。', '第二句！', '第三句？']);
    });

    it('应保留省略号', () => {
      const result = splitSentences('他沉默了…然后开口。');
      expect(result.length).toBe(2);
    });

    it('空字符串应返回空数组', () => {
      expect(splitSentences('')).toEqual([]);
      expect(splitSentences('   ')).toEqual([]);
    });

    it('无标点文本应作为单句返回', () => {
      const result = splitSentences('一段没有标点的话');
      expect(result).toEqual(['一段没有标点的话']);
    });

    it('应过滤纯空白句', () => {
      const result = splitSentences('  句一。  句二。  ');
      expect(result).toEqual(['句一。', '句二。']);
    });
  });

  describe('extractDialogues', () => {
    it('应提取中文引号对话', () => {
      const result = extractDialogues('他说："你好。"她答："再见。"');
      expect(result).toContain('你好。');
      expect(result).toContain('再见。');
    });

    it('应提取书名号外的引号', () => {
      const result = extractDialogues('"这是对话。"他说。');
      expect(result).toContain('这是对话。');
    });

    it('无对话时应返回空', () => {
      expect(extractDialogues('一段纯叙述文字。')).toEqual([]);
    });

    it('空文本应返回空', () => {
      expect(extractDialogues('')).toEqual([]);
    });
  });

  describe('extractNGrams', () => {
    it('应提取高频 bigram', () => {
      const text = '冷笑一声，他冷笑一声，转身离去。';
      const result = extractNGrams(text, 2, 2);
      expect(result).toContain('冷笑');
    });

    it('应过滤全停用词的 gram', () => {
      const text = '的我的他的她的他们的我们';
      const result = extractNGrams(text, 2, 1);
      // 全部都是停用词组合，应被过滤
      expect(result.length).toBe(0);
    });

    it('空文本应返回空', () => {
      expect(extractNGrams('', 2, 1)).toEqual([]);
    });

    it('不足 n 字时应返回空', () => {
      expect(extractNGrams('字', 2, 1)).toEqual([]);
    });
  });

  describe('analyzeTextStyle', () => {
    it('应正确统计句长与对话比', () => {
      const text = '"你好。"他说。"再见。"她答。然后他转身离开，没有回头。';
      const stats = analyzeTextStyle(text);
      expect(stats.sentenceCount).toBeGreaterThan(0);
      expect(stats.avgSentenceLength).toBeGreaterThan(0);
      expect(stats.dialogueCount).toBe(2);
      expect(stats.dialogueRatio).toBeGreaterThan(0);
      expect(stats.dialogueRatio).toBeLessThanOrEqual(1);
      expect(stats.totalChineseChars).toBeGreaterThan(0);
    });

    it('纯叙述文本对话比应为 0', () => {
      const text = '他独自走在山间小道上，寒风呼啸，松涛阵阵。';
      const stats = analyzeTextStyle(text);
      expect(stats.dialogueCount).toBe(0);
      expect(stats.dialogueRatio).toBe(0);
    });

    it('空文本应返回全 0', () => {
      const stats = analyzeTextStyle('');
      expect(stats.sentenceCount).toBe(0);
      expect(stats.avgSentenceLength).toBe(0);
      expect(stats.dialogueCount).toBe(0);
      expect(stats.dialogueRatio).toBe(0);
      expect(stats.totalChineseChars).toBe(0);
    });
  });

  describe('sampleToPreset', () => {
    it('应生成项目专属预设', () => {
      const text = '我说："你好。"他说："再见。"然后我们各自离去，没有回头。我说："下次见。"他说："好。"我转身走了。我说："再见。"他说："嗯。"我走了。我说："嗯。"他说："嗯。"';
      const preset = sampleToPreset({
        projectId: 'proj_test',
        sampleText: text,
      });
      expect(preset.id).toBe('style-proj-proj_test');
      expect(preset.narrativePerspective).toBe('first');
      expect(preset.pacing).toBe('fast'); // 短句多
      expect(preset.dialogueRatio).toBeGreaterThan(0);
      expect(preset.sampleText).toBe(text);
      expect(preset.vocabularyProfile).toBeDefined();
      expect(preset.vocabularyProfile?.avgSentenceLength).toBeGreaterThan(0);
    });

    it('第三人称叙事应识别为 third-limited', () => {
      // 长叙述、少对话、句长且无"我"作为叙述者
      const text =
        '他独自走在山间小道上，寒风呼啸，松涛阵阵。远处山峦叠嶂，云雾缭绕。他停下脚步，望向远方，目光中满是深思。这条路他走了无数次，却从未感到如此孤独。山间的雾气越来越浓，他紧了紧身上的斗篷，继续向前。';
      const preset = sampleToPreset({
        projectId: 'proj_test',
        sampleText: text,
      });
      expect(preset.narrativePerspective).toBe('third-limited');
    });

    it('长句应识别为 slow 节奏', () => {
      // 单句 30+ 字
      const text =
        '他独自走在山间蜿蜒曲折的小道上，寒风从北方呼啸而来卷起满地落叶，远处的山峦叠嶂着消失在云雾缭绕的天际，仿佛与世隔绝般的存在于这片被时间遗忘的角落。';
      const preset = sampleToPreset({
        projectId: 'proj_test',
        sampleText: text,
      });
      expect(preset.pacing).toBe('slow');
    });
  });

  describe('validateSampleText', () => {
    it('不足 100 字应返回错误', () => {
      const result = validateSampleText('短短的样本');
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });

    it('100-500 字应返回警告但 ok=true', () => {
      const chinese = '字'.repeat(200);
      const result = validateSampleText(chinese);
      expect(result.ok).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it('500 字以上应正常通过', () => {
      const chinese = '字'.repeat(600);
      const result = validateSampleText(chinese);
      expect(result.ok).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('空字符串应返回错误', () => {
      const result = validateSampleText('');
      expect(result.ok).toBe(false);
    });
  });
});
