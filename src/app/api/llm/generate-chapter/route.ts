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
import { NextResponse } from 'next/server';
import { createAdapter, createFirstAvailableAdapter } from '@/lib/llm/adapter';
import { getDefaultProvider } from '@/lib/llm/providers';
import { withRetry } from '@/lib/llm/retry';
import { LLMApiError } from '@/lib/llm/openai-compatible';
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

export async function POST(request: Request) {
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

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages 必填且不能为空' },
      { status: 400 }
    );
  }

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

      // 发送开始事件
      controller.enqueue(
        encoder.encode(
          `event: start\ndata: ${JSON.stringify({ provider: provider ?? 'auto', model: adapter.model })}\n\n`
        )
      );

      try {
        // 使用重试机制调用流式 chat
        await withRetry(
          () =>
            adapter.streamChat({
              messages,
              temperature: body.temperature,
              topP: body.topP,
              maxTokens: body.maxTokens,
              onToken: (token: string) => {
                totalTokens++;
                controller.enqueue(
                  encoder.encode(
                    `event: token\ndata: ${JSON.stringify({ token })}\n\n`
                  )
                );
              },
            }),
          {
            maxRetries: 2,
            onRetry: (attempt, err) => {
              // 重试前发送进度事件
              controller.enqueue(
                encoder.encode(
                  `event: progress\ndata: ${JSON.stringify({
                    status: 'retrying',
                    attempt,
                    error: err instanceof Error ? err.message : String(err),
                  })}\n\n`
                )
              );
            },
          }
        );

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
        // 发送错误事件
        const errorMessage =
          err instanceof LLMApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : '生成失败';
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
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