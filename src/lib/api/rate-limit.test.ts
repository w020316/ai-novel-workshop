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

  it('伪造垃圾 x-forwarded-for 不应产生新桶（统一落 anonymous 共享桶并触发 429）', () => {
    // 每次携带不同的随机垃圾头值：修复前每个值各自开桶、可无限绕过
    for (let i = 0; i < 30; i++) {
      const req = makeRequest(`garbage-${Math.random()}-<script>`);
      expect(enforceRateLimit(req)).toBeNull();
    }
    // 第 31 次垃圾头请求应与前面的 anonymous 桶共享配额而被限流
    const blocked = enforceRateLimit(makeRequest(`another-garbage-${Math.random()}`));
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it('超长伪造头不应绕过限流（落 anonymous 共享桶）', () => {
    for (let i = 0; i < 30; i++) {
      enforceRateLimit(makeRequest('x'.repeat(500)));
    }
    expect(enforceRateLimit(makeRequest('y'.repeat(500)))?.status).toBe(429);
  });

  it('无任何 IP 头的请求应共享 anonymous 桶', () => {
    const req = () => new Request('http://localhost/api/llm/chat', { method: 'POST' });
    for (let i = 0; i < 30; i++) {
      expect(enforceRateLimit(req())).toBeNull();
    }
    expect(enforceRateLimit(req())?.status).toBe(429);
  });

  it('x-real-ip 优先于 x-forwarded-for', () => {
    const req = new Request('http://localhost/api/llm/chat', {
      method: 'POST',
      headers: { 'x-real-ip': '7.7.7.7', 'x-forwarded-for': '6.6.6.6' },
    });
    for (let i = 0; i < 30; i++) {
      expect(enforceRateLimit(req)).toBeNull();
    }
    // 消耗的是 7.7.7.7 的桶；6.6.6.6 不受影响
    expect(enforceRateLimit(req)?.status).toBe(429);
    expect(enforceRateLimit(makeRequest('6.6.6.6'))).toBeNull();
  });

  it('合法 IPv6 字面量应被信任', () => {
    expect(enforceRateLimit(makeRequest('::ffff:1.2.3.4'))).toBeNull();
    expect(enforceRateLimit(makeRequest('2001:db8::1'))).toBeNull();
  });
});