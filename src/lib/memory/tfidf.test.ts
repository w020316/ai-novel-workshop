import { describe, it, expect } from 'vitest';
import { TfIdfIndex, type TfIdfDocument } from './tfidf';

describe('TfIdfIndex', () => {
  const docs: TfIdfDocument[] = [
    { id: 'd1', text: '少年修炼剑气突破境界', metadata: { chapterNo: 1 } },
    { id: 'd2', text: '少女研习炼丹技艺突破', metadata: { chapterNo: 2 } },
    { id: 'd3', text: '少年在宗门被同门欺辱', metadata: { chapterNo: 3 } },
  ];

  it('build 后 search 返回按相关度排序的结果', () => {
    const index = new TfIdfIndex();
    index.build(docs);
    const res = index.search('突破', 3);
    expect(res.length).toBeLessThanOrEqual(3);
    // 包含突破的两篇应排在无突破的 d3 之前
    expect(res[0].id).not.toBe('d3');
    // 返回 id/score/metadata
    expect(res[0]).toHaveProperty('score');
    expect(res[0]).toHaveProperty('metadata');
  });

  it('search 未 build 时返回空数组', () => {
    const index = new TfIdfIndex();
    expect(index.search('任何')).toEqual([]);
  });

  it('search 空文档返回空数组', () => {
    const index = new TfIdfIndex();
    index.build([]);
    expect(index.search('任何')).toEqual([]);
  });

  it('search 空白查询返回空数组', () => {
    const index = new TfIdfIndex();
    index.build(docs);
    expect(index.search('')).toEqual([]);
    expect(index.search('  ')).toEqual([]);
  });

  it('stopword 过滤：仅包含停用词的查询无结果', () => {
    const index = new TfIdfIndex();
    index.build(docs);
    // 单字停用词
    expect(index.search('的')).toEqual([]);
    expect(index.search('是')).toEqual([]);
  });

  it('英文单词检索正常工作（大小写不敏感）', () => {
    const index = new TfIdfIndex();
    index.build([{ id: 'e1', text: 'The Magic Sword and Vampire Hunter' }]);
    const res = index.search('sword VAMPIRE');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].id).toBe('e1');
  });

  it('相同文档 build 后应重置索引（幂等）', () => {
    const index = new TfIdfIndex();
    index.build(docs);
    index.build([{ id: 'x1', text: '烛火摇曳' }]);
    const res = index.search('烛火');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('x1');
  });

  it('metadata 透传', () => {
    const index = new TfIdfIndex();
    index.build(docs);
    const res = index.search('境界', 1);
    expect(res[0].metadata).toEqual({ chapterNo: 1 });
  });
});