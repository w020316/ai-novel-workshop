// ============================================================================
// 向量检索（余弦相似度 + Top-K）
// 依据：spec 5.5 节 / 计划 P4.2
// 职责：提供向量相似度计算和 Top-K 检索
// ============================================================================

/**
 * 计算两个向量的余弦相似度
 * 值域 [-1, 1]，越大越相似
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `向量维度不匹配：${a.length} vs ${b.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

export interface IndexedItem {
  id: string;
  vector: Float32Array;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Top-K 向量检索
 * 在给定索引中查找与查询向量最相似的 K 个条目
 *
 * @param query - 查询向量
 * @param index - 向量索引
 * @param topK - 返回前 K 条（默认 5）
 * @returns 按相似度降序排列的搜索结果
 */
export function topKSearch(
  query: Float32Array,
  index: IndexedItem[],
  topK = 5
): SearchResult[] {
  if (index.length === 0) return [];

  const scored = index.map((item) => ({
    id: item.id,
    score: cosineSimilarity(query, item.vector),
    metadata: item.metadata,
  }));

  // 按相似度降序排列
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, Math.min(topK, scored.length));
}

/**
 * 批量构建向量索引（归一化处理）
 */
export function buildIndex(items: IndexedItem[]): IndexedItem[] {
  return items.map((item) => ({
    ...item,
    vector: normalizeVector(item.vector),
  }));
}

function normalizeVector(vec: Float32Array): Float32Array {
  const norm = Math.sqrt(
    Array.from(vec).reduce((sum, v) => sum + v * v, 0)
  );
  if (norm === 0) return vec;
  return vec.map((v) => v / norm) as Float32Array;
}