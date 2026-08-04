import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleAdapter, LLMApiError, isRetryableError } from './openai-compatible';
import { getProviderConfig, listConfiguredProviders, getDefaultProvider } from './providers';
import { createAdapter, createFirstAvailableAdapter } from './adapter';
import type { ChatMessage } from '@/types';

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body as Record<string, unknown>,
    text: async () => JSON.stringify(body),
    body: null,
  } as unknown as Response;
}

function mockFetchStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    json: async () => ({}),
    text: async () => '',
  } as unknown as Response;
}

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: '你是助手' },
  { role: 'user', content: '你好' },
];

describe('llm/providers', () => {
  describe('getProviderConfig', () => {
    it('应返回 DeepSeek 配置', () => {
      const c = getProviderConfig('deepseek');
      expect(c.provider).toBe('deepseek');
      expect(c.label).toBe('DeepSeek');
      expect(c.baseURL).toContain('deepseek.com');
      expect(c.envKey).toBe('DEEPSEEK_API_KEY');
      expect(c.defaultModel).toBeTruthy();
    });

    it('应返回智谱配置', () => {
      const c = getProviderConfig('zhipu');
      expect(c.provider).toBe('zhipu');
      expect(c.baseURL).toContain('bigmodel.cn');
    });

    it('应返回通义配置', () => {
      const c = getProviderConfig('qwen');
      expect(c.provider).toBe('qwen');
      expect(c.baseURL).toContain('aliyuncs.com');
    });

    it('所有 Provider 应支持 JSON 与 Stream', () => {
      const providers = ['deepseek', 'zhipu', 'qwen'] as const;
      for (const p of providers) {
        const c = getProviderConfig(p);
        expect(c.supportsJSON).toBe(true);
        expect(c.supportsStream).toBe(true);
      }
    });

    it('所有 Provider 应有合理的 maxOutputTokens', () => {
      const providers = ['deepseek', 'zhipu', 'qwen'] as const;
      for (const p of providers) {
        const c = getProviderConfig(p);
        expect(c.maxOutputTokens).toBeGreaterThanOrEqual(2048);
      }
    });
  });

  describe('listConfiguredProviders / getDefaultProvider', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.ZHIPU_API_KEY;
      delete process.env.QWEN_API_KEY;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('无任何 Key 时应返回空列表与 null', () => {
      expect(listConfiguredProviders()).toEqual([]);
      expect(getDefaultProvider()).toBeNull();
    });

    it('应列出已配置的 Provider', () => {
      process.env.DEEPSEEK_API_KEY = 'sk-deep';
      process.env.QWEN_API_KEY = 'sk-qwen';
      const list = listConfiguredProviders();
      expect(list).toContain('deepseek');
      expect(list).toContain('qwen');
      expect(list).not.toContain('zhipu');
    });

    it('默认 Provider 应优先选择 DeepSeek', () => {
      process.env.ZHIPU_API_KEY = 'sk-zhipu';
      process.env.QWEN_API_KEY = 'sk-qwen';
      process.env.DEEPSEEK_API_KEY = 'sk-deep';
      expect(getDefaultProvider()).toBe('deepseek');
    });

    it('DeepSeek 未配置时应回退到智谱', () => {
      process.env.ZHIPU_API_KEY = 'sk-zhipu';
      expect(getDefaultProvider()).toBe('zhipu');
    });
  });
});

