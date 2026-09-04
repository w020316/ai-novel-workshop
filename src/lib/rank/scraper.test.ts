// ============================================================================
// 实时榜单抓取测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  parseFanqieHtml,
  parseFalooHtml,
  parseHongxiuHtml,
  scrapePlatform,
  scrapableSourceIds,
} from './scraper';

const FANQIE_FIXTURE = `
<script>window.__DATA__=[{
  "lastChapterTitle":"第10章","author":"作者甲","bookName":"雾镇银鱼","currentPos":1,
  "lastChapterTitle":"第9章","author":"作者乙","bookName":"远山有信","currentPos":2,
  "author":"作者丙","bookName":"深海电台","currentPos":3
}]</script>`;

const FALOO_FIXTURE = `
<a href="https://b.faloo.com/1484744.html">盘点万界战力等级</a>
<a href="https://b.faloo.com/1479061.html">综漫开局概念树</a>
<a href="https://b.faloo.com/help/" class="x">帮助</a>
<a href="https://b.faloo.com/down_0_1.html">下载</a>
<a href="https://b.faloo.com/1481863.html">崩铁我为创世神</a>`;

describe('scraper / parseFanqieHtml', () => {
  it('从 SSR 内嵌 JSON 解析书名、作者与名次', () => {
    const books = parseFanqieHtml(FANQIE_FIXTURE);
    expect(books.length).toBe(3);
    expect(books[0]).toMatchObject({ title: '雾镇银鱼', author: '作者甲', rank: 1 });
    expect(books[2].title).toBe('深海电台');
  });

  it('忽略无中文的噪声串', () => {
    const books = parseFanqieHtml('<script>{"bookName":"a123"}</script>');
    expect(books.length).toBe(0);
  });
});

describe('scraper / parseFalooHtml', () => {
  it('解析书页锚点并过滤导航链接', () => {
    const books = parseFalooHtml(FALOO_FIXTURE);
    const titles = books.map((b) => b.title);
    expect(titles).toContain('盘点万界战力等级');
    expect(titles).not.toContain('帮助');
    expect(titles).not.toContain('下载');
    expect(titles).toContain('崩铁我为创世神');
    expect(books[0].url).toContain('1484744');
  });
});

describe('scraper / parseHongxiuHtml', () => {
  it('解析红袖 /book/<id> 锚点书名', () => {
    const html =
      '<a href="/book/1001" title="x">恰似寒光遇骄阳</a><a href="/book/1002">摄政王他又在掐我桃花</a><a href="/nav">导航</a>';
    const books = parseHongxiuHtml(html);
    expect(books.map((b) => b.title)).toEqual(['恰似寒光遇骄阳', '摄政王他又在掐我桃花']);
    expect(books[0].url).toContain('/book/1001');
  });
});

describe('scraper / scrapePlatform (offline 分支)', () => {
  it('支持实时抓取的平台为番茄与飞卢', () => {
    expect(new Set(scrapableSourceIds())).toEqual(new Set(['fanqie', 'feilu', 'hongxiu']));
  });

  it('反爬/JS 渲染平台返回 blocked + 浏览器建议', async () => {
    const r = await scrapePlatform('qidian');
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.targetUrl).toBeTruthy();
    expect(r.books).toHaveLength(0);
  });

  it('未知平台返回提示信息', async () => {
    const r = await scrapePlatform('nope');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('暂未支持');
  });
});
