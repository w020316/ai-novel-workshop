// ============================================================================
// LLM 适配器工厂
// 依据：spec 6.4 节
// 提供三种创建方式：
// 1. createAdapter(provider, options?) - 显式指定 Provider 与 apiKey
// 2. createAdapterFromEnv(provider) - 从环境变量读取 apiKey
// 3. createAdapterFromConfig(config) - 从项目 LLMConfig 创建（最常用）
// ============================================================================
import type { LLMAdapter, LLMConfig, LLMProvider } from '@/types';
import { OpenAICompatibleAdapter } from './openai-compatible';
import { getProviderConfig, getAPIKey } from './providers';

export interface CreateAdapterOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * 创建适配器（显式指定 Provider 与 apiKey）
 */
export function createAdapter(
  provider: LLMProvider,
  options: CreateAdapterOptions = {}
): LLMAdapter {
  const config = getProviderConfig(provider);
  const apiKey = options.apiKey ?? getAPIKey(provider);

  if (!apiKey) {
    throw new Error(
      `未配置 ${config.label} 的 API Key（环境变量 ${config.envKey}）`
    );
  }

  return new OpenAICompatibleAdapter({
    config,
    apiKey,
    model: options.model,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    headers: options.headers,
  });
}

/**
 * 从环境变量读取 API Key 创建适配器
 */
export function createAdapterFromEnv(provider: LLMProvider): LLMAdapter {
  return createAdapter(provider, {});
}

/**
 * 从项目 LLMConfig 创建适配器
 * 注意：apiKey 仍从环境变量读取（不存储在客户端）
 */
export function createAdapterFromConfig(config: LLMConfig): LLMAdapter {
  return createAdapter(config.provider, { model: config.model });
}

/**
 * 尝试从配置列表创建可用的适配器（按优先级）
 * 用于多 Provider 降级场景
 */
export function createFirstAvailableAdapter(
  providers: LLMProvider[] = ['deepseek', 'zhipu', 'qwen']
): LLMAdapter | null {
  for (const p of providers) {
    try {
      return createAdapter(p);
    } catch {
      // 该 Provider 未配置，继续尝试下一个
    }
  }
  return null;
}
