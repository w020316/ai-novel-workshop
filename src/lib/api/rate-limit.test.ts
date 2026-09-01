// ============================================================================
// 限流模块测试
// ============================================================================
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  enforceRateLimit,
  __resetRateLimitForTest,
} from './rate-limit';

// 关闭限流开关，避免影响其它测试
const originalEnv = process.env.LLM_RATE_LIMIT_ENABLED;

function makeRequest(ip: string): Request {
  return new Request('http://localhost/api/llm/chat', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('enforceRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitForTest();
    process.env.LLM_RATE_LIMIT_ENABLED = 'true';
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.LLM_RATE_LIMIT_ENABLED;
    } else {
      process.env.LLM_RATE_LIMIT_ENABLED = originalEnv;
    }
  });

  it('同 IP 在限流阈值内应放行', () => {
    for (let i = 0; i < 30; i++) {
      expect(enforceRateLimit(makeRequest('1.2.3.4'))).toBeNull();
    }
  });

  it('同 IP 超出阈值后返回 429 响应', () => {
    for (let i = 0; i < 30; i++) {
      enforceRateLimit(makeRequest('5.6.7.8'));
    }
    const blocked = enforceRateLimit(makeRequest('5.6.7.8'));
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get('Retry-After')).toBe('10');
  });

  it('不同 IP 互不影响', () => {
    for (let i = 0; i < 30; i++) {
      enforceRateLimit(makeRequest('9.9.9.9'));
    }
    expect(enforceRateLimit(makeRequest('8.8.8.8'))).toBeNull();
  });

  it('开关关闭时始终放行', () => {
    process.env.LLM_RATE_LIMIT_ENABLED = 'false';
    __resetRateLimitForTest();
    for (let i = 0; i < 100; i++) {
      expect(enforceRateLimit(makeRequest('1.1.1.1'))).toBeNull();
    }
  });
});