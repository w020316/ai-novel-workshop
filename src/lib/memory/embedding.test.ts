// ============================================================================
// Embedding 工具测试
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalEmbedder, getDefaultEmbedder } from './embedding';
import { embeddingBatch } from '@/lib/llm/client';

// 可控的 pipeline / extractor mock（transformers.js）
const { pipelineMock, extractorMock } = vi.hoisted(() => {
  const extractorMock = vi.fn();
  const pipelineMock = vi.fn().mockImplementation(async () => extractorMock);
  return { pipelineMock, extractorMock };
});

vi.mock('@xenova/transformers', () => ({
  pipeline: pipelineMock,
}));

// mock 服务端 embeddingBatch，隔离降级路径
vi.mock('@/lib/llm/client', () => ({
  embeddingBatch: vi.fn(),
}));

const clientEmbeddingBatch = embeddingBatch as unknown as ReturnType<typeof vi.fn>;

describe('memory/embedding', () => {
  beforeEach(() => {
    pipelineMock.mockClear();
    extractorMock.mockReset();
    extractorMock.mockResolvedValue({ data: new Float32Array([0.1, 0.2, 0.3]) });
    clientEmbeddingBatch.mockReset();
    clientEmbeddingBatch.mockResolvedValue([new Float32Array([9])]);
  });

  describe('LocalEmbedder.embed', () => {
    it('应使用本地 pipeline 计算 Embedding', async () => {
      const embedder = new LocalEmbedder('model-x');
      const vec = await embedder.embed('测试文本');

      expect(vec).toBeInstanceOf(Float32Array);
      expect(Math.round(vec[0] * 100) / 100).toBe(0.1);
      expect(Math.round(vec[2] * 100) / 100).toBe(0.3);
      expect(pipelineMock).toHaveBeenCalledWith(
        'feature-extraction',
        'model-x',
        expect.objectContaining({ quantized: true })
      );
      expect(extractorMock).toHaveBeenCalledWith(
        '测试文本',
        expect.objectContaining({ pooling: 'mean', normalize: true })
      );
      expect(clientEmbeddingBatch).not.toHaveBeenCalled();
    });

    it('本地计算失败时应降级到服务端 API', async () => {
      extractorMock.mockRejectedValue(new Error('compute fail'));
      clientEmbeddingBatch.mockResolvedValue([new Float32Array([7, 7])]);

      const embedder = new LocalEmbedder();
      const vec = await embedder.embed('测试');

      expect(Array.from(vec)).toEqual([7, 7]);
      expect(clientEmbeddingBatch).toHaveBeenCalledWith(['测试'], { provider: undefined });
    });

    it('pipeline 加载失败时应降级到服务端 API', async () => {
      pipelineMock.mockRejectedValueOnce(new Error('load fail'));
      clientEmbeddingBatch.mockResolvedValue([new Float32Array([1, 2])]);

      const embedder = new LocalEmbedder();
      const vec = await embedder.embed('t');

      expect(Array.from(vec)).toEqual([1, 2]);
      expect(clientEmbeddingBatch).toHaveBeenCalledWith(['t'], { provider: undefined });
    });
  });

  describe('LocalEmbedder.embedBatch', () => {
    it('空文本列表应返回空数组', async () => {
      const embedder = new LocalEmbedder();
      expect(await embedder.embedBatch([])).toEqual([]);
      expect(pipelineMock).not.toHaveBeenCalled();
    });

    it('应使用本地 pipeline 计算单条', async () => {
      const embedder = new LocalEmbedder();
      const res = await embedder.embedBatch(['a']);
      expect(res).toHaveLength(1);
      expect(res[0]).toBeInstanceOf(Float32Array);
      expect(Math.round(res[0][1] * 100) / 100).toBe(0.2);
      expect(clientEmbeddingBatch).not.toHaveBeenCalled();
    });

    it('本地批量失败时应降级到服务端 API', async () => {
      extractorMock.mockRejectedValue(new Error('fail'));
      clientEmbeddingBatch.mockResolvedValue([new Float32Array([1]), new Float32Array([2])]);

      const embedder = new LocalEmbedder();
      const res = await embedder.embedBatch(['a', 'b']);
      expect(res).toHaveLength(2);
      expect(clientEmbeddingBatch).toHaveBeenCalledWith(['a', 'b'], { provider: undefined });
    });
  });

  describe('pipeline 缓存', () => {
    it('重复调用 load 时应复用 pipeline，避免重复加载', async () => {
      const embedder = new LocalEmbedder();
      await embedder.load();
      await embedder.load();
      await embedder.load();

      expect(pipelineMock).toHaveBeenCalledTimes(1);
    });

    it('加载失败后再次 load 应重新尝试', async () => {
      pipelineMock.mockRejectedValueOnce(new Error('load fail'));
      const embedder = new LocalEmbedder();
      await expect(embedder.load()).resolves.toBe(false);

      // 第二次调用重新走加载路径
      await embedder.load();
      expect(pipelineMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDefaultEmbedder', () => {
    it('应返回共享的单例实例', () => {
      expect(getDefaultEmbedder()).toBe(getDefaultEmbedder());
      expect(getDefaultEmbedder()).toBeInstanceOf(LocalEmbedder);
    });
  });
});