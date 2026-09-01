// ============================================================================
// 前端流式接收工具测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChapter, streamChat } from './client-stream';
import type { ChatMessage } from '@/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function sseStream(encoded: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(encoded));
      controller.close();
    },
  });
}

function makeReader(readImpl: () => Promise<{ done: boolean; value?: Uint8Array }>) {
  return {
    read: vi.fn(readImpl),
    releaseLock: vi.fn(),
  };
}

describe('streamChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应解析完整 SSE 事件流并触发各回调', async () => {
    const sse = [
      '',
      'event: start',
      'data: {"provider":"zhipu","model":"glm-4-flash"}',
      '',
      '',
      'event: token',
      'data: {"token":"第"}',
      'event: token',
      'data: {"token":"一章"}',
      'event: progress',
      'data: {"status":"retrying","attempt":2,"error":"网络抖动"}',
      'event: done',
      'data: {"totalTokens":4,"provider":"zhipu","model":"glm-4-flash"}',
      '',
      'event: error',
      'data: {"error":"手动错误"}',
      '',
    ].join('\n');

    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sse) });

    const onStart = vi.fn();
    const onToken = vi.fn();
    const onRetry = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamChapter(
      { messages: [] },
      { onStart, onToken, onRetry, onDone, onError }
    );

    expect(onStart).toHaveBeenCalledWith({ provider: 'zhipu', model: 'glm-4-flash' });
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenNthCalledWith(1, '第');
    expect(onToken).toHaveBeenNthCalledWith(2, '一章');
    expect(onRetry).toHaveBeenCalledWith(2, '网络抖动');
    expect(onDone).toHaveBeenCalledWith({ totalTokens: 4, provider: 'zhipu', model: 'glm-4-flash' });
    expect(onError).toHaveBeenCalledWith('手动错误');
  });

  it('多读循环可连续解析多个自包含事件', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // 每个 read() 都包含完整的「事件头 + data」自包含事件（event 与 data 之间无空行）
        controller.enqueue(encoder.encode('event: token\ndata: {"token":"甲"}\n\n'));
        controller.enqueue(encoder.encode('event: token\ndata: {"token":"乙"}\nevent: done\ndata: {"totalTokens":2}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, body });

    const onToken = vi.fn();
    const onDone = vi.fn();

    await streamChapter({ messages: [] }, { onToken, onDone });

    // 自包含事件（event 与 data 在同一 read）可正常派发
    expect(onToken).toHaveBeenCalledWith('甲');
    expect(onToken).toHaveBeenCalledWith('乙');
    expect(onDone).toHaveBeenCalledWith({ totalTokens: 2, provider: '', model: '' });
  });

  it('事件头与 data 被拆分到不同 read 分块时仍能正确关联并派发', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // event: 头与 data: 体跨 read 分块
        controller.enqueue(encoder.encode('event: token\ndata: {"t'));
        controller.enqueue(encoder.encode('oken":"跨块"}\n\n'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({ ok: true, body });

    const onToken = vi.fn();
    await streamChapter({ messages: [] }, { onToken });

    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith('跨块');
  });

  it('应忽略空 data 与无法解析的 JSON', async () => {
    const sse = [
      'event: token',
      'data: {"token":""}', // 空 token，不触发 onToken
      'event: puzzle',
      'data: 这不是JSON',
      'event: progress',
      'data: {"status":"ok"}', // 非 retrying，不触发 onRetry
      'event: unknown',
      'data: {"foo":"bar"}',
      '',
    ].join('\n');
    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sse) });

    const onToken = vi.fn();
    const onRetry = vi.fn();

    await streamChapter({ messages: [] }, { onToken, onRetry });

    expect(onToken).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('HTTP 非 2xx 时读取 json.error 并触发 onError', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({ error: '限流' }),
    });

    const onError = vi.fn();
    await streamChapter({ messages: [] }, { onError });

    expect(onError).toHaveBeenCalledWith('限流');
  });

  it('HTTP 非 2xx 且 json 解析失败时回退到请求失败', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    });

    const onError = vi.fn();
    await streamChapter({ messages: [] }, { onError });

    expect(onError).toHaveBeenCalledWith('请求失败');
  });

  it('响应体为空时触发 onError(响应体为空)', async () => {
    mockFetch.mockResolvedValue({ ok: true, body: null });

    const onError = vi.fn();
    await streamChapter({ messages: [] }, { onError });

    expect(onError).toHaveBeenCalledWith('响应体为空');
  });

  it('应把 signal 透传给 fetch', async () => {
    mockFetch.mockResolvedValue({ ok: true, body: sseStream('') });

    const ctrl = new AbortController();
    await streamChapter({ messages: [], signal: ctrl.signal }, {});

    expect(mockFetch).toHaveBeenCalled();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/llm/generate-chapter');
    expect(init.signal).toBe(ctrl.signal);
    expect(init.method).toBe('POST');
    const bodyObj = JSON.parse(init.body);
    expect(bodyObj).toHaveProperty('messages');
  });

  it('AbortError 中止时触发 onDone 而非 onError', async () => {
    const reader = makeReader(() => {
      const err = new Error('aborted') as Error & { name: string };
      err.name = 'AbortError';
      return Promise.reject(err);
    });
    mockFetch.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const onDone = vi.fn();
    const onError = vi.fn();

    await streamChapter({ messages: [] }, { onDone, onError });

    expect(onDone).toHaveBeenCalledWith({ totalTokens: 0, provider: '', model: '' });
    expect(onError).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalled();
  });

  it('读取遇其他错误时触发 onError(err.message)', async () => {
    const reader = makeReader(() => Promise.reject(new Error('流断开')));
    mockFetch.mockResolvedValue({ ok: true, body: { getReader: () => reader } });

    const onError = vi.fn();
    await streamChapter({ messages: [] }, { onError });

    expect(onError).toHaveBeenCalledWith('流断开');
    expect(reader.releaseLock).toHaveBeenCalled();
  });
});

describe('streamChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应聚合所有 token 并返回完整内容', async () => {
    const sse = [
      'event: token',
      'data: {"token":"您"}',
      'event: token',
      'data: {"token":"好"}',
      'event: done',
      'data: {"totalTokens":2}',
      '',
    ].join('\n');
    mockFetch.mockResolvedValue({ ok: true, body: sseStream(sse) });

    const messages: ChatMessage[] = [{ role: 'user', content: '你好' }];
    const onToken = vi.fn();

    const result = await streamChat(messages, { model: 'glm-4-flash' }, onToken);

    expect(result).toBe('您好');
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenNthCalledWith(1, '您');
    expect(onToken).toHaveBeenNthCalledWith(2, '好');
  });

  it('无 token 时应返回空字符串', async () => {
    mockFetch.mockResolvedValue({ ok: true, body: sseStream('event: error\ndata: {"error":"e"}\n') });

    const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    const onToken = vi.fn();

    const result = await streamChat(messages, {}, onToken);

    expect(result).toBe('');
    expect(onToken).not.toHaveBeenCalled();
  });
});