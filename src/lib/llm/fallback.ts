// ============================================================================
// LLM 模型降级链
// 依据：spec 7.1 节
// 职责：当主 Provider 失败时，自动降级到备选 Provider
// ============================================================================
import type { LLMAdapter, LLMProvider } from '@/types';
import { createAdapter } from './adapter';
import { listConfiguredProviders } from './providers';
import { isRetryableError } from './openai-compatible';
import { withRetry, type RetryOptions } from './retry';

export interface FallbackOptions {
  /** 自定义 Provider 降级顺序（默认按配置优先级） */
  providers?: LLMProvider[];
  /** 重试配置 */
  retry?: RetryOptions;
  /** 降级前的回调 */
  onFallback?: (from: LLMProvider, to: LLMProvider, error: unknown) => void;
  /** 完全降级失败后的回调 */
  onAllFailed?: (errors: Array<{ provider: LLMProvider; error: unknown }>) => void;
}

export interface FallbackResult<T> {
  result: T;
  /** 实际使用的 Provider */
  provider: LLMProvider;
  /** 是否发生了降级 */
  fallback: boolean;
  /** 降级记录（成功前的失败记录） */
  fallbackHistory: Array<{ provider: LLMProvider; error: unknown }>;
}

/**
 * 带降级的 LLM 调用
 * 自动按优先级尝试 Provider，失败时自动降级
 *
 * @example
 * const { result, provider, fallback } = await withFallback(
 *   (adapter) => adapter.chat({ messages }),
 *   { onFallback: (from, to) => console.warn(`降级 ${from} → ${to}`) }
 * );
 */
export async function withFallback<T>(
  call: (adapter: LLMAdapter) => Promise<T>,
  options: FallbackOptions = {}
): Promise<FallbackResult<T>> {
  const providers = options.providers ?? listConfiguredProviders();

  if (providers.length === 0) {
    throw new FallbackExhaustedError(
      '没有任何 LLM Provider 已配置，无法执行降级',
      []
    );
  }

  const fallbackHistory: Array<{ provider: LLMProvider; error: unknown }> = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];

    try {
      const adapter = createAdapter(provider);
      const result = await withRetry(() => call(adapter), options.retry);

      return {
        result,
        provider,
        fallback: i > 0,
        fallbackHistory,
      };
    } catch (err) {
      // 不可重试的错误（如 401 认证失败）直接抛出，不降级
      if (!isRetryableError(err) && !(err instanceof Error && err.name === 'RetryExhaustedError')) {
        throw err;
      }

      fallbackHistory.push({ provider, error: err });
      options.onFallback?.(provider, providers[i + 1], err);

      // 继续尝试下一个 Provider
    }
  }

  // 所有 Provider 都失败
  const exhaustedError = new FallbackExhaustedError(
    `所有 Provider 降级失败（共 ${providers.length} 个）`,
    fallbackHistory
  );
  options.onAllFailed?.(fallbackHistory);
  throw exhaustedError;
}

/**
 * 降级耗尽错误
 */
export class FallbackExhaustedError extends Error {
  readonly fallbackHistory: Array<{ provider: LLMProvider; error: unknown }>;

  constructor(
    message: string,
    fallbackHistory: Array<{ provider: LLMProvider; error: unknown }>
  ) {
    super(message);
    this.name = 'FallbackExhaustedError';
    this.fallbackHistory = fallbackHistory;
  }
}