describe('llm/OpenAICompatibleAdapter', () => {
  describe('chat', () => {
    it('应正确解析 chat 响应', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [
            {
              message: { role: 'assistant', content: '你好，我是助手。' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const result = await adapter.chat({ messages: MESSAGES });
      expect(result.content).toBe('你好，我是助手。');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(8);

      const call = fetchImpl.mock.calls[0];
      const init = call[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test',
      });
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('deepseek-chat');
      expect(body.messages).toHaveLength(2);
      expect(body.stream).toBe(false);
    });

    it('应支持自定义 model', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: 'ok' } }],
          usage: {},
        })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        model: 'deepseek-reasoner',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await adapter.chat({ messages: MESSAGES });
      const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
      expect(body.model).toBe('deepseek-reasoner');
    });

    it('应传递 temperature / topP / maxTokens', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: 'ok' } }],
          usage: {},
        })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await adapter.chat({
        messages: MESSAGES,
        temperature: 0.5,
        topP: 0.8,
        maxTokens: 1024,
      });

      const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
      expect(body.temperature).toBe(0.5);
      expect(body.top_p).toBe(0.8);
      expect(body.max_tokens).toBe(1024);
    });

    it('应支持 JSON 响应格式', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({
          choices: [{ message: { content: '{"key":"value"}' } }],
          usage: {},
        })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await adapter.chat({ messages: MESSAGES, responseFormat: 'json' });

      const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('应在 HTTP 错误时抛出 LLMApiError', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({ error: { message: 'Invalid API Key', type: 'auth_error' } }, 401)
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'invalid',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await expect(adapter.chat({ messages: MESSAGES })).rejects.toThrow(LLMApiError);
      try {
        await adapter.chat({ messages: MESSAGES });
      } catch (e) {
        expect(e).toBeInstanceOf(LLMApiError);
        expect((e as LLMApiError).statusCode).toBe(401);
        expect((e as LLMApiError).provider).toBe('deepseek');
      }
    });

    it('应在响应含 error 字段时抛出 LLMApiError', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({
          error: { message: 'Rate limited', type: 'rate_limit_error' },
        })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('qwen'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await expect(adapter.chat({ messages: MESSAGES })).rejects.toThrow('Rate limited');
    });
  });

  describe('embedding', () => {
    it('应正确解析 embedding 响应', async () => {
      const vec = [0.1, 0.2, 0.3, 0.4];
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({
          data: [{ embedding: vec, index: 0 }],
          usage: { prompt_tokens: 4, total_tokens: 4 },
        })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const result = await adapter.embedding('测试文本');
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(4);
      expect(Array.from(result).map((v) => Math.round(v * 10) / 10)).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('应在 embedding 为空时抛出错误', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockFetchResponse({ data: [], usage: {} })
      );

      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await expect(adapter.embedding('测试')).rejects.toThrow('Embedding 返回为空');
    });
  });

  describe('streamChat', () => {
    it('应正确解析 SSE 流', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"！"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const fetchImpl = vi.fn().mockResolvedValue(mockFetchStream(sseChunks));
      const adapter = new OpenAICompatibleAdapter({
        config: getProviderConfig('deepseek'),
        apiKey: 'sk-test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      const tokens: string[] = [];
      await adapter.streamChat({
        messages: MESSAGES,
        onToken: (t) => tokens.push(t),
      });

      expect(tokens.join('')).toBe('你好！');
    });
  });
});

describe('llm/adapter', () => {
  describe('createAdapter', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
      process.env.DEEPSEEK_API_KEY = 'sk-deep';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('应使用环境变量创建 adapter', () => {
      const adapter = createAdapter('deepseek');
      expect(adapter).toBeDefined();
      expect(adapter.chat).toBeDefined();
      expect(adapter.streamChat).toBeDefined();
      expect(adapter.embedding).toBeDefined();
    });

    it('无 API Key 时应抛出错误', () => {
      delete process.env.DEEPSEEK_API_KEY;
      expect(() => createAdapter('deepseek')).toThrow('未配置');
    });

    it('应从项目配置创建 adapter', () => {
      const adapter = createAdapter('deepseek', { model: 'deepseek-reasoner' });
      expect(adapter).toBeDefined();
    });

    it('应支持自定义 fetch', () => {
      const fetchImpl = vi.fn();
      const adapter = createAdapter('deepseek', {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('createFirstAvailableAdapter', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.ZHIPU_API_KEY;
      delete process.env.QWEN_API_KEY;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('无任何配置时应返回 null', () => {
      expect(createFirstAvailableAdapter()).toBeNull();
    });

    it('应返回第一个配置的 Provider', () => {
      process.env.ZHIPU_API_KEY = 'sk-zhipu';
      process.env.QWEN_API_KEY = 'sk-qwen';
      const adapter = createFirstAvailableAdapter();
      expect(adapter).not.toBeNull();
      expect(adapter!.chat).toBeDefined();
    });
  });
});

describe('llm/isRetryableError', () => {
  it('LLMApiError 5xx 应可重试', () => {
    expect(isRetryableError(new LLMApiError('err', 502, '', 'deepseek'))).toBe(true);
    expect(isRetryableError(new LLMApiError('err', 503, '', 'deepseek'))).toBe(true);
  });

  it('LLMApiError 429 应可重试', () => {
    expect(isRetryableError(new LLMApiError('err', 429, '', 'deepseek'))).toBe(true);
  });

  it('LLMApiError 408 应可重试', () => {
    expect(isRetryableError(new LLMApiError('err', 408, '', 'deepseek'))).toBe(true);
  });

  it('LLMApiError 4xx 非可重试列表应不可重试', () => {
    expect(isRetryableError(new LLMApiError('err', 400, '', 'deepseek'))).toBe(false);
    expect(isRetryableError(new LLMApiError('err', 401, '', 'deepseek'))).toBe(false);
    expect(isRetryableError(new LLMApiError('err', 403, '', 'deepseek'))).toBe(false);
  });

  it('AbortError 应可重试', () => {
    const err = new Error('timeout');
    err.name = 'AbortError';
    expect(isRetryableError(err)).toBe(true);
  });

  it('TypeError（网络错误）应可重试', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
  });

  it('普通 Error 应不可重试', () => {
    expect(isRetryableError(new Error('unknown'))).toBe(false);
  });
});