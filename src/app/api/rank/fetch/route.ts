// ============================================================================
// 实时榜单抓取 API（GET /api/rank/fetch?platform=fanqie）
// 服务端 fetch（无 CORS），对 SSR / 静态直出平台实时抓取；被反爬盾/JS 渲染
// 阻断的平台返回 blocked + 浏览器提示，统一降级到「榜单粘贴拆解」。
// ============================================================================
import { NextResponse } from 'next/server';
import { scrapePlatform, scrapableSourceIds } from '@/lib/rank/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const platform = (url.searchParams.get('platform') ?? '').trim();
  if (!platform) {
    return NextResponse.json(
      { ok: false, message: '缺少 platform 参数', scrapable: scrapableSourceIds() },
      { status: 400 }
    );
  }
  try {
    const result = await scrapePlatform(platform);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, sourceId: platform, message: err instanceof Error ? err.message : String(err), books: [] },
      { status: 200 }
    );
  }
}
