// ============================================================================
// LLM 重试机制（指数退避）
// 依据：spec 7.1 节
// ============================================================================
import { isRetryableError, LLMApiError } from './openai-compatible';

export interface RetryOptions {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 初始退避延迟（毫秒，默认 1000） */
  baseDelayMs?: number;
  /** 最大退避延迟（毫秒，默认 30_000） */
  maxDelayMs?: number;
  /** 退避指数（默认 2） */
  backoffFactor?: number;
  /** 是否启用抖动（默认 true） */
  jitter?: boolean;
  /** 重试前的回调（可用于日志） */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * 带重试的异步函数包装
 * 适用场景：LLM API 调用（网络波动 / 速率限制 / 临时故障）
 *
 * @example
 * const result = await withRetry(
 *   () => adapter.chat({ messages }),
 *   { maxRetries: 3, onRetry: (n, e) => console.warn(`重试 ${n}: ${e}`) }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    backoffFactor = 2,
    jitter = true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // 最后一次尝试失败后不再重试
      if (attempt >= maxRetries) {
        break;
      }

      // 仅可重试的错误才重试
      if (!isRetryableError(err)) {
        break;
      }

      // 计算退避延迟
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffFactor, attempt),
        maxDelayMs
      );

      // 应用抖动（±25% 随机偏移），避免多个请求同时重试
      const finalDelay = jitter
        ? delay * (0.75 + Math.random() * 0.5)
        : delay;

      onRetry?.(attempt + 1, err, Math.round(finalDelay));

      await sleep(finalDelay);
    }
  }

  // 所有重试耗尽，抛出自定义异常
  if (lastError instanceof LLMApiError) {
    throw lastError;
  }
  if (lastError instanceof Error) {
    throw new RetryExhaustedError(
      `重试耗尽（${maxRetries} 次）：${lastError.message}`,
      lastError
    );
  }
  throw new RetryExhaustedError(
    `重试耗尽（${maxRetries} 次）：${String(lastError)}`,
    lastError instanceof Error ? lastError : new Error(String(lastError))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 重试耗尽错误
 */
export class RetryExhaustedError extends Error {
  readonly originalError: Error;

  constructor(message: string, originalError: Error) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.originalError = originalError;
  }
}