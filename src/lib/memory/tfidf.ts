// ============================================================================
// TF-IDF 降级检索
// 依据：spec 7.2 节 / 计划 P4.2
// 职责：当向量检索不可用时（如 transformers.js 未加载）提供基于关键词的检索
// ============================================================================

export interface TfIdfDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * 简单的 TF-IDF 检索
 * 当向量检索降级时使用
 */
export class TfIdfIndex {
  private documents: Array<{ id: string; terms: Map<string, number>; metadata?: Record<string, unknown> }> = [];
  private idf: Map<string, number> = new Map();
  private built = false;

  /**
   * 构建索引
   */
  build(docs: TfIdfDocument[]): void {
    this.documents = [];
    this.idf.clear();

    // 1. 统计各文档的词频
    const docTermSets: Array<Set<string>> = [];

    for (const doc of docs) {
      const terms = this.tokenize(doc.text);
      const termFreq = new Map<string, number>();

      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
      }

      this.documents.push({
        id: doc.id,
        terms: termFreq,
        metadata: doc.metadata,
      });
      docTermSets.push(new Set(terms));
    }

    // 2. 计算 IDF
    const totalDocs = docs.length;
    const allTerms = new Set<string>();
    for (const termSet of docTermSets) {
      for (const term of termSet) {
        allTerms.add(term);
      }
    }

    for (const term of allTerms) {
      let docCount = 0;
      for (const termSet of docTermSets) {
        if (termSet.has(term)) docCount++;
      }
      // IDF = log(N / (1 + df)) + 1（平滑）
      this.idf.set(term, Math.log(totalDocs / (1 + docCount)) + 1);
    }

    this.built = true;
  }

  /**
   * 搜索 Top-K
   */
  search(query: string, topK = 5): Array<{ id: string; score: number; metadata?: Record<string, unknown> }> {
    if (!this.built || this.documents.length === 0) return [];

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    // 计算查询词 TF（未归一化，因为查询短）
    const queryTF = new Map<string, number>();
    for (const term of queryTerms) {
      queryTF.set(term, (queryTF.get(term) ?? 0) + 1);
    }

    // 计算每个文档的 TF-IDF 余弦相似度
    const scored = this.documents.map((doc) => {
      let dotProduct = 0;
      let queryNorm = 0;
      let docNorm = 0;

      for (const [term, qTf] of queryTF) {
        const idf = this.idf.get(term) ?? 0;
        const qWeight = qTf * idf;
        queryNorm += qWeight * qWeight;

        const dTf = doc.terms.get(term) ?? 0;
        const dWeight = dTf * idf;
        docNorm += dWeight * dWeight;

        dotProduct += qWeight * dWeight;
      }

      const denom = Math.sqrt(queryNorm) * Math.sqrt(docNorm);
      const score = denom === 0 ? 0 : dotProduct / denom;

      return { id: doc.id, score, metadata: doc.metadata };
    });

    // 降序排列
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(topK, scored.length));
  }

  /**
   * 简单中文分词：按字符和常用双字词分割
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];

    // 提取中文字符
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) ?? [];
    // 提取英文单词/数字
    const otherTokens = text.match(/[a-zA-Z0-9_]+/g) ?? [];

    // 单字
    for (const char of chineseChars) {
      tokens.push(char);
    }

    // 双字相邻组合（bigram）
    for (let i = 0; i < chineseChars.length - 1; i++) {
      tokens.push(chineseChars[i] + chineseChars[i + 1]);
    }

    // 英文单词
    tokens.push(...otherTokens.map((t) => t.toLowerCase()));

    // 过滤停用词
    return tokens.filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  }
}

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她',
  '它', '们', '那', '什么', '怎么', '如何', '因为', '所以', '但是',
  '虽然', '然而', '如果', '而且', '或者', '于是', '不过', '因此',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'about',
]);