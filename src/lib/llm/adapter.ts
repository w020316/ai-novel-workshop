// ============================================================================
// LLM 适配器工厂
// 依据：spec 6.4 节
// 提供三种创建方式：
// 1. createAdapter(provider, options?) - 显式指定 Provider 与 apiKey
// 2. createAdapterFromEnv(provider) - 从环境变量读取 apiKey
// 3. createAdapterFromConfig(config) - 从项目 LLMConfig 创建（最常用）
// ============================================================================
import type { LLMAdapter, LLMConfig, LLMProvider } from '@/types';
import { OpenAICompatibleAdapter, isConnectionError } from './openai-compatible';
import { getProviderConfig, getAPIKey, isProviderConfigured } from './providers';

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

  // Ollama 本地部署无需 API Key：仅要求显式启用，Bearer 头用占位值
  if (provider === 'ollama' && !isProviderConfigured('ollama')) {
    throw new Error(
      '未启用本地 Ollama（设置环境变量 OLLAMA_ENABLED=true 或 OLLAMA_BASE_URL，且本地需已运行 ollama serve）'
    );
  }

  const apiKey =
    options.apiKey ?? getAPIKey(provider) ?? (provider === 'ollama' ? 'ollama' : undefined);

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
  providers: LLMProvider[] = ['gemini', 'zhipu', 'deepseek', 'qwen', 'ollama']
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

/**
 * 在若干模型间串行调用，命中可重试错误（429/5xx/超时）时自动换下一个模型。
 * 用于 gemini 模型级降级链（组合策略 C）：例如 3.6 → 3.5 → 3.1-flash-lite。
 * @returns 任一模型成功的结果；全部失败则抛出最后一次错误。
 */
export async function callWithModelFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  isRetryable: (err: unknown) => boolean
): Promise<T> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await call(model);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err; // 非可重试错误（如 401）不换模型，直接抛
    }
  }
  throw lastError;
}

// ============ Provider 级故障转移（连接错误级） ============
export interface ProviderChainEntry {
  provider: LLMProvider;
  model?: string;
}

export interface ProviderFallbackResult<T> {
  result: T;
  /** 实际服务的 Provider */
  provider: LLMProvider;
  fallback: boolean;
  /** 成功前的失败记录（仅连接级错误） */
  fallbackHistory: Array<{ provider: LLMProvider; error: unknown }>;
}

/**
 * 沿 Provider 链依次调用，命中连接级错误（DNS/超时/拒连等）时自动切换下一个 Provider。
 * - 非连接错误（如 401 / 400 / 429）不切换，原样抛出
 * - 全部 Provider 连接失败 → 抛出 ProviderFallbackExhaustedError（携带失败记录）
 * 不做单 Provider 内重试：连接不上时尽快换下一家，避免叠加退避等待。
 */
export async function callWithProviderFallback<T>(
  chain: ProviderChainEntry[],
  call: (entry: ProviderChainEntry) => Promise<T>
): Promise<ProviderFallbackResult<T>> {
  const fallbackHistory: Array<{ provider: LLMProvider; error: unknown }> = [];

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    try {
      const result = await call(entry);
      return { result, provider: entry.provider, fallback: i > 0, fallbackHistory };
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      fallbackHistory.push({ provider: entry.provider, error: err });
      console.warn(
        `[llm] Provider ${entry.provider} 连接失败（${err instanceof Error ? err.message : String(err)}），切换下一个`
      );
    }
  }

  throw new ProviderFallbackExhaustedError(chain.map((e) => e.provider), fallbackHistory);
}

/** Provider 故障转移耗尽错误：链上所有 Provider 均连接失败 */
export class ProviderFallbackExhaustedError extends Error {
  readonly attempted: LLMProvider[];
  readonly fallbackHistory: Array<{ provider: LLMProvider; error: unknown }>;

  constructor(
    attempted: LLMProvider[],
    fallbackHistory: Array<{ provider: LLMProvider; error: unknown }>
  ) {
    const detail = fallbackHistory
      .map((h) => `${h.provider}: ${h.error instanceof Error ? h.error.message : String(h.error)}`)
      .join('；');
    super(`所有 Provider 连接失败（${attempted.join(' → ')}）${detail ? `：${detail}` : ''}`);
    this.name = 'ProviderFallbackExhaustedError';
    this.attempted = attempted;
    this.fallbackHistory = fallbackHistory;
  }
}
