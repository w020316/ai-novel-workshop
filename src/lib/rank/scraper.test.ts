// ============================================================================
// 实时榜单抓取测试
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseFanqieHtml,
  parseFalooHtml,
  parseHongxiuHtml,
  parseZonghengHtml,
  parseXiaoxiangHtml,
  parseHuabenHtml,
  scrapePlatform,
  scrapableSourceIds,
  clearRankCache,
} from './scraper';

// 与真实页面一致的条目结构：每条为独立扁平 JSON 对象，字段顺序不固定
const FANQIE_FIXTURE = `
<script>window.__DATA__=[
  {"lastChapterTitle":"第10章","author":"作者甲","bookName":"雾镇银鱼","currentPos":1},
  {"author":"作者乙","bookName":"远山有信","lastChapterTitle":"第9章","currentPos":2},
  {"bookName":"深海电台","currentPos":3,"author":"作者丙"}
]</script>`;

// 页面头部推荐位：只有 bookName 无 currentPos（真实快照确认存在此形态）
const FANQIE_RECOMMEND_NOISE = `{"bookName":"热推位不是榜单","wordNumber":"0"}`;

const FALOO_FIXTURE = `
<a href="https://b.faloo.com/1484744.html">盘点万界战力等级</a>
<a href="https://b.faloo.com/1479061.html">综漫开局概念树</a>
<a href="https://b.faloo.com/help/" class="x">帮助</a>
<a href="https://b.faloo.com/down_0_1.html">下载</a>
<a href="https://b.faloo.com/1481863.html">崩铁我为创世神</a>`;

describe('scraper / parseFanqieHtml', () => {
  it('从 SSR 内嵌 JSON 按对象解析书名、作者与名次（字段顺序不敏感）', () => {
    const books = parseFanqieHtml(FANQIE_FIXTURE);
    expect(books.length).toBe(3);
    expect(books[0]).toMatchObject({ title: '雾镇银鱼', author: '作者甲', rank: 1 });
    expect(books[1]).toMatchObject({ title: '远山有信', author: '作者乙', rank: 2 });
    expect(books[2]).toMatchObject({ title: '深海电台', author: '作者丙', rank: 3 });
  });

  it('页面头部推荐位（无 currentPos 的 bookName）不污染榜单', () => {
    const books = parseFanqieHtml(`${FANQIE_RECOMMEND_NOISE}${FANQIE_FIXTURE}`);
    expect(books.length).toBe(3);
    expect(books.some((b) => b.title === '热推位不是榜单')).toBe(false);
  });

  it('真实快照（fanqienovel.com/rank 抓取存档）：10 条、名次连续、作者正确归属', () => {
    const snapshot = readFileSync(
      join(process.cwd(), 'tests/fixtures/fanqie-rank.snapshot.html'),
      'utf8'
    );
    const books = parseFanqieHtml(snapshot);
    expect(books.length).toBe(10);
    // 名次 1-10 连续
    expect(books.map((b) => b.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // 快照实测：第 4 名《掌娇娇》作者支云、第 1 名《惹枝》作者空留
    expect(books[0]).toMatchObject({ title: '惹枝', author: '空留', rank: 1 });
    expect(books[3]).toMatchObject({ title: '掌娇娇', author: '支云', rank: 4 });
  });

  it('剥离书名中的 PUA 反爬混淆字符（U+E000-F8FF），保证查重可匹配', () => {
    // 番茄真实页面在书名中插 PUA 字符：'惹\uE49C枝' 若不剥离则查重永不命中
    const books = parseFanqieHtml('{"bookName":"惹\uE49C枝","author":"空留","currentPos":1}');
    expect(books.length).toBe(1);
    expect(books[0].title).toBe('惹枝');
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
    expect(new Set(scrapableSourceIds())).toEqual(new Set(['fanqie', 'feilu', 'hongxiu', 'zongheng', 'xiaoxiang', 'huaben']));
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

describe('scraper / parseZonghengHtml', () => {
  it('解析纵横 /detail/<id> 锚点书名（排除 author 页）', () => {
    const html =
      '<a href="//www.zongheng.com/detail/1552353">盗梦千年</a>' +
      '<a href="//home.zongheng.com/show/userInfo/56302090.html">咸鱼老白</a>' +
      '<a href="//www.zongheng.com/detail/1385191">星辰大道</a>';
    const books = parseZonghengHtml(html);
    const titles = books.map((b) => b.title);
    expect(titles).toEqual(['盗梦千年', '星辰大道']);
    expect(books[0].url).toContain('/detail/1552353');
  });
});

describe('scraper / parseXiaoxiangHtml', () => {
  it('解析潇湘 /book/<longid> 锚点书名', () => {
    const html =
      '<a href="/book/36582934803415908">来日有信</a>' +
      '<a href="/category/1.html">古代言情</a>' +
      '<a href="/book/34722785804261808">她驯服的三千疯批一起重生了</a>';
    const books = parseXiaoxiangHtml(html);
    expect(books.map((b) => b.title)).toEqual(['来日有信', '她驯服的三千疯批一起重生了']);
  });
});

describe('scraper / 内存 TTL 缓存（clearRankCache 隔离）', () => {
  it('blocked 平台重复请求命中缓存（不重复走网络）', async () => {
    clearRankCache();
    const first = await scrapePlatform('qidian');
    expect(first.ok).toBe(false);
    expect(first.books).toHaveLength(0);
    // 第二次应直接命中缓存，消息含"从缓存读取"
    const second = await scrapePlatform('qidian');
    expect(second.message).toContain('从缓存读取');
    clearRankCache();
  });
});

describe('scraper / parseHuabenHtml', () => {
  it('解析话本 /book/<id>.html 锚点书名（排除章级与导航）', () => {
    const html =
      '<a href="//www.ihuaben.com/book/11914907.html">女主畅游各个世界随心撩</a>' +
      '<a href="//www.ihuaben.com/book/1383450/14134250.html">签约标准</a>' +
      '<a href="//www.ihuaben.com/book/10375275.html">人人都爱清冷美人</a>';
    const books = parseHuabenHtml(html);
    const titles = books.map((b) => b.title);
    expect(titles).toEqual(['女主畅游各个世界随心撩', '人人都爱清冷美人']);
    expect(books[0].url).toContain('/book/11914907.html');
  });
});
