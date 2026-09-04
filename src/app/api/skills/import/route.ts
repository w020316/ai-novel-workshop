// ============================================================================
// 写作技能导入 API（POST /api/skills/import）
// 服务端 fetch（无 CORS），从任意 URL / GitHub 仓库 / HuggingFace 空间抓取
// 技能原文并解析为草稿。返回给前端预览确认后入库。
// ============================================================================
import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import {
  parseSkillMarkdown,
  normalizeRawUrl,
  checkUrlTarget,
  extractHostname,
  isReservedIpv4,
  isReservedIpv6,
} from '@/lib/skills/import';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** 常见技能文件候选名，用于 GitHub 仓库首页尝试 */
const CANDIDATE_FILES = ['SKILL.md', 'skill.md', 'README.md', 'readme.md'];

/** 从原始文本掐出 <body> 后的纯文本（供无 frontmatter 的 HTML 场景粗提取） */
function extractTextFromHtml(html: string): string {
  // 去掉 script/style
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<pre[\s\S]*?<\/pre>/gi, ' ').replace(/<code[\s\S]*?<\/code>/gi, ' ');
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/li>|<\/h[1-6]>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * SSRF 纵深防御：解析 host 的全部 IP，拒绝任何解析地址落在内网/本地/链路本地/元数据段。
 * 纯静态的 checkUrlTarget 先挡 IP 字面量与明显内部网域；此函数补 DNS 域名解析场景。
 */
async function checkResolvedTarget(url: string): Promise<string | null> {
  const host = extractHostname(url);
  if (!host) return '无效的 URL';
  // IP 字面量由纯函数直接判定（无需解析）
  const staticErr = checkUrlTarget(url);
  if (staticErr) return staticErr;
  try {
    const addrs = await lookup(host, { all: true });
    for (const a of addrs) {
      if (isReservedIpv4(a.address) || isReservedIpv6(a.address)) {
        return `目标解析到内网/本地地址：${a.address}`;
      }
    }
  } catch {
    // DNS 解析失败交给后续 fetch 决定（不把解析失败当成安全拒绝意外阻断正常域名）
  }
  return null;
}

/** 重定向最大跳数：超过即视为异常目标放弃抓取 */
const MAX_REDIRECTS = 5;

/**
 * 抓取文本：redirect: 'manual' 逐跳校验后再跟随。
 * 修复点：此前 redirect:'follow' 会在校验前就真实请求重定向落点（内网 GET 已发生），
 * 现改为每一跳先过 checkResolvedTarget（静态 + DNS 双层校验），再手动跟随，
 * 且限制最大跳数，杜绝「公网 302 转跳内网」与无限重定向。
 */
async function fetchText(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const preErr = await checkResolvedTarget(current);
    if (preErr) throw new Error(preErr);

    const res = await fetch(current, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/*, text/markdown, */*' },
      redirect: 'manual',
    });

    // 3xx：校验下一跳目标后再手动跟随
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`HTTP ${res.status}（重定向缺少 location）`);
      if (hop === MAX_REDIRECTS) throw new Error('重定向次数过多，已中止抓取');
      // new URL 相对解析；非 http(s) 协议会被下一跳 checkUrlTarget 拒绝
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    const buf = await res.arrayBuffer();
    // 按 content-type 或 BOM 判断字符集
    const dec = new TextDecoder(/gbk|gb2312/i.test(ct) ? 'gbk' : 'utf-8');
    return dec.decode(buf);
  }
  throw new Error('重定向次数过多，已中止抓取');
}

async function tryGithubRepo(url: string): Promise<{ raw: string; fileUrl: string }> {
  const m = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/?$/i.exec(url);
  if (!m) return { raw: '', fileUrl: '' };
  const [, owner, repo] = m;
  // 通过 GitHub API 列出仓库根目录，找出技能/README 文件
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/`;
  const res = await fetch(api, { headers: { 'user-agent': USER_AGENT, accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`无法读取仓库目录：HTTP ${res.status}`);
  const files = (await res.json()) as { name?: string; download_url?: string }[];
  // 优先 SKILL.md，其次 README
  let chosen: string | undefined;
  for (const c of CANDIDATE_FILES) {
    const hit = files.find((f) => f.name?.toLowerCase() === c.toLowerCase());
    if (hit && hit.download_url) { chosen = hit.download_url; break; }
  }
  if (!chosen) {
    const anyMd = files.find((f) => f.download_url && /\.(md|markdown)$/i.test(f.name ?? ''));
    if (anyMd?.download_url) chosen = anyMd.download_url;
  }
  if (!chosen) throw new Error('仓库根目录未找到技能/Markdown 文件');
  const raw = await fetchText(chosen);
  return { raw, fileUrl: chosen };
}

export async function POST(req: Request) {
  let url: string;
  try {
    const body = await req.json();
    url = (body?.url ?? '').trim();
  } catch {
    url = '';
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, message: '请提供有效的 http(s) 链接' }, { status: 400 });
  }

  try {
    const normalized = normalizeRawUrl(url);
    let raw: string;
    let effectiveUrl = normalized ?? url;
    let fetched = false;

    if (!normalized) {
      // GitHub 仓库首页：尝试常见文件路径
      try {
        const r = await tryGithubRepo(url);
        raw = r.raw;
        effectiveUrl = r.fileUrl;
        fetched = true;
      } catch (e) {
        return NextResponse.json(
          { ok: false, message: e instanceof Error ? e.message : String(e) },
          { status: 404 }
        );
      }
    } else {
      raw = await fetchText(normalized);
      fetched = raw.trim().length > 0;
    }

    if (!fetched || raw.trim().length === 0) {
      return NextResponse.json({ ok: false, message: '抓取内容为空' }, { status: 200 });
    }

    // 若拿到的是 HTML 且没有 frontmatter，尝试粗提取正文
    const looksHtml = /<html[\s\S]*>/i.test(raw.substring(0, 2000)) || /<!DOCTYPE/i.test(raw.substring(0, 2000));
    const candidate = looksHtml ? extractTextFromHtml(raw) : raw;

    // 从 URL 推断兜底名称（文件名或末段路径）
    const implied = effectiveUrl.split('/').filter(Boolean).pop()?.replace(/\.(md|markdown|txt)$/i, '') ?? url;
    const sourceType = normalizeRawUrl(effectiveUrl) && /github/i.test(effectiveUrl) ? 'github'
      : /huggingface/i.test(effectiveUrl) ? 'huggingface' : 'web';

    const draft = parseSkillMarkdown(candidate, implied, effectiveUrl, sourceType, url);
    if (!draft.instruction || draft.instruction.length < 10) {
      return NextResponse.json({ ok: false, message: '未能提取到有效的技能指令内容' }, { status: 200 });
    }
    return NextResponse.json({ ok: true, draft, fetchedFrom: effectiveUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 200 }
    );
  }
}