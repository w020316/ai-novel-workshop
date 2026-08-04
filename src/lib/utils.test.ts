import { describe, it, expect } from 'vitest';
import {
  cn,
  generateId,
  estimateTokens,
  countChineseWords,
  truncateAtSentence,
  safeParseJSON,
  formatTime,
} from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('应合并多个 class', () => {
      expect(cn('a', 'b')).toBe('a b');
    });

    it('应处理条件 class', () => {
      expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    });

    it('应解决 Tailwind 冲突（后者覆盖前者）', () => {
      expect(cn('p-2', 'p-4')).toBe('p-4');
    });
  });

  describe('generateId', () => {
    it('应返回 12 位 ID', () => {
      expect(generateId()).toHaveLength(12);
    });

    it('应支持前缀', () => {
      const id = generateId('proj');
      expect(id).toMatch(/^proj_/);
    });

    it('应生成唯一 ID', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateId()));
      expect(ids.size).toBe(100);
    });
  });

  describe('estimateTokens', () => {
    it('空文本应返回 0', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('中文文本应按 1.5 token/字 估算', () => {
      expect(estimateTokens('你好世界')).toBe(6);
    });

    it('英文文本应按 1/4 token/字符 估算', () => {
      expect(estimateTokens('abcd')).toBe(1);
    });
  });

  describe('countChineseWords', () => {
    it('应统计中文字数', () => {
      expect(countChineseWords('你好世界abc')).toBe(4);
    });

    it('空文本应返回 0', () => {
      expect(countChineseWords('')).toBe(0);
    });
  });

  describe('truncateAtSentence', () => {
    it('未超限应原样返回', () => {
      const text = '这是一段短文本。';
      expect(truncateAtSentence(text, 100)).toBe(text);
    });

    it('超限且句号在阈值内应在最后一个句号处截断', () => {
      // text=16字符，maxChars=12，slice 得 '第一句。第二句。第三句。'(12字)，最后句号 index 11，11 > 12*0.8=9.6 ✓
      const text = '第一句。第二句。第三句。第四句。';
      const result = truncateAtSentence(text, 12);
      expect(result).toBe('第一句。第二句。第三句。');
    });

    it('句号在阈值外（太靠前）应按 maxChars 截断', () => {
      // text=14字符，maxChars=10，slice 得 '前文第一句。后面还有'(10字)，最后句号 index 5，5 > 10*0.8=8 ✗
      const text = '前文第一句。后面还有很多内容';
      const result = truncateAtSentence(text, 10);
      expect(result).toBe('前文第一句。后面还有');
    });

    it('找不到句号时应在 maxChars 处截断', () => {
      const text = '无标点的一长串文字内容';
      const result = truncateAtSentence(text, 5);
      expect(result).toBe('无标点的一');
    });
  });

  describe('safeParseJSON', () => {
    it('合法 JSON 应解析成功', () => {
      expect(safeParseJSON('{"a":1}', null)).toEqual({ a: 1 });
    });

    it('非法 JSON 应返回 fallback', () => {
      expect(safeParseJSON('not json', { fallback: true })).toEqual({ fallback: true });
    });

    it('应处理 ```json 代码块包裹', () => {
      const wrapped = '```json\n{"key":"value"}\n```';
      expect(safeParseJSON(wrapped, null)).toEqual({ key: 'value' });
    });

    it('应从混合文本中提取 JSON', () => {
      const mixed = '结果是：{"key":"value"} 结束';
      expect(safeParseJSON(mixed, null)).toEqual({ key: 'value' });
    });
  });

  describe('formatTime', () => {
    it('应格式化时间戳', () => {
      const ts = new Date('2026-08-04T10:30:00').getTime();
      const result = formatTime(ts);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });
  });
});
