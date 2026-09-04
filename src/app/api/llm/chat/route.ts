// ============================================================================
// LLM Chat 代理 API
// 依据：spec 6.4 节 / 计划 P3.2
// 职责：
// 1. 接收前端 chat 请求（messages + 可选参数）
// 2. 从环境变量读取 API Key（不暴露给客户端）
// 3. 调用对应 Provider 的 adapter
// 4. 返回 content + usage
// 路径：POST /api/llm/chat
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { createAdapter, createFirstAvailableAdapter, callWithModelFallback } from '@/lib/llm/adapter';
import { resolveProvider, geminiModelChain, geminiPrimaryForTask } from '@/lib/llm/providers';
import { LLMApiError, isRetryableError } from '@/lib/llm/openai-compatible';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { validateMessages } from '@/lib/llm/message-validation';
import { safeParseProvider, corsPreflightResponse } from '@/lib/api/llm-shared';
import type { ChatMessage, LLMProvider } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatRequestBody {
  messages: ChatMessage[];
  provider?: LLMProvider;
  model?: string;
  task?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export async function POST(request: NextRequest) {
  // 0. 限流保护（防配额滥用）
  const rateLimited = enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  // 1. 解析请求体
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json(
      { error: '请求体不是合法 JSON' },
      { status: 400 }
    );
  }

  // 2. 校验必填字段（结构与 role 白名单校验抽离到 message-validation 共享工具）
  const { messages } = body;
  const messageError = validateMessages(messages);
  if (messageError) {
    return NextResponse.json({ error: messageError }, { status: 400 });
  }

  // 3. 选择 Provider：请求显式指定（已配置才采用）→ 默认 Provider；模型随之回退
  const resolved = resolveProvider(safeParseProvider(body.provider), body.model);

  try {
    const adapter = resolved
      ? createAdapter(resolved.provider, { model: resolved.model })
      : createFirstAvailableAdapter();

    if (!adapter) {
      return NextResponse.json(
        {
          error:
            '服务端未配置任何 LLM Provider，请在 .env.local 中设置 GEMINI_API_KEY / ZHIPU_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY',
        },
        { status: 503 }
      );
    }

    // 4. 调用 chat
    // Gemini 组合策略（B+C）：未显式指定 model 时按任务分级选主模型，并做模型级降级链
    const gemini = resolved?.provider === 'gemini' && !body.model;
    let usedGeminiModel = '';
    const result = gemini
      ? await callWithModelFallback(
          geminiModelChain(geminiPrimaryForTask(body.task)),
          (m) => {
            usedGeminiModel = m;
            return createAdapter('gemini', { model: m }).chat({
              messages,
              temperature: body.temperature,
              topP: body.topP,
              maxTokens: body.maxTokens,
              responseFormat: body.responseFormat,
            });
          },
          isRetryableError
        )
      : await adapter.chat({
          messages,
          temperature: body.temperature,
          topP: body.topP,
          maxTokens: body.maxTokens,
          responseFormat: body.responseFormat,
        });

    return NextResponse.json({
      content: result.content,
      usage: result.usage,
      provider: resolved?.provider ?? 'auto',
      model: gemini ? usedGeminiModel : (resolved?.model ?? adapter.model),
    });
  } catch (err) {
    // 5. 错误处理
    if (err instanceof LLMApiError) {
      console.error('[llm/chat] LLMApiError:', {
        provider: err.provider,
        status: err.statusCode,
        message: err.message,
      });
      return NextResponse.json(
        {
          error: err.message,
          provider: err.provider,
          retryable: isRetryableError(err),
        },
        { status: err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500 }
      );
    }

    // 未配置 API Key 等启动期错误
    if (err instanceof Error && err.message.includes('未配置')) {
      console.error('[llm/chat] 配置错误:', err.message);
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    console.error('[llm/chat] 未知错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// 预检请求支持
export async function OPTIONS() {
  return corsPreflightResponse();
}
