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
import {
  createAdapter,
  callWithModelFallback,
  callWithProviderFallback,
  ProviderFallbackExhaustedError,
} from '@/lib/llm/adapter';
import { buildProviderChain, geminiModelChain, geminiPrimaryForTask } from '@/lib/llm/providers';
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

  // 3. 构建 Provider 故障转移链：请求显式指定（已配置才采用）→ 其余按优先级追加
  const chain = buildProviderChain(safeParseProvider(body.provider), body.model);
  if (chain.length === 0) {
    return NextResponse.json(
      {
        error:
          '服务端未配置任何 LLM Provider，请在 .env.local 中设置 GEMINI_API_KEY / ZHIPU_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY，或启用本地 Ollama（OLLAMA_ENABLED=true）',
      },
      { status: 503 }
    );
  }

  try {
    // 4. 沿链调用，连接级错误（DNS/超时/拒连）自动切换下一个 Provider
    const { result, provider } = await callWithProviderFallback(chain, async (entry) => {
      // Gemini 组合策略（B+C）：未显式指定 model 时按任务分级选主模型，并做模型级降级链
      if (entry.provider === 'gemini' && !body.model) {
        let usedModel = '';
        const chat = await callWithModelFallback(
          geminiModelChain(geminiPrimaryForTask(body.task)),
          (m) => {
            usedModel = m;
            return createAdapter('gemini', { model: m }).chat({
              messages,
              temperature: body.temperature,
              topP: body.topP,
              maxTokens: body.maxTokens,
              responseFormat: body.responseFormat,
            });
          },
          isRetryableError
        );
        return { chat, model: usedModel };
      }
      const adapter = createAdapter(entry.provider, { model: entry.model });
      const chat = await adapter.chat({
        messages,
        temperature: body.temperature,
        topP: body.topP,
        maxTokens: body.maxTokens,
        responseFormat: body.responseFormat,
      });
      return { chat, model: adapter.model };
    });

    return NextResponse.json({
      content: result.chat.content,
      usage: result.chat.usage,
      provider,
      model: result.model,
    });
  } catch (err) {
    // 5. 错误处理
    // 所有 Provider 均连接失败：聚合各失败原因返回，标记可重试
    if (err instanceof ProviderFallbackExhaustedError) {
      console.error('[llm/chat] 全部 Provider 连接失败:', err.message);
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 502 }
      );
    }

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
