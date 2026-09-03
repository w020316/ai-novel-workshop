// ============================================================================
// LLM Provider 配置
// 依据：spec 6.4 节
// 说明：DeepSeek / 智谱 GLM / 通义 Qwen 均兼容 OpenAI 协议，
//       统一通过 baseURL + apiKey + model 切换。
// ============================================================================
import type { LLMProvider } from '@/types';

export interface ProviderConfig {
  /** Provider 标识 */
  provider: LLMProvider;
  /** 显示名称 */
  label: string;
  /** OpenAI 兼容 API 基础 URL */
  baseURL: string;
  /** Chat Completions 路径（追加到 baseURL 后） */
  chatPath: string;
  /** Embeddings 路径 */
  embeddingPath: string;
  /** API Key 环境变量名 */
  envKey: string;
  /** 默认模型 */
  defaultModel: string;
  /** Embedding 默认模型 */
  defaultEmbeddingModel: string;
  /** 是否支持 response_format: json_object */
  supportsJSON: boolean;
  /** 是否支持流式输出 */
  supportsStream: boolean;
  /** 单次最大输出 tokens */
  maxOutputTokens: number;
  /** 速率限制（RPM，仅信息） */
  rateLimitRPM: number;
}

// ============ Provider 配置表 ============
// 说明：gemini（主用，免费额度充足）走 Google AI Studio 的 OpenAI 兼容端点；
//       zhipu（智谱 GLM）为辅助降级；deepseek / qwen 为额外备份。
export const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  gemini: {
    provider: 'gemini',
    label: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatPath: '/chat/completions',
    embeddingPath: '/embeddings',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-3.6-flash',
    defaultEmbeddingModel: 'text-embedding-004',
    supportsJSON: true,
    supportsStream: true,
    maxOutputTokens: 8192,
    rateLimitRPM: 15,
  },
  deepseek: {
    provider: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    chatPath: '/chat/completions',
    embeddingPath: '/embeddings',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    defaultEmbeddingModel: 'deepseek-embedding',
    supportsJSON: true,
    supportsStream: true,
    maxOutputTokens: 8192,
    rateLimitRPM: 60,
  },
  zhipu: {
    provider: 'zhipu',
    label: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    chatPath: '/chat/completions',
    embeddingPath: '/embeddings',
    envKey: 'ZHIPU_API_KEY',
    defaultModel: 'glm-4-flash',
    defaultEmbeddingModel: 'embedding-3',
    supportsJSON: true,
    supportsStream: true,
    maxOutputTokens: 4096,
    rateLimitRPM: 100,
  },
  qwen: {
    provider: 'qwen',
    label: '通义 Qwen',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatPath: '/chat/completions',
    embeddingPath: '/embeddings',
    envKey: 'QWEN_API_KEY',
    defaultModel: 'qwen-turbo',
    defaultEmbeddingModel: 'text-embedding-v2',
    supportsJSON: true,
    supportsStream: true,
    maxOutputTokens: 8192,
    rateLimitRPM: 60,
  },
};

/**
 * 获取 Provider 配置
 * 支持通过环境变量覆盖 baseURL 与默认模型（用于自建 OpenAI 兼容网关 / 备用站）：
 * - {PROVIDER}_BASE_URL（如 DEEPSEEK_BASE_URL）覆盖 baseURL
 * - {PROVIDER}_DEFAULT_MODEL（如 DEEPSEEK_DEFAULT_MODEL）覆盖 defaultModel
 */
export function getProviderConfig(provider: LLMProvider): ProviderConfig {
  const base = PROVIDER_CONFIGS[provider];
  const envBaseURL = process.env[`${provider.toUpperCase()}_BASE_URL`];
  const envModel = process.env[`${provider.toUpperCase()}_DEFAULT_MODEL`];
  return {
    ...base,
    baseURL: envBaseURL ?? base.baseURL,
    defaultModel: envModel ?? base.defaultModel,
  };
}

/**
 * 从环境变量读取 API Key
 */
export function getAPIKey(provider: LLMProvider): string | undefined {
  const config = getProviderConfig(provider);
  return process.env[config.envKey];
}

/**
 * 检查 Provider 是否已配置（API Key 可用）
 */
export function isProviderConfigured(provider: LLMProvider): boolean {
  return Boolean(getAPIKey(provider));
}

/**
 * 列出所有已配置的 Provider（按优先级排序）
 * 可通过环境变量 LLM_PROVIDER_ORDER 自定义顺序（逗号分隔），默认为 gemini > zhipu > deepseek > qwen
 */
export function listConfiguredProviders(): LLMProvider[] {
  const envOrder = process.env['LLM_PROVIDER_ORDER'];
  const order: LLMProvider[] = envOrder
    ? (envOrder.split(',').map((s) => s.trim()) as LLMProvider[]).filter((p) =>
        p === 'gemini' || p === 'deepseek' || p === 'zhipu' || p === 'qwen'
      )
    : ['gemini', 'zhipu', 'deepseek', 'qwen'];
  return order.filter((p) => isProviderConfigured(p));
}

/**
 * 选择默认 Provider：优先级遵循 listConfiguredProviders 的顺序
 */
export function getDefaultProvider(): LLMProvider | null {
  const configured = listConfiguredProviders();
  return configured[0] ?? null;
}

/**
 * 解析实际可用的 Provider 与模型（健壮回退）：
 * - 请求的 provider 已配置 key → 使用它及其请求模型
 * - 请求的 provider 未配置（如 gemini 无 key）→ 回退到第一个已配置 provider，并套用其默认模型
 * 若无任何已配置 provider，返回 null。
 */
export function resolveProvider(
  requested?: LLMProvider,
  requestedModel?: string
): { provider: LLMProvider; model?: string } | null {
  if (requested && isProviderConfigured(requested)) {
    return { provider: requested, model: requestedModel };
  }
  const fallback = getDefaultProvider();
  if (!fallback) return null;
  return { provider: fallback, model: getProviderConfig(fallback).defaultModel };
}
