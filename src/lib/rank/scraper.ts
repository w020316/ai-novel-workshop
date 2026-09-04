// ============================================================================
// 实时榜单抓取服务（服务端·Server-side）
// 说明：
//   - "CORS 挡可抓取"是纯浏览器层限制，服务端 fetch 天然没有 CORS；真正的反爬
//     分两类：① JS-验证/盾（如起点 202）② 前端 JS 渲染（如七猫/晋江）。
//   - 本模块对「服务端直出」的平台（番茄 SSR、飞卢静态 HTML）做实时抓取解析；
//     对验证/JS 渲染的平台返回 blocked + 建议（浏览器打开 → 粘贴榜单 → 拆解）。
//   - 全程无第三方依赖，函数式可测；内置超时与优雅降级。
// ============================================================================
import { PLATFORMS } from '@/lib/originality/works-db';

/** 榜单条目 */
export interface RankedBook {
  sourceId: string;
  title: string;
  author?: string;
  /** 从 1 起的名次（源未给则按文档顺序赋予） */
  rank?: number;
  url?: string;
}

export interface RankFetchResult {
  ok: boolean;
  sourceId: string;
  sourceName: string;
  url: string;
  fetchedAt: number;
  /** 是否被反爬/JS 渲染阻断（此时 books 为空，给出 message 与 targetUrl） */
  blocked?: boolean;
  message?: string;
  /** 供用户在浏览器打开的真实榜单地址（blocked 时给提示） */
  targetUrl?: string;
  books: RankedBook[];
}

interface SourceAdapter {
  id: string;
  name: string;
  url: string;
  kind: 'ssr' | 'blocked';
  hint?: string;
}

/** 平台 id（与 RANK_SOURCES 对齐）→ 抓取适配器 */
const ADAPTERS: Record<string, SourceAdapter> = {
  fanqie: {
    id: 'fanqie', name: '番茄小说', url: 'https://fanqienovel.com/rank', kind: 'ssr',
    hint: '实时榜单（服务端 SSR，可解析）',
  },
  feilu: {
    id: 'feilu', name: '飞卢小说', url: 'https://b.faloo.com/', kind: 'ssr',
    hint: '实时热度榜单（静态 HTML，可解析）',
  },
  hongxiu: {
    id: 'hongxiu', name: '红袖添香', url: 'https://www.hongxiu.com/rank', kind: 'ssr',
    hint: '女频实时榜单（服务端直出，可解析）',
  },
  qidian: {
    id: 'qidian', name: '起点中文网', url: 'https://www.qidian.com/rank/yuepiao/', kind: 'blocked',
    hint: '起点启用 JS-验证/盾，服务端直抓返回 202',
  },
  qimao: {
    id: 'qimao', name: '七猫中文', url: 'https://www.qimao.com/rank/', kind: 'blocked',
    hint: '七猫为前端 JS 渲染，静态 HTML 无榜单数据',
  },
  jinjiang: {
    id: 'jinjiang', name: '晋江文学城', url: 'https://www.jjwxc.net/bookbase/', kind: 'blocked',
    hint: '晋江榜单需登录会话，直抓不可用',
  },
};

/** 导航/工具类链接文本黑名单（飞卢首页混合大量导航，需过滤） */
const NAV_WORDS = new Set([
  '书库','完本','VIP','同人','原创','畅读','下载','帮助','进入','申请','作家',
  '充值','书评','听书','女生','首页','搜索','登录','注册','标签','官网','APP',
  '小说','文集','返回','更多','分类','排行','推荐','精选','福利','联系我们',
]);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 15000;

/** 按 charset 解码字节；回退到 utf-8（gbk/gb2312 站点必须处理，否则乱码） */
function decodeText(arr: ArrayBuffer, charset: string): string {
  const hs = new Set<string>();
  const base = charset.replace(/['"]/g, '');
  if (base) hs.add(base);
  if (base === 'gb2312') hs.add('gbk');
  if (base === 'gbk') hs.add('gb2312');
  hs.add('utf-8');
  for (const enc of hs) {
    try {
      return new TextDecoder(enc).decode(arr);
    } catch {
      // 该编码当前环境不支持，尝试下一个
    }
  }
  return new TextDecoder('utf-8').decode(arr);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arr = await res.arrayBuffer();
  const ctype = res.headers.get('content-type') ?? '';
  let charset = (ctype.match(/charset=([\w-]+)/i) ?? [null, 'utf-8'])[1];
  // 头未声明或声明 utf-8 时，尝试从前 4096 字节的 meta 中识别真实 charset
  const l1 = new TextDecoder('latin1').decode(arr.slice(0, 4096));
  const meta = l1.match(/charset=["']?([\w-]+)/i);
  if (meta) charset = meta[1];
  return decodeText(arr, charset);
}

/** 清洗书名：去空白/实体，返回长度合理且含中文的标题 */
function cleanTitle(raw: string): string | null {
  const t = raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").trim();
  if (t.length < 2 || t.length > 40) return null;
  if (!/[\u4e00-\u9fff]/.test(t)) return null;
  return t;
}

/** 红袖 SSR：/book/<id> 锚点 + 书名文本 */
export function parseHongxiuHtml(html: string): RankedBook[] {
  const seen = new Set<string>();
  const books: RankedBook[] = [];
  const re = /<a[^>]+href="\/book\/(\d+)"[^>]*>([^<>]{2,30})<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    const title = cleanTitle(m[2]);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    books.push({
      sourceId: 'hongxiu',
      title,
      rank: books.length + 1,
      url: `https://www.hongxiu.com/book/${id}`,
    });
    if (books.length >= 50) break;
  }
  return books;
}

/** 番茄 SSR：bookName + currentPos 成对解析 */
export function parseFanqieHtml(html: string): RankedBook[] {
  const titles: string[] = [];
  const positions: number[] = [];
  const authors: string[] = [];
  const nameRe = /"bookName":"([^"]+)"/g;
  const posRe = /"currentPos":(\d+)/g;
  const authRe = /"author":"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(html))) titles.push(m[1]);
  while ((m = posRe.exec(html))) positions.push(Number(m[1]));
  while ((m = authRe.exec(html))) authors.push(m[1]);

  const books: RankedBook[] = [];
  for (let i = 0; i < titles.length; i++) {
    const title = cleanTitle(titles[i]);
    if (!title) continue;
    books.push({
      sourceId: 'fanqie',
      title,
      author: cleanTitle(authors[i] ?? '') ?? undefined,
      rank: positions[i] ?? i + 1,
    });
  }
  return books;
}

/** 飞卢静态 HTML：b.faloo.com/<id>.html 锚点 + 书名文本 */
export function parseFalooHtml(html: string): RankedBook[] {
  const seen = new Set<string>();
  const books: RankedBook[] = [];
  const re = /href="(?:https?:)?(?:\/\/)?b\.faloo\.com\/(\d+)\.html"[^>]*>([^<>]{2,40})<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    const title = cleanTitle(m[2]);
    if (!title) continue;
    const low = title.toLowerCase();
    if ([...NAV_WORDS].some((w) => low.includes(w.toLowerCase()))) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    books.push({
      sourceId: 'feilu',
      title,
      rank: books.length + 1,
      url: `https://b.faloo.com/${id}.html`,
    });
    if (books.length >= 50) break;
  }
  return books;
}

