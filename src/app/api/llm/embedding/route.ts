// ============================================================================
// LLM Embedding 代理 API
// 依据：spec 6.4 节 / 计划 P3.2
// 职责：
// 1. 接收前端 embedding 请求（text 或 texts 批量）
// 2. 从环境变量读取 API Key
// 3. 调用对应 Provider 的 adapter
// 4. 返回向量（普通数组，便于 JSON 传输）
// 路径：POST /api/llm/embedding
// 说明：transformers.js 本地计算失败或需特定 Provider 模型时降级使用
// ============================================================================
import { NextResponse } from 'next/server';
import { createAdapter, createFirstAvailableAdapter } from '@/lib/llm/adapter';
import { getDefaultProvider } from '@/lib/llm/providers';
import { LLMApiError, isRetryableError } from '@/lib/llm/openai-compatible';
import type { LLMProvider } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Embedding 计算可能较慢，放宽超时
export const maxDuration = 60;

interface EmbeddingRequestBody {
  /** 单条文本 */
  text?: string;
  /** 批量文本（与 text 二选一） */
  texts?: string[];
  provider?: LLMProvider;
  model?: string;
}

function safeParseProvider(value: unknown): LLMProvider | undefined {
  if (value === 'deepseek' || value === 'zhipu' || value === 'qwen') {
    return value;
  }
  return undefined;
}

export async function POST(request: Request) {
  // 1. 解析请求体
  let body: EmbeddingRequestBody;
  try {
    body = (await request.json()) as EmbeddingRequestBody;
  } catch {
    return NextResponse.json(
      { error: '请求体不是合法 JSON' },
      { status: 400 }
    );
  }

  // 2. 校验输入文本
  const texts: string[] = [];
  if (typeof body.text === 'string' && body.text.length > 0) {
    texts.push(body.text);
  } else if (
    Array.isArray(body.texts) &&
    body.texts.length > 0 &&
    body.texts.every((t) => typeof t === 'string')
  ) {
    texts.push(...body.texts);
  } else {
    return NextResponse.json(
      { error: '请提供 text（非空字符串）或 texts（非空字符串数组）' },
      { status: 400 }
    );
  }

  // 限制单次最大批量，避免请求过大
  if (texts.length > 16) {
    return NextResponse.json(
      { error: '单次最多处理 16 条文本' },
      { status: 400 }
    );
  }

  // 3. 选择 Provider
  const provider = safeParseProvider(body.provider) ?? getDefaultProvider();

  try {
    const adapter = provider
      ? createAdapter(provider, { model: body.model })
      : createFirstAvailableAdapter();

    if (!adapter) {
      return NextResponse.json(
        {
          error:
            '服务端未配置任何 LLM Provider，请在 .env.local 中设置 DEEPSEEK_API_KEY / ZHIPU_API_KEY / QWEN_API_KEY',
        },
        { status: 503 }
      );
    }

    // 4. 调用 embedding（适配器目前单条调用，这里顺序执行批量）
    const vectors: number[][] = [];
    let totalPromptTokens = 0;
    for (const t of texts) {
      const vec = await adapter.embedding(t, body.model);
      vectors.push(Array.from(vec));
      totalPromptTokens += Math.ceil(t.length / 4); // 近似估算
    }

    return NextResponse.json({
      vectors,
      count: vectors.length,
      dim: vectors[0]?.length ?? 0,
      provider: provider ?? 'auto',
      model: body.model ?? adapter.model,
      usage: { promptTokens: totalPromptTokens },
    });
  } catch (err) {
    if (err instanceof LLMApiError) {
      console.error('[llm/embedding] LLMApiError:', {
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

    if (err instanceof Error && err.message.includes('未配置')) {
      console.error('[llm/embedding] 配置错误:', err.message);
      return NextResponse.json({ error: err.message }, { status: 503 });
    }

    console.error('[llm/embedding] 未知错误:', err);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
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
