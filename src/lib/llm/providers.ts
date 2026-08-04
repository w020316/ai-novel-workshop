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
export const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
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
 */
export function getProviderConfig(provider: LLMProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
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
 * 列出所有已配置的 Provider（按优先级排序，DeepSeek 优先）
 */
export function listConfiguredProviders(): LLMProvider[] {
  const order: LLMProvider[] = ['deepseek', 'zhipu', 'qwen'];
  return order.filter((p) => isProviderConfigured(p));
}

/**
 * 选择默认 Provider：优先级 deepseek > zhipu > qwen
 */
export function getDefaultProvider(): LLMProvider | null {
  const configured = listConfiguredProviders();
  return configured[0] ?? null;
}
