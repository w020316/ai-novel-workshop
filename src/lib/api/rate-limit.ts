// ============================================================================
// LLM API 轻量限流
// 职责：对依赖 AI 配额（LLM 调用）的路由做基于 IP 的令牌桶限流，
//       防止部署后被外部滥用配额。内存实现，单实例有效。
// ============================================================================
import { NextResponse } from 'next/server';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const WINDOW_SECONDS = 60; // 时间窗口：60 秒
const MAX_REQUESTS = 30; // 每个 IP 每分钟最多 30 次 LLM 调用

// 简单内存存储（生产多实例部署时建议替换为 Redis）
const buckets = new Map<string, Bucket>();

/** 是否启停限流（每次调用读取，便于配置变更与测试） */
function isEnabled(): boolean {
  return process.env.LLM_RATE_LIMIT_ENABLED !== 'false';
}

function isPlausibleIp(value: string | undefined): value is string {
  return (
    !!value &&
    value.length <= 45 && // IPv6 最长（含 IPv4 映射）约 45 字符
    /^[0-9a-fA-F:.]+$/.test(value) // 仅 IP 字面量字符
  );
}

/**
 * 从请求中提取客户端 IP 作为限流桶 key。
 * 信任假设：Vercel 等托管平台会用真实连接 IP 覆盖 x-real-ip / x-forwarded-for，
 * 客户端伪造的同名头不会透传到应用层；自托管部署时需在反向代理层覆盖这两个头。
 * 解析失败（缺头/垃圾值/超长值）统一回落 'anonymous' 共享桶：
 * 既防止伪造头产生任意新桶绕过限流，也避免超长 key 撑爆内存。
 */
function extractClientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (isPlausibleIp(real)) return real;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (isPlausibleIp(first)) return first;
  }
  return 'anonymous';
}

function refill(bucket: Bucket): void {
  const now = Date.now();
  const elapsed = Math.floor((now - bucket.lastRefill) / 1000);
  bucket.tokens = Math.min(MAX_REQUESTS, bucket.tokens + elapsed);
  bucket.lastRefill = now;
}

/**
 * 对给定请求执行限流检查。
 * @returns 为空表示放行；否则返回应直接返回给客户端的 429 响应。
 */
export function enforceRateLimit(request: Request): NextResponse | null {
  if (!isEnabled()) return null;

  // 周期性清理过期条目，防止内存无限增长
  if (buckets.size > 10_000) {
    for (const [key, b] of buckets) {
      if (Date.now() - b.lastRefill > WINDOW_SECONDS * 60) {
        buckets.delete(key);
      }
    }
  }

  const ip = extractClientIp(request);
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket || now - bucket.lastRefill > WINDOW_SECONDS * 1000) {
    // 新窗口：重置
    bucket = { tokens: MAX_REQUESTS - 1, lastRefill: now };
    buckets.set(ip, bucket);
    return null;
  }

  refill(bucket);

  if (bucket.tokens <= 0) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': '10' } }
    );
  }

  bucket.tokens -= 1;
  return null;
}

/** 测试辅助：清空限流状态 */
export function __resetRateLimitForTest(): void {
  buckets.clear();
}