// ============================================================================
// 章节生成流式 API
// 依据：spec 6.4 节 / 计划 P3.3
// 职责：
// 1. 接收前端生成请求（messages + 参数）
// 2. 使用 SSE 协议流式推送 token
// 3. 推送进度事件（progress）和结束事件（done）
// 路径：POST /api/llm/generate-chapter
// 响应格式：SSE (text/event-stream)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { createAdapter, createFirstAvailableAdapter } from '@/lib/llm/adapter';
import { getDefaultProvider } from '@/lib/llm/providers';
import { LLMApiError } from '@/lib/llm/openai-compatible';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import type { ChatMessage, LLMProvider } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 章节生成可能较长

interface GenerateChapterBody {
  messages: ChatMessage[];
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

function safeParseProvider(value: unknown): LLMProvider | undefined {
  if (value === 'deepseek' || value === 'zhipu' || value === 'qwen') {
    return value;
  }
  return undefined;
}

/** 数值消毒：非法/越界回退到 fallback 并夹取到 [min,max] */
function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export async function POST(request: NextRequest) {
  // 0. 限流保护（防配额滥用）
  const rateLimited = enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  // 1. 解析请求体
  let body: GenerateChapterBody;
  try {
    body = (await request.json()) as GenerateChapterBody;
  } catch {
    return NextResponse.json(
      { error: '请求体不是合法 JSON' },
      { status: 400 }
    );
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages 必填且不能为空' },
      { status: 400 }
    );
  }

  // 数值消毒（防 NaN/越界值破坏适配器调用）
  const temperature = clampNumber(body.temperature, 0, 2, 0.7);
  const topP = clampNumber(body.topP, 0, 1, 0.9);
  const maxTokens = Math.round(clampNumber(body.maxTokens, 256, 8192, 4096));

  // 2. 创建 adapter
  const provider = safeParseProvider(body.provider) ?? getDefaultProvider();
  let adapter;
  try {
    adapter = provider
      ? createAdapter(provider, { model: body.model })
      : createFirstAvailableAdapter();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '无法创建 LLM 适配器';
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  if (!adapter) {
    return NextResponse.json(
      { error: '未配置任何 LLM Provider' },
      { status: 503 }
    );
  }

  // 3. 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let totalTokens = 0;
      let tokenSent = false;

      // 发送开始事件
      controller.enqueue(
        encoder.encode(
          `event: start\ndata: ${JSON.stringify({ provider: provider ?? 'auto', model: adapter.model })}\n\n`
        )
      );

      try {
        // 流式调用：一旦已经输出 token 就不允许整体重试（否则客户端会收到拼接的重复章节）
        // 故不在此处使用 withRetry 包裹整个流；仅在连接建立阶段抛错时，交由上层 orchestrator 重试。
        await adapter.streamChat({
          messages,
          temperature,
          topP,
          maxTokens,
          signal: request.signal,
          onToken: (token: string) => {
            tokenSent = true;
            totalTokens++;
            controller.enqueue(
              encoder.encode(
                `event: token\ndata: ${JSON.stringify({ token })}\n\n`
              )
            );
          },
        });

        // 发送完成事件
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              totalTokens,
              provider: provider ?? 'auto',
              model: adapter.model,
            })}\n\n`
          )
        );
      } catch (err) {
        // 用户主动中断：不做为错误上报，normal 关闭
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        // 发送错误事件
        const errorMessage =
          err instanceof LLMApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '生成失败';
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: errorMessage, tokenSent })}\n\n`
          )
        );
      } finally {
        if (!request.signal.aborted) {
          controller.close();
        }
      }
    },
    cancel() {
      // 客户端断开（如 abort）时清理
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}