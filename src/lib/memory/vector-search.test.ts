// ============================================================================
// 向量检索测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, topKSearch, buildIndex, type IndexedItem } from './vector-search';

describe('cosineSimilarity', () => {
  it('相同向量应返回 1', () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it('正交向量应返回 0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('相反向量应返回 -1', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('零向量应返回 0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('topKSearch', () => {
  it('空索引应返回空数组', () => {
    const query = new Float32Array(384);
    const result = topKSearch(query, [], 5);
    expect(result).toEqual([]);
  });

  it('应返回 Top-K 结果', () => {
    const query = new Float32Array(384).fill(0);
    query[0] = 1;
    // 各向量在多个维度上分布，区分度更高
    const items: IndexedItem[] = [1, 2, 3, 4, 5].map((n) => {
      const vec = new Float32Array(384).fill(0);
      vec[0] = n;
      vec[1] = 10 - n;
      return { id: `item${n}`, vector: vec };
    });
    const indexed = buildIndex(items);

    const result = topKSearch(query, indexed, 3);
    expect(result).toHaveLength(3);
    // query=[1,0,...], item5 has [5,5,...], item4 has [4,6,...], etc.
    // After normalization: query=[1,0], item5 normalized=[5/sqrt(50),5/sqrt(50)]≈[0.707,0.707]
    // cosine(query, item5) = 1*0.707 + 0*0.707 = 0.707
    // item1=[1,9] normalized=[1/sqrt(82),9/sqrt(82)]≈[0.110,0.994]
    // cosine(query, item1) = 1*0.110 = 0.110
    // So item5 should be the most similar
    expect(result[0].id).toBe('item5');
    expect(result[1].id).toBe('item4');
    expect(result[2].id).toBe('item3');
  });

  it('K 大于总数时应返回全部', () => {
    const query = new Float32Array(384);
    const items: IndexedItem[] = [{ id: 'item1', vector: new Float32Array(384) }];
    const result = topKSearch(query, items, 10);
    expect(result).toHaveLength(1);
  });

  it('维度不匹配的条目应跳过而非抛错（混维度索引容错）', () => {
    const query = new Float32Array(384);
    query[0] = 1;
    const ok = new Float32Array(384);
    ok[0] = 0.5;
    const items: IndexedItem[] = [
      { id: 'ok', vector: ok },
      { id: 'server-2048', vector: new Float32Array(2048) }, // 服务端降级产生的异维向量
      { id: 'empty-fallback', vector: new Float32Array(384) }, // 同维零向量正常参与
    ];
    const result = topKSearch(query, items, 5);
    expect(result.map((r) => r.id)).toEqual(['ok', 'empty-fallback']);
  });

  it('全部条目维度不匹配时应返回空数组', () => {
    const query = new Float32Array(384);
    const items: IndexedItem[] = [{ id: 'server-2048', vector: new Float32Array(2048) }];
    expect(topKSearch(query, items, 5)).toEqual([]);
  });
});