// ============================================================================
// LLM 客户端调用工具
// 依据：spec 6.4 节 / 计划 P3.2
// 职责：
// 1. 封装对 /api/llm/* 路由的 fetch 调用
// 2. 提供类型安全接口
// 3. 统一错误处理
// ============================================================================
import type { ChatMessage, LLMProvider } from '@/types';

const API_BASE = '/api/llm';

// ============ 响应类型 ============
export interface ChatResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  provider: LLMProvider | 'auto';
  model: string;
}

export interface EmbeddingResult {
  vectors: number[][];
  count: number;
  dim: number;
  provider: LLMProvider | 'auto';
  model: string;
  usage: { promptTokens: number };
}

export interface ProviderInfo {
  provider: LLMProvider;
  label: string;
  defaultModel: string;
  defaultEmbeddingModel: string;
  supportsJSON: boolean;
  supportsStream: boolean;
  maxOutputTokens: number;
}

export interface ProvidersResult {
  providers: ProviderInfo[];
  defaultProvider: LLMProvider | null;
  configured: number;
  ready: boolean;
}

// ============ 错误类型 ============
export class LLMClientError extends Error {
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(message: string, statusCode: number, retryable = false) {
    super(message);
    this.name = 'LLMClientError';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

// ============ 内部工具 ============
async function postJSON<T>(
  url: string,
  body: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new LLMClientError(
      `网络请求失败：${err instanceof Error ? err.message : String(err)}`,
      0,
      true
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new LLMClientError(
      `响应不是合法 JSON（HTTP ${res.status}）`,
      res.status,
      false
    );
  }

  if (!res.ok) {
    const payload = json as { error?: string; retryable?: boolean };
    throw new LLMClientError(
      payload.error ?? `请求失败（HTTP ${res.status}）`,
      res.status,
      payload.retryable ?? false
    );
  }

  return json as T;
}

async function getJSON<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new LLMClientError(
      `网络请求失败：${err instanceof Error ? err.message : String(err)}`,
      0,
      true
    );
  }

  if (!res.ok) {
    throw new LLMClientError(
      `请求失败（HTTP ${res.status}）`,
      res.status,
      false
    );
  }

  return (await res.json()) as T;
}

// ============ 对外 API ============
export interface ChatOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

/**
 * 调用 LLM Chat
 * @example
 * const result = await chat({
 *   messages: [
 *     { role: 'system', content: '你是助手' },
 *     { role: 'user', content: '你好' },
 *   ],
 * });
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  return postJSON<ChatResult>(`${API_BASE}/chat`, {
    messages,
    ...options,
  });
}

/**
 * 调用 Embedding（单条）
 */
export async function embedding(
  text: string,
  options: { provider?: LLMProvider; model?: string } = {}
): Promise<Float32Array> {
  const result = await postJSON<EmbeddingResult>(`${API_BASE}/embedding`, {
    text,
    ...options,
  });
  const vec = result.vectors[0];
  if (!vec) throw new LLMClientError('Embedding 返回为空', 500);
  return Float32Array.from(vec);
}

/**
 * 调用 Embedding（批量）
 */
export async function embeddingBatch(
  texts: string[],
  options: { provider?: LLMProvider; model?: string } = {}
): Promise<Float32Array[]> {
  const result = await postJSON<EmbeddingResult>(`${API_BASE}/embedding`, {
    texts,
    ...options,
  });
  return result.vectors.map((v) => Float32Array.from(v));
}

/**
 * 查询服务端已配置的 Provider
 */
export async function getProviders(): Promise<ProvidersResult> {
  return getJSON<ProvidersResult>(`${API_BASE}/providers`);
}

/**
 * 判断服务端 LLM 是否可用
 */
export async function isLLMReady(): Promise<boolean> {
  try {
    const result = await getProviders();
    return result.ready;
  } catch {
    return false;
  }
}
