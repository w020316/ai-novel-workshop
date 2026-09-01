// ============================================================================
// 前端流式接收工具
// 依据：spec 6.4 节 / 计划 P3.3
// 职责：解析 SSE 流，提供事件回调
// ============================================================================
import type { ChatMessage, LLMProvider } from '@/types';

export interface StreamEventHandlers {
  /** 收到 token */
  onToken?: (token: string) => void;
  /** 流开始 */
  onStart?: (info: { provider: string; model: string }) => void;
  /** 重试中 */
  onRetry?: (attempt: number, error: string) => void;
  /** 流完成 */
  onDone?: (info: { totalTokens: number; provider: string; model: string }) => void;
  /** 流错误 */
  onError?: (error: string) => void;
}

export interface StreamChapterOptions {
  messages: ChatMessage[];
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /** AbortController 信号，用于中断生成 */
  signal?: AbortSignal;
}

/**
 * 流式生成章节
 * 通过 SSE 接收 token，支持中断
 *
 * @example
 * const ctrl = new AbortController();
 * await streamChapter(
 *   { messages, signal: ctrl.signal },
 *   {
 *     onToken: (t) => setText((prev) => prev + t),
 *     onDone: () => setGenerating(false),
 *     onError: (e) => toast.error(e),
 *   }
 * );
 * // 中断：ctrl.abort()
 */
export async function streamChapter(
  options: StreamChapterOptions,
  handlers: StreamEventHandlers = {}
): Promise<void> {
  const { messages, provider, model, temperature, topP, maxTokens, signal } = options;

  const response = await fetch('/api/llm/generate-chapter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      provider,
      model,
      temperature,
      topP,
      maxTokens,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '请求失败' }));
    handlers.onError?.(err.error ?? `HTTP ${response.status}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError?.('响应体为空');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  // eventType 必须在循环外声明：SSE 事件的 event: 头与 data: 体可能被拆到
  // 不同的 read 分块，若在循环内重置会丢失事件关联，导致 token 丢失
  let eventType = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        // 空行表示一个 SSE 事件的结束，重置事件类型，避免跨事件泄漏
        if (!trimmed) {
          eventType = '';
          continue;
        }

        if (trimmed.startsWith('event:')) {
          eventType = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const data = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(data);
            handleEvent(eventType, parsed, handlers);
          } catch {
            // 忽略无法解析的 data
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户主动中断，不视为错误
      handlers.onDone?.({ totalTokens: 0, provider: '', model: '' });
      return;
    }
    handlers.onError?.(err instanceof Error ? err.message : '流读取失败');
  } finally {
    reader.releaseLock();
  }
}

function handleEvent(
  eventType: string,
  data: Record<string, unknown>,
  handlers: StreamEventHandlers
): void {
  switch (eventType) {
    case 'start': {
      handlers.onStart?.({
        provider: String(data.provider ?? ''),
        model: String(data.model ?? ''),
      });
      break;
    }
    case 'token': {
      const token = String(data.token ?? '');
      if (token) handlers.onToken?.(token);
      break;
    }
    case 'progress': {
      if (data.status === 'retrying') {
        handlers.onRetry?.(Number(data.attempt ?? 0), String(data.error ?? ''));
      }
      break;
    }
    case 'done': {
      handlers.onDone?.({
        totalTokens: Number(data.totalTokens ?? 0),
        provider: String(data.provider ?? ''),
        model: String(data.model ?? ''),
      });
      break;
    }
    case 'error': {
      handlers.onError?.(String(data.error ?? '未知错误'));
      break;
    }
  }
}

/**
 * 流式调用普通 Chat（非章节生成）
 * 直接调用 /api/llm/chat 的流式版本
 * 注意：本函数使用 POST /api/llm/chat 的 stream 模式
 */
export async function streamChat(
  messages: ChatMessage[],
  options: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  },
  onToken: (token: string) => void
): Promise<string> {
  let fullContent = '';

  await streamChapter(
    { messages, ...options },
    {
      onToken: (token) => {
        fullContent += token;
        onToken(token);
      },
    }
  );

  return fullContent;
}