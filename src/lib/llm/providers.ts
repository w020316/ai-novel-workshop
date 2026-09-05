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
  ollama: {
    provider: 'ollama',
    label: 'Ollama（本地模型）',
    baseURL: 'http://localhost:11434/v1',
    chatPath: '/chat/completions',
    embeddingPath: '/embeddings',
    envKey: 'OLLAMA_API_KEY',
    defaultModel: 'qwen3:8b',
    defaultEmbeddingModel: 'nomic-embed-text',
    supportsJSON: true,
    supportsStream: true,
    maxOutputTokens: 8192,
    rateLimitRPM: 0, // 本地部署，无云端限流
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
 * Ollama 特殊：本地部署无需 API Key，显式启用（OLLAMA_ENABLED=true）
 * 或自定义端点（OLLAMA_BASE_URL）即视为已配置，避免云端部署误连 localhost
 */
export function isProviderConfigured(provider: LLMProvider): boolean {
  if (provider === 'ollama') {
    return process.env.OLLAMA_ENABLED === 'true' || Boolean(process.env.OLLAMA_BASE_URL);
  }
  return Boolean(getAPIKey(provider));
}

/**
 * 列出所有已配置的 Provider（按优先级排序）
 * 可通过环境变量 LLM_PROVIDER_ORDER 自定义顺序（逗号分隔），
 * 默认为 gemini > zhipu > deepseek > qwen > ollama（ollama 仅在显式启用时参与）
 */
export function listConfiguredProviders(): LLMProvider[] {
  const envOrder = process.env['LLM_PROVIDER_ORDER'];
  const order: LLMProvider[] = envOrder
    ? (envOrder.split(',').map((s) => s.trim()) as LLMProvider[]).filter((p) =>
        p === 'gemini' || p === 'deepseek' || p === 'zhipu' || p === 'qwen' || p === 'ollama'
      )
    : ['gemini', 'zhipu', 'deepseek', 'qwen', 'ollama'];
  return order.filter((p) => isProviderConfigured(p));
}

/**
 * 选择默认 Provider：优先级遵循 listConfiguredProviders 的顺序
 */
export function getDefaultProvider(): LLMProvider | null {
  const configured = listConfiguredProviders();
  return configured[0] ?? null;
}

// ============ Gemini 任务分级 + 模型降级链（组合策略 B+C） ============
/** 高质量任务：章节正文 / 重写 / 去AI味（单章少数调用，用质量最高的 3.6，保住正文水平） */
export const GEMINI_QUALITY_MODEL = 'gemini-3.6-flash';
/** 批量/低敏感任务：设定设计 / 一致性校验 / 标题 / 摘要 / 灵感（高频，用 3.1-flash-lite，500 RPD 扛量） */
export const GEMINI_BULK_MODEL = 'gemini-3.1-flash-lite';
/** 中间保底模型（降级链中段） */
export const GEMINI_MID_MODEL = 'gemini-3.5-flash';
/** 单次 gemini 处理的完整降级链（不含 provider 级回退到 GLM） */
export const GEMINI_MODEL_CHAIN = [
  GEMINI_QUALITY_MODEL,
  GEMINI_MID_MODEL,
  GEMINI_BULK_MODEL,
];

/**
 * 返回以主模型打头的降级模型列表（主模型放最前，其余按链排列，自身去掉重复）。
 * - 质量路径主模型：GEMINI_QUALITY_MODEL
 * - 批量路径主模型：GEMINI_BULK_MODEL
 */
export function geminiModelChain(startModel: string): string[] {
  return [startModel, ...GEMINI_MODEL_CHAIN.filter((m) => m !== startModel)];
}

/** 对正文质量敏感的任务：命中用高质量模型，否则走批量模型 */
const QUALITY_TASKS = new Set(['write', 'rewrite', 'humanize']);

/** Gemini 主模型按任务选择：质量型任务 → 3.6-flash；批量型 → 3.1-flash-lite */
export function geminiPrimaryForTask(task?: string): string {
  return task && QUALITY_TASKS.has(task) ? GEMINI_QUALITY_MODEL : GEMINI_BULK_MODEL;
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

/**
 * 构建 Provider 故障转移链（连接错误级 failover 用）：
 * - 请求的 provider 已配置 → 排在链首并携带请求模型
 * - 其余已配置 provider 按优先级追加，各自套用默认模型
 * 无任何已配置 provider 时返回空数组。
 */
export function buildProviderChain(
  requested?: LLMProvider,
  requestedModel?: string
): Array<{ provider: LLMProvider; model?: string }> {
  const configured = listConfiguredProviders();
  const head =
    requested && configured.includes(requested)
      ? [{ provider: requested, model: requestedModel }]
      : [];
  return [
    ...head,
    ...configured
      .filter((p) => p !== head[0]?.provider)
      .map((p) => ({ provider: p, model: getProviderConfig(p).defaultModel })),
  ];
}
