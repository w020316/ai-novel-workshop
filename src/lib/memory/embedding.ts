// ============================================================================
// Embedding 工具（transformers.js 懒加载封装）
// 依据：spec 7.2 节 / 计划 P4.2
// 职责：
// 1. 懒加载 transformers.js（Web 端本地计算）
// 2. 如果需要特定 Provider 的 Embedding，回退到服务端 API
// ============================================================================
import type { LLMProvider } from '@/types';
import { embeddingBatch } from '@/lib/llm/client';

/**
 * 本地 Embedding 计算
 * 使用 transformers.js 在浏览器端计算
 * 首次调用时加载模型（约 10-30MB），后续调用复用
 */
export class LocalEmbedder {
  private pipeline: unknown = null;
  private loading = false;
  private loadPromise: Promise<unknown> | null = null;
  private modelName: string;

  constructor(modelName = 'Xenova/all-MiniLM-L6-v2') {
    this.modelName = modelName;
  }

  /**
   * 懒加载 transformers.js pipeline
   */
  async load(): Promise<boolean> {
    if (this.pipeline) return true;
    if (this.loading && this.loadPromise) {
      await this.loadPromise;
      return !!this.pipeline;
    }

    this.loading = true;
    this.loadPromise = this.loadPipeline();

    try {
      this.pipeline = await this.loadPromise;
      return true;
    } catch {
      console.warn('[LocalEmbedder] transformers.js 加载失败，将降级到服务端 API');
      return false;
    } finally {
      this.loading = false;
    }
  }

  /**
   * 计算文本的 Embedding 向量
   * 1. 优先使用本地 transformers.js
   * 2. 降级到服务端 API
   */
  async embed(text: string, fallbackProvider?: LLMProvider): Promise<Float32Array> {
    const loaded = await this.load();
    if (loaded && this.pipeline) {
      try {
        return await this.localEmbed(text);
      } catch (err) {
        console.warn('[LocalEmbedder] 本地计算失败，降级到服务端:', err);
      }
    }

    // 降级到服务端
    return embeddingBatch([text], { provider: fallbackProvider }).then(
      (results) => results[0]
    );
  }

  /**
   * 批量 Embedding
   */
  async embedBatch(
    texts: string[],
    fallbackProvider?: LLMProvider
  ): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    const loaded = await this.load();
    if (loaded && this.pipeline) {
      try {
        return await Promise.all(texts.map((t) => this.localEmbed(t)));
      } catch (err) {
        console.warn('[LocalEmbedder] 本地批量计算失败，降级到服务端:', err);
      }
    }

    return embeddingBatch(texts, { provider: fallbackProvider });
  }

  private async localEmbed(text: string): Promise<Float32Array> {
    // 动态导入 transformers.js
    const { pipeline } = await import('@xenova/transformers');
    const extractor = await pipeline('feature-extraction', this.modelName, {
      quantized: true,
    });
    const result = await extractor(text, { pooling: 'mean', normalize: true });
    return Float32Array.from(result.data);
  }

  private async loadPipeline(): Promise<unknown> {
    const { pipeline } = await import('@xenova/transformers');
    return pipeline('feature-extraction', this.modelName, {
      quantized: true,
    });
  }
}

/**
 * 创建默认的 Embedder 实例（单例）
 */
let defaultEmbedder: LocalEmbedder | null = null;

export function getDefaultEmbedder(): LocalEmbedder {
  if (!defaultEmbedder) {
    defaultEmbedder = new LocalEmbedder();
  }
  return defaultEmbedder;
}