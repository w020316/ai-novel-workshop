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
import { createAdapter } from '@/lib/llm/adapter';
import { buildProviderChain } from '@/lib/llm/providers';
import { LLMApiError, isConnectionError } from '@/lib/llm/openai-compatible';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { validateMessages } from '@/lib/llm/message-validation';
import { safeParseProvider, corsPreflightResponse } from '@/lib/api/llm-shared';
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
  const messageError = validateMessages(messages);
  if (messageError) {
    return NextResponse.json({ error: messageError }, { status: 400 });
  }

  // 数值消毒（防 NaN/越界值破坏适配器调用）
  const temperature = clampNumber(body.temperature, 0, 2, 0.7);
  const topP = clampNumber(body.topP, 0, 1, 0.9);
  const maxTokens = Math.round(clampNumber(body.maxTokens, 256, 8192, 4096));

  // 2. 构建 Provider 故障转移链（请求的 provider 未配置则自动回退到已配置 provider 及默认模型）
  const chain = buildProviderChain(safeParseProvider(body.provider), body.model);
  if (chain.length === 0) {
    return NextResponse.json({ error: '未配置任何 LLM Provider' }, { status: 503 });
  }

  // 3. 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let totalTokens = 0;
      let tokenSent = false;
      let startSent = false;
      let usedProvider: LLMProvider = chain[0].provider;
      let usedModel = chain[0].model ?? '';

      // start 事件延迟到首个 token（或结束）时发送，避免故障转移时重复发送
      const sendStart = () => {
        if (startSent) return;
        startSent = true;
        controller.enqueue(
          encoder.encode(
            `event: start\ndata: ${JSON.stringify({ provider: usedProvider, model: usedModel })}\n\n`
          )
        );
      };

      // 沿链尝试：仅在连接建立阶段（未输出 token）出现连接级错误时切换下一个 Provider；
      // 一旦已输出 token 则不再整体重试（否则客户端会收到拼接的重复章节）。
      for (let i = 0; i < chain.length; i++) {
        const entry = chain[i];
        try {
          const adapter = createAdapter(entry.provider, { model: entry.model });
          usedProvider = adapter.provider;
          usedModel = adapter.model;

          await adapter.streamChat({
            messages,
            temperature,
            topP,
            maxTokens,
            signal: request.signal,
            onToken: (token: string) => {
              sendStart();
              tokenSent = true;
              totalTokens++;
              controller.enqueue(
                encoder.encode(
                  `event: token\ndata: ${JSON.stringify({ token })}\n\n`
                )
              );
            },
          });

          sendStart();
          // 空流防护：模型返回 0 token 且未被中断时，明确报错而非静默产出空章节（避免空白/疑似乱码观感）
          if (totalTokens === 0 && !request.signal.aborted) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({
                  error: '模型返回为空，请稍后重试或切换模型/Provider',
                  tokenSent: false,
                })}\n\n`
              )
            );
          } else {
            // 发送完成事件
            controller.enqueue(
              encoder.encode(
                `event: done\ndata: ${JSON.stringify({
                  totalTokens,
                  provider: usedProvider,
                  model: usedModel,
                })}\n\n`
              )
            );
          }
          if (!request.signal.aborted) {
            controller.close();
          }
          return;
        } catch (err) {
          // 用户主动中断：不做为错误上报，normal 关闭
          if (request.signal.aborted) {
            controller.close();
            return;
          }
          // 连接建立阶段（未输出 token）的连接级错误：切换下一个 Provider
          if (!tokenSent && isConnectionError(err) && i < chain.length - 1) {
            console.warn(
              `[llm/generate-chapter] Provider ${entry.provider} 连接失败（${err instanceof Error ? err.message : String(err)}），切换下一个`
            );
            continue;
          }
          // 发送错误事件
          sendStart();
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
          if (!request.signal.aborted) {
            controller.close();
          }
          return;
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
  return corsPreflightResponse();
}