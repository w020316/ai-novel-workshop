// ============================================================================
// P2-5 本地/离线模型端点（Ollama）单测
// 覆盖：配置默认值与环境变量覆盖、启用门控、resolveProvider 回退、
//       createAdapter 免 Key、chat/embedding 请求 URL 与模型、降级链纳入
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProviderConfig,
  isProviderConfigured,
  listConfiguredProviders,
  getDefaultProvider,
  resolveProvider,
} from './providers';
import { createAdapter, createFirstAvailableAdapter } from './adapter';
import { safeParseProvider } from '@/lib/api/llm-shared';
import type { ChatMessage } from '@/types';

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: '你是助手' },
  { role: 'user', content: '你好' },
];

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body as Record<string, unknown>,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('llm/ollama（P2-5 本地模型端点）', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OLLAMA_ENABLED;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_DEFAULT_MODEL;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ZHIPU_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getProviderConfig', () => {
    it('应返回 Ollama 默认配置（localhost:11434 OpenAI 兼容端点）', () => {
      const c = getProviderConfig('ollama');
      expect(c.provider).toBe('ollama');
      expect(c.baseURL).toBe('http://localhost:11434/v1');
      expect(c.chatPath).toBe('/chat/completions');
      expect(c.embeddingPath).toBe('/embeddings');
      expect(c.defaultModel).toBe('qwen3:8b');
      expect(c.defaultEmbeddingModel).toBe('nomic-embed-text');
      expect(c.supportsJSON).toBe(true);
      expect(c.supportsStream).toBe(true);
    });

    it('OLLAMA_BASE_URL / OLLAMA_DEFAULT_MODEL 应覆盖默认值', () => {
      process.env.OLLAMA_BASE_URL = 'http://192.168.1.5:11434/v1';
      process.env.OLLAMA_DEFAULT_MODEL = 'llama3.1:8b';
      const c = getProviderConfig('ollama');
      expect(c.baseURL).toBe('http://192.168.1.5:11434/v1');
      expect(c.defaultModel).toBe('llama3.1:8b');
    });
  });

  describe('isProviderConfigured（启用门控）', () => {
    it('未显式启用时不应视为已配置（防云端误连 localhost）', () => {
      expect(isProviderConfigured('ollama')).toBe(false);
    });

    it('OLLAMA_ENABLED=true 即视为已配置（无需 API Key）', () => {
      process.env.OLLAMA_ENABLED = 'true';
      expect(isProviderConfigured('ollama')).toBe(true);
    });

    it('设置 OLLAMA_BASE_URL 也视为已配置', () => {
      process.env.OLLAMA_BASE_URL = 'http://192.168.1.5:11434/v1';
      expect(isProviderConfigured('ollama')).toBe(true);
    });
  });

  describe('listConfiguredProviders / getDefaultProvider', () => {
    it('仅启用 Ollama 时应被列入且为默认 Provider', () => {
      process.env.OLLAMA_ENABLED = 'true';
      expect(listConfiguredProviders()).toEqual(['ollama']);
      expect(getDefaultProvider()).toBe('ollama');
    });

    it('云端 Key 与 Ollama 同时可用时云端优先', () => {
      process.env.GEMINI_API_KEY = 'sk-g';
      process.env.OLLAMA_ENABLED = 'true';
      expect(getDefaultProvider()).toBe('gemini');
      expect(listConfiguredProviders()).toEqual(['gemini', 'ollama']);
    });

    it('LLM_PROVIDER_ORDER 可将 ollama 提前', () => {
      process.env.GEMINI_API_KEY = 'sk-g';
      process.env.OLLAMA_ENABLED = 'true';
      process.env.LLM_PROVIDER_ORDER = 'ollama,gemini';
      expect(getDefaultProvider()).toBe('ollama');
    });
  });

  describe('resolveProvider', () => {
    it('请求 ollama 且已启用 → 采用它及请求模型', () => {
      process.env.OLLAMA_ENABLED = 'true';
      const r = resolveProvider('ollama', 'qwen3:8b');
      expect(r).toEqual({ provider: 'ollama', model: 'qwen3:8b' });
    });

    it('请求 ollama 但未启用 → 回退到云端 Provider', () => {
      process.env.ZHIPU_API_KEY = 'sk-zhipu';
      const r = resolveProvider('ollama', 'qwen3:8b');
      expect(r).not.toBeNull();
      expect(r!.provider).toBe('zhipu');
    });
  });

  describe('createAdapter', () => {
    it('未启用时应抛出带 OLLAMA_ENABLED 提示的错误', () => {
      expect(() => createAdapter('ollama')).toThrow(/OLLAMA_ENABLED/);
    });

    it('启用后无需 API Key 即可创建适配器', () => {
      process.env.OLLAMA_ENABLED = 'true';
      const adapter = createAdapter('ollama');
      expect(adapter.provider).toBe('ollama');
      expect(adapter.model).toBe('qwen3:8b');
    });
  });

  describe('chat / embedding 请求', () => {
    it('chat 应请求 localhost:11434/v1/chat/completions 且携带启用后的模型', async () => {
      process.env.OLLAMA_ENABLED = 'true';
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { role: 'assistant', content: '你好！' } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        })
      );
      const adapter = createAdapter('ollama', { model: 'qwen3:8b', fetchImpl: fetchMock });
      const result = await adapter.chat({ messages: MESSAGES });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.model).toBe('qwen3:8b');
      expect(body.stream).toBe(false);
      expect(result.content).toBe('你好！');
    });

    it('embedding 应请求 /v1/embeddings 并使用 nomic-embed-text 默认模型', async () => {
      process.env.OLLAMA_ENABLED = 'true';
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
      );
      const adapter = createAdapter('ollama', { fetchImpl: fetchMock });
      const vec = await adapter.embedding('测试文本');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/v1/embeddings');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.model).toBe('nomic-embed-text');
      expect(Array.from(vec)).toHaveLength(3);
      expect(vec[0]).toBeCloseTo(0.1, 5);
      expect(vec[1]).toBeCloseTo(0.2, 5);
      expect(vec[2]).toBeCloseTo(0.3, 5);
    });
  });

  describe('createFirstAvailableAdapter（仅 Ollama 可用的降级兜底）', () => {
    it('云端全未配置且 Ollama 已启用 → 兜底到 ollama 适配器', () => {
      process.env.OLLAMA_ENABLED = 'true';
      const adapter = createFirstAvailableAdapter();
      expect(adapter?.provider).toBe('ollama');
    });

    it('全部未启用 → 返回 null', () => {
      expect(createFirstAvailableAdapter()).toBeNull();
    });
  });

  describe('safeParseProvider 白名单', () => {
    it('ollama 应通过白名单解析', () => {
      expect(safeParseProvider('ollama')).toBe('ollama');
    });
  });
});
