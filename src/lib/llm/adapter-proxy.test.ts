import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 模拟 undici：捕获 ProxyAgent 构造参数与 fetch 的 dispatcher 注入
// （vi.mock 工厂会被提升到文件顶部，mock 需经 vi.hoisted 共享）
const { proxyAgentCtor, undiciFetch } = vi.hoisted(() => ({
  proxyAgentCtor: vi.fn(),
  undiciFetch: vi.fn(),
}));

vi.mock('undici', () => ({
  ProxyAgent: proxyAgentCtor,
  fetch: undiciFetch,
}));

import { createAdapter, getProxyFetch } from './adapter';

const originalEnv = { ...process.env };

describe('llm/adapter 按 Provider 代理（{PROVIDER}_PROXY）', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    proxyAgentCtor
      .mockReset()
      // ProxyAgent 以 new 调用：不能用箭头函数（不可构造）
      .mockImplementation(function () {
        return { __proxyAgent: true };
      });
    undiciFetch.mockReset().mockImplementation(async () => new Response('{"choices":[]}'));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('配置 GEMINI_PROXY 时 Gemini 请求应经 ProxyAgent 发出', async () => {
    process.env.GEMINI_PROXY = 'http://127.0.0.1:7890';
    const adapter = createAdapter('gemini', { apiKey: 'test-key' });

    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(proxyAgentCtor).toHaveBeenCalledWith('http://127.0.0.1:7890');
    expect(undiciFetch).toHaveBeenCalledTimes(1);
    const init = undiciFetch.mock.calls[0][1] as { dispatcher?: unknown };
    expect(init.dispatcher).toEqual({ __proxyAgent: true });
  });

  it('未配置代理时不注入 dispatcher（走全局 fetch）', async () => {
    delete process.env.GEMINI_PROXY;
    const globalFetch = vi.fn(async () => new Response('{"choices":[]}'));
    vi.stubGlobal('fetch', globalFetch);

    const adapter = createAdapter('gemini', { apiKey: 'test-key' });
    await adapter.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(proxyAgentCtor).not.toHaveBeenCalled();
    expect(undiciFetch).not.toHaveBeenCalled();
    expect(globalFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('代理只影响配置的 Provider，其他 Provider 保持直连', async () => {
    process.env.GEMINI_PROXY = 'http://127.0.0.1:7890';
    process.env.ZHIPU_API_KEY = 'test-zhipu';
    const globalFetch = vi.fn(async () => new Response('{"choices":[]}'));
    vi.stubGlobal('fetch', globalFetch);

    const zhipu = createAdapter('zhipu', { apiKey: 'test-zhipu' });
    await zhipu.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(proxyAgentCtor).not.toHaveBeenCalled();
    expect(undiciFetch).not.toHaveBeenCalled();
    expect(globalFetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('getProxyFetch 应按代理地址缓存 Agent（重复调用不重复构造）', () => {
    proxyAgentCtor.mockClear();
    getProxyFetch('http://127.0.0.1:9999');
    getProxyFetch('http://127.0.0.1:9999');
    expect(proxyAgentCtor).toHaveBeenCalledTimes(1);
  });
});
