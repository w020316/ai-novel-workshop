// ============================================================================
// LLM 路由共享工具
// 职责：收敛 chat / embedding / generate-chapter 三路由的重复实现——
//       1. provider 白名单解析（此前三处各存一份，字段扩充时易漏改）
//       2. OPTIONS 预检响应（此前三处各存一份且头不完全一致）
// ============================================================================
import { NextResponse } from 'next/server';
import type { LLMProvider } from '@/types';

const PROVIDER_WHITELIST: readonly LLMProvider[] = ['gemini', 'zhipu', 'deepseek', 'qwen', 'ollama'] as const;

/** 请求体 provider 字段白名单解析：非法/缺省返回 undefined（走默认 provider 链） */
export function safeParseProvider(value: unknown): LLMProvider | undefined {
  return PROVIDER_WHITELIST.includes(value as LLMProvider) ? (value as LLMProvider) : undefined;
}

/** OPTIONS 预检统一响应（204 + 允许的 Method/Header） */
export function corsPreflightResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
