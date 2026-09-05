// ============================================================================
// WebDAV 服务端代理（POST /api/webdav/proxy）
// 浏览器直连 WebDAV 服务（坚果云等）普遍被 CORS 拦截，统一由本代理转发。
// 安全（与 /api/skills/import 同标准）：
//   1. 仅允许 https（Basic Auth 凭据不能明文过公网）
//   2. 静态目标校验（checkUrlTarget：内网主机名 / IP 字面量 / 协议）
//   3. DNS 解析校验（lookup all：拒绝解析到内网/本地/保留段，含 IPv6）
//   4. redirect: 'manual' 逐跳重校验，最多 3 跳，杜绝「公网 302 转跳内网」
//   5. 请求/响应体大小上限，防止超大包滥用
// ============================================================================
import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { checkUrlTarget, extractHostname, isReservedIpv4, isReservedIpv6 } from '@/lib/skills/import';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 64 * 1024 * 1024; // 64MB：百万字全书备份 JSON 上限

interface ProxyBody {
  action?: 'put' | 'get' | 'list' | 'delete';
  url?: string;
  username?: string;
  password?: string;
  payload?: string;
}

/** 静态 + DNS 双层目标校验（含 https 强制） */
async function checkTarget(url: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '无效的 URL';
  }
  if (u.protocol !== 'https:') return 'WebDAV 服务器仅支持 https 地址';
  const staticErr = checkUrlTarget(url);
  if (staticErr) return staticErr;
  const host = extractHostname(url);
  if (!host) return '无效的 URL';
  try {
    const addrs = await lookup(host, { all: true });
    for (const a of addrs) {
      if (isReservedIpv4(a.address) || isReservedIpv6(a.address)) {
        return `目标解析到内网/本地地址：${a.address}`;
      }
    }
  } catch {
    // DNS 解析失败交给 fetch 决定，不当成安全拒绝
  }
  return null;
}

const ACTION_METHOD: Record<NonNullable<ProxyBody['action']>, string> = {
  put: 'PUT',
  get: 'GET',
  list: 'PROPFIND',
  delete: 'DELETE',
};

/** 逐跳校验转发；所有动作响应体均为文本（JSON / XML） */
async function forward(
  action: NonNullable<ProxyBody['action']>,
  url: string,
  authHeader: string,
  payload?: string
): Promise<{ status: number; text: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const err = await checkTarget(current);
    if (err) throw new Error(err);

    const res = await fetch(current, {
      method: ACTION_METHOD[action],
      headers: {
        ...(authHeader ? { authorization: authHeader } : {}),
        ...(action === 'list' ? { depth: '1' } : {}),
        ...(action === 'put' && payload != null ? { 'content-type': 'application/json;charset=utf-8' } : {}),
      },
      body: action === 'put' ? payload : undefined,
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`HTTP ${res.status}（重定向缺少 location）`);
      if (hop === MAX_REDIRECTS) throw new Error('重定向次数过多，已中止');
      current = new URL(loc, current).toString();
      continue;
    }

    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > MAX_BODY_BYTES) throw new Error('远端响应过大，已中止');
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) throw new Error('远端响应过大，已中止');
    return { status: res.status, text };
  }
  throw new Error('重定向次数过多，已中止');
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return NextResponse.json({ ok: false, error: '无效的请求体' }, { status: 400 });
  }

  const { action, url, username = '', password = '', payload } = body;
  if (!action || !ACTION_METHOD[action]) {
    return NextResponse.json({ ok: false, error: '不支持的操作' }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ ok: false, error: '缺少目标 URL' }, { status: 400 });
  }
  if (action === 'put') {
    if (payload == null) {
      return NextResponse.json({ ok: false, error: '缺少上传内容' }, { status: 400 });
    }
    if (payload.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: '备份内容过大（>64MB）' }, { status: 413 });
    }
  }

  try {
    const authHeader =
      username || password
        ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
        : '';
    const { status, text } = await forward(action, url, authHeader, payload);

    if (action === 'put') {
      // WebDAV PUT 成功通常是 201/204，个别服务返回 200
      if (status >= 200 && status < 300) return NextResponse.json({ ok: true, status });
      return NextResponse.json({ ok: false, error: `上传失败（HTTP ${status}）` }, { status: 502 });
    }
    if (action === 'delete') {
      if (status >= 200 && status < 300) return NextResponse.json({ ok: true, status });
      return NextResponse.json({ ok: false, error: `删除失败（HTTP ${status}）` }, { status: 502 });
    }
    // get / list：4xx/5xx 原样报错（401 提示凭据、404 提示文件不存在）
    if (status === 401 || status === 403) {
      return NextResponse.json({ ok: false, error: '鉴权失败（401），请检查账号与应用密码' }, { status: 502 });
    }
    if (status === 404) {
      return NextResponse.json({ ok: false, error: '远端不存在（404），请检查目录或备份是否已被删除' }, { status: 502 });
    }
    if (status < 200 || status >= 300) {
      return NextResponse.json({ ok: false, error: `远端错误（HTTP ${status}）` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, status, text });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
