// ============================================================================
// OpenAI 兼容 LLM 适配器
// 依据：spec 6.4 节
// 适用：DeepSeek / 智谱 GLM / 通义 Qwen 等所有 OpenAI 兼容协议的 Provider
// ============================================================================
import type {
  LLMAdapter,
  LLMProvider,
  ChatParams,
  StreamChatParams,
  ChatResponse,
  ChatMessage,
} from '@/types';
import { type ProviderConfig } from './providers';

export interface OpenAICompatibleOptions {
  config: ProviderConfig;
  apiKey: string;
  /** 模型覆盖（默认使用 ProviderConfig.defaultModel） */
  model?: string;
  /** 自定义 fetch（用于测试或代理） */
  fetchImpl?: typeof fetch;
  /** 自定义超时（毫秒，默认 60s） */
  timeoutMs?: number;
  /** 请求头覆盖（如鉴权方式不同） */
  headers?: Record<string, string>;
}

interface OpenAIChatChoice {
  message?: { role?: string; content?: string };
  delta?: { role?: string; content?: string };
  finish_reason?: string | null;
  index?: number;
}

interface OpenAIChatResponse {
  id?: string;
  model?: string;
  choices?: OpenAIChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message: string;
    type: string;
    code?: string;
  };
}

export class OpenAICompatibleAdapter implements LLMAdapter {
  private readonly config: ProviderConfig;
  private readonly apiKey: string;
  private readonly modelOverride?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly headersOverride: Record<string, string>;

  constructor(options: OpenAICompatibleOptions) {
    this.config = options.config;
    this.apiKey = options.apiKey;
    this.modelOverride = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.headersOverride = options.headers ?? {};
  }

  /** 获取当前使用的模型名 */
  get model(): string {
    return this.modelOverride ?? this.config.defaultModel;
  }

  /** 获取 Provider 标识 */
  get provider(): LLMProvider {
    return this.config.provider;
  }

  // ============ Chat ============
  async chat(params: ChatParams): Promise<ChatResponse> {
    const url = this.config.baseURL + this.config.chatPath;
    const body = this.buildRequestBody(params, false);

    const res = await this.requestWithTimeout(url, {
      method: 'POST',
      headers: this.buildHeaders(params.responseFormat === 'json'),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new LLMApiError(
        `Chat 失败：HTTP ${res.status}`,
        res.status,
        text,
        this.config.provider
      );
    }

    const json = (await res.json()) as OpenAIChatResponse;
    if (json.error) {
      throw new LLMApiError(
        `Chat 错误：${json.error.message}`,
        res.status,
        JSON.stringify(json.error),
        this.config.provider
      );
    }

    const choice = json.choices?.[0];
    const content = choice?.message?.content ?? '';

    return {
      content,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  // ============ Stream Chat ============
  async streamChat(params: StreamChatParams): Promise<void> {
    const url = this.config.baseURL + this.config.chatPath;
    const body = this.buildRequestBody(params, true);

    const res = await this.requestWithTimeout(url, {
      method: 'POST',
      headers: this.buildHeaders(params.responseFormat === 'json'),
      body: JSON.stringify(body),
    }, params.signal);

    if (!res.ok || !res.body) {
      const text = res.body ? await res.text() : '';
      throw new LLMApiError(
        `Stream 失败：HTTP ${res.status}`,
        res.status,
        text,
        this.config.provider
      );
    }

    await this.parseSSEStream(res.body, params.onToken);
  }

  // ============ Embedding ============
  async embedding(text: string, model?: string): Promise<Float32Array> {
    const url = this.config.baseURL + this.config.embeddingPath;
    const body = {
      model: model ?? this.config.defaultEmbeddingModel,
      input: text,
    };

    const res = await this.requestWithTimeout(url, {
      method: 'POST',
      headers: this.buildHeaders(false),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new LLMApiError(
        `Embedding 失败：HTTP ${res.status}`,
        res.status,
        errText,
        this.config.provider
      );
    }

    const json = (await res.json()) as OpenAIEmbeddingResponse;
    if (json.error) {
      throw new LLMApiError(
        `Embedding 错误：${json.error.message}`,
        res.status,
        JSON.stringify(json.error),
        this.config.provider
      );
    }

    const vec = json.data?.[0]?.embedding;
    if (!vec || vec.length === 0) {
      throw new LLMApiError(
        'Embedding 返回为空',
        500,
        JSON.stringify(json),
        this.config.provider
      );
    }

    return Float32Array.from(vec);
  }

  // ============ 内部工具 ============
  private buildRequestBody(
    params: ChatParams | StreamChatParams,
    stream: boolean
  ): Record<string, unknown> {
    const messages: ChatMessage[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream,
    };

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }
    if (params.topP !== undefined) {
      body.top_p = params.topP;
    }
    if (params.maxTokens !== undefined) {
      body.max_tokens = Math.min(params.maxTokens, this.config.maxOutputTokens);
    }
    if (params.responseFormat === 'json' && this.config.supportsJSON) {
      body.response_format = { type: 'json_object' };
    }

    return body;
  }

  private buildHeaders(jsonMode: boolean): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...(jsonMode ? { Accept: 'application/json' } : {}),
      ...this.headersOverride,
    };
  }

  private async requestWithTimeout(
    url: string,
    init: RequestInit,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // 外部信号合并：任一中止即中止请求
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }

  private async parseSSEStream(
    body: ReadableStream<Uint8Array>,
    onToken: (token: string) => void
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // 保留最后一行（可能未完成）
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data) as OpenAIChatResponse;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) onToken(delta);
          } catch {
            // 忽略无法解析的中间帧
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * 自定义 LLM API 错误类型
 */
export class LLMApiError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;
  readonly provider: string;

  constructor(
    message: string,
    statusCode: number,
    responseBody: string,
    provider: string
  ) {
    super(message);
    this.name = 'LLMApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.provider = provider;
  }
}

/**
 * 判断错误是否可重试（spec 7.1 节）
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof LLMApiError) {
    // 5xx 与 429（速率限制）可重试
    return (
      err.statusCode >= 500 || err.statusCode === 408 || err.statusCode === 429
    );
  }
  // 网络错误、超时
  if (err instanceof Error) {
    const name = err.name;
    return name === 'AbortError' || name === 'TypeError';
  }
  return false;
}

/** 典型网络连接故障的系统错误码（Node.js errno / undici） */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED', // 连接被拒绝
  'ECONNRESET', // 连接被重置
  'ENOTFOUND', // DNS 解析失败
  'ETIMEDOUT', // 连接超时
  'EAI_AGAIN', // DNS 暂时失败
  'EHOSTUNREACH', // 主机不可达
  'ENETUNREACH', // 网络不可达
  'UND_ERR_CONNECT_TIMEOUT', // undici 连接超时
  'UND_ERR_SOCKET', // undici socket 故障
]);

/**
 * 判断是否为网络连接级错误（用于 Provider 级故障转移）。
 * 仅覆盖「根本没连上 / 连接中途断开」的情形：
 * fetch 网络失败（TypeError）、超时中止（AbortError）、
 * DNS/连接类 errno（ECONNREFUSED 等）与 undici 连接超时。
 * HTTP 状态错误（LLMApiError，如 429/5xx）不算连接错误，不做 provider 切换。
 */
export function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error) || err instanceof LLMApiError) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) return true;
  const name = err.name;
  return (
    name === 'TypeError' || // fetch 网络失败
    name === 'AbortError' || // 请求超时
    name === 'ConnectTimeoutError' || // undici 连接超时
    name === 'SocketError' || // undici socket 错误
    name === 'FetchError'
  );
}