/** 纵横 SSR：//www.zongheng.com/detail/<id> 锚点 + 书名文本（排除 author 页） */
export function parseZonghengHtml(html: string): RankedBook[] {
  const seen = new Set<string>();
  const books: RankedBook[] = [];
  const re = /<a[^>]+href="\/\/www\.zongheng\.com\/detail\/(\d+)"[^>]*>([^<>]{2,30})<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    const title = cleanTitle(m[2]);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    books.push({
      sourceId: 'zongheng',
      title,
      rank: books.length + 1,
      url: `https://www.zongheng.com/detail/${id}`,
    });
    if (books.length >= 50) break;
  }
  return books;
}

/** 潇湘 SSR：/book/<longid> 锚点 + 书名文本 */
export function parseXiaoxiangHtml(html: string): RankedBook[] {
  const seen = new Set<string>();
  const books: RankedBook[] = [];
  const re = /<a[^>]+href="\/book\/(\d{6,})"[^>]*>([^<>]{2,30})<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    const title = cleanTitle(m[2]);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    books.push({
      sourceId: 'xiaoxiang',
      title,
      rank: books.length + 1,
      url: `https://www.xxsy.net/book/${id}`,
    });
    if (books.length >= 50) break;
  }
  return books;
}

/** 取平台展示名（回退到适配器名） */
function sourceName(id: string): string {
  const p = PLATFORMS.find((x) => x.id === id);
  const a = ADAPTERS[id];
  return p?.name ?? a?.name ?? id;
}

/**
 * 抓取单个平台的实时榜单。
 * @param sourceId 平台 id（fanqie / feilu / qidian / qimao / jinjiang 等）
 */
export async function scrapePlatform(sourceId: string): Promise<RankFetchResult> {
  const adapter = ADAPTERS[sourceId];
  const name = sourceName(sourceId);
  const fetchedAt = Date.now();

  if (!adapter) {
    return {
      ok: false, sourceId, sourceName: name, url: '', fetchedAt,
      message: '暂未支持该平台的自动抓取，请使用「榜单粘贴拆解」。', books: [],
    };
  }

  // 已知被反爬/JS 渲染阻断：直接返回 blocked，不浪费请求
  if (adapter.kind === 'blocked') {
    return {
      ok: false, sourceId, sourceName: name, url: adapter.url, targetUrl: adapter.url,
      blocked: true, fetchedAt,
      message: `${name} 需要浏览器会话才能读取榜单（${adapter.hint}）。请在浏览器打开目标地址，复制后粘贴到下方「榜单粘贴拆解」。`,
      books: [],
    };
  }

  try {
    const html = await fetchText(adapter.url);
    const books =
      sourceId === 'fanqie'
        ? parseFanqieHtml(html)
        : sourceId === 'feilu'
        ? parseFalooHtml(html)
        : sourceId === 'hongxiu'
        ? parseHongxiuHtml(html)
        : sourceId === 'zongheng'
        ? parseZonghengHtml(html)
        : sourceId === 'xiaoxiang'
        ? parseXiaoxiangHtml(html)
        : [];
    const ok = books.length > 0;
    return {
      ok, sourceId, sourceName: name, url: adapter.url, fetchedAt,
      message: ok
        ? `已抓取 ${books.length} 部实时作品`
        : '已请求榜单页但未能解析出作品（页面结构可能调整），请用「榜单粘贴拆解」。',
      books: ok ? books.slice(0, 50) : [],
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false, sourceId, sourceName: name, url: adapter.url, targetUrl: adapter.url, fetchedAt,
      message: `抓取失败（${reason}）——可能被风控拦截，请在浏览器打开目标地址复制后粘贴拆解。`,
      books: [],
    };
  }
}

/** 支持实时抓取的平台 id 列表（UI 标识可实时） */
export function scrapableSourceIds(): string[] {
  return Object.values(ADAPTERS).filter((a) => a.kind === 'ssr').map((a) => a.id);
}
