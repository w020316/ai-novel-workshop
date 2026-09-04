// ============================================================================
// LLM 消息结构校验工具测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { isValidChatMessage, validateMessages } from './message-validation';

describe('isValidChatMessage', () => {
  it('接受合法 system/user/assistant 消息', () => {
    expect(isValidChatMessage({ role: 'system', content: 'x' })).toBe(true);
    expect(isValidChatMessage({ role: 'user', content: 'hi' })).toBe(true);
    expect(isValidChatMessage({ role: 'assistant', content: 'ok' })).toBe(true);
  });
  it('拒绝非白名单 role', () => {
    expect(isValidChatMessage({ role: 'tool', content: 'x' })).toBe(false);
  });
  it('拒绝非字符串 content / 缺失字段 / 空值', () => {
    expect(isValidChatMessage({ role: 'user', content: 123 })).toBe(false);
    expect(isValidChatMessage({ role: 'user' })).toBe(false);
    expect(isValidChatMessage(null)).toBe(false);
    expect(isValidChatMessage(undefined)).toBe(false);
  });
});

describe('validateMessages', () => {
  it('合法数组返回 null', () => {
    expect(validateMessages([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }])).toBeNull();
  });
  it('空数组/非数组返回必填错误', () => {
    expect(validateMessages([])).toContain('必填');
    expect(validateMessages(null)).toContain('必填');
    expect(validateMessages(undefined)).toContain('必填');
    expect(validateMessages('no')).toContain('必填');
  });
  it('任一非法项返回非法消息错误', () => {
    expect(validateMessages([{ role: 'user', content: 'ok' }, { role: 'tool', content: 'x' }])).toContain('非法');
  });
});