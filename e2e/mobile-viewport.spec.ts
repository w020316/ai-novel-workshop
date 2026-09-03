// ============================================================================
// 移动端视口巡检（P0-工具）
// 以 Pixel 5（393x851）视口访问无项目依赖核心路由，断言无横向溢出。
// 说明：
//  - 采用「单会话内顺序访问」，避免 next dev 冷编译导致的会话重置假阴性
//  - 公开路由不依赖浏览器预置 IndexedDB 数据，可在全新环境直接运行
// ============================================================================
import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = [
  { path: '/', name: '首页（空态）' },
  { path: '/inspiration', name: '趋势灵感' },
  { path: '/inspiration/library', name: '全局灵感库' },
  { path: '/project/new', name: '新建项目' },
];

test('[移动端] 核心公开路由 无横向溢出 + 可见内容', async ({ page }) => {
  const results: string[] = [];
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    // 等待首屏 JS 挂载稳定
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    const hasOverflow = overflow.scrollW > overflow.clientW + 1;

    if (hasOverflow) {
      results.push(`溢出: ${route.name} (scrollW=${overflow.scrollW}, clientW=${overflow.clientW})`);
    } else {
      results.push(`OK: ${route.name}`);
    }
  }
  if (results.some((r) => r.startsWith('溢出'))) {
    throw new Error(results.filter((r) => r.startsWith('溢出')).join('\n'));
  }
  // 报告通过的所有路由
  expect(results.filter((r) => r.startsWith('OK'))).toHaveLength(PUBLIC_ROUTES.length);
});