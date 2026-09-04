// 多分辨率响应式走查（审计第三轮 · 页面检查）
// 覆盖 1920x1080 / 1366x768 / 768x1024 / 375x667 × 核心路由，检测横向溢出
import { test, expect } from '@playwright/test';

const ROUTES = ['/', '/project/new', '/skills', '/dashboard'];

for (const [w, h, label] of [
  [1920, 1080, 'desktop-1920'],
  [1366, 768, 'laptop-1366'],
  [768, 1024, 'tablet-768'],
  [375, 667, 'mobile-375'],
] as const) {
  test.describe(`响应式 ${label}`, () => {
    test.use({ viewport: { width: w, height: h } });

    for (const route of ROUTES) {
      test(`${route} 无横向溢出`, async ({ page }) => {
        await page.goto(route, { waitUntil: 'networkidle' });
        const result = await page.evaluate(() => {
          const d = document.documentElement;
          const overflow = d.scrollWidth - d.clientWidth;
          // 找出超出视口宽度的元素（容忍 8px 误差，忽略容器内滚动）
          const offenders: string[] = [];
          document.querySelectorAll('body *').forEach((el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const scrollable = ['auto', 'scroll'].includes(style.overflowX);
            if (rect.width > d.clientWidth + 8 && !scrollable && offenders.length < 5) {
              const cls = (el.className || '').toString().slice(0, 50);
              offenders.push(`${el.tagName}.${cls}`);
            }
          });
          return { overflow, offenders };
        });
        expect(
          result.overflow,
          `[${label}] ${route} 横向溢出 ${result.overflow}px，元凶: ${result.offenders.join(' | ')}`
        ).toBeLessThanOrEqual(8);
      });
    }
  });
}
