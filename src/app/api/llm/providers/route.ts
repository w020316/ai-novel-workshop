// ============================================================================
// LLM Provider 探测 API
// 依据：spec 6.4 节 / 计划 P3.2
// 职责：返回服务端已配置的 Provider 列表与默认 Provider
// 路径：GET /api/llm/providers
// 用途：前端初始化时调用，决定是否允许 AI 操作、显示哪个 Provider 等
// ============================================================================
import { NextResponse } from 'next/server';
import {
  listConfiguredProviders,
  getDefaultProvider,
  getProviderConfig,
} from '@/lib/llm/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = listConfiguredProviders();
  const defaultProvider = getDefaultProvider();

  // 仅返回可公开信息，绝不暴露 API Key
  const providers = configured.map((p) => {
    const config = getProviderConfig(p);
    return {
      provider: config.provider,
      label: config.label,
      defaultModel: config.defaultModel,
      defaultEmbeddingModel: config.defaultEmbeddingModel,
      supportsJSON: config.supportsJSON,
      supportsStream: config.supportsStream,
      maxOutputTokens: config.maxOutputTokens,
    };
  });

  return NextResponse.json({
    providers,
    defaultProvider,
    configured: configured.length,
    ready: configured.length > 0,
  });
}
