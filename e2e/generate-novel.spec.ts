// 全流程 E2E：新建项目 → 章节页一键生成（Mock LLM）→ 正文流式渲染 → 一致性报告 → 章节落库
// Mock 策略（spec 7.4）：拦截 /api/llm/chat（剧情设计/标题/一致性）与 /api/llm/generate-chapter（SSE 流），
// 不依赖真实 API Key，可在 CI 稳定运行。
import { test, expect } from '@playwright/test';

const SCENE_DESIGN = {
  setting: '荒山古观，残卷现世',
  conflict: '主角与守观人争夺上古残卷',
  highlight: '残卷背后藏着主角身世，守观人当场跪地',
  foreshadowingToPlant: [],
  foreshadowingToRecover: [],
  characterAppearances: [],
};

const CONSISTENCY_REPORT = { passed: true, issues: [] };

test('全流程：创建项目 → 生成第 1 章 → 一致性通过 → 章节保存', async ({ page }) => {
  // ===== Mock LLM 端点 =====
  await page.route('**/api/llm/chat', async (route) => {
    const body = route.request().postDataJSON() as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = body?.messages?.[0]?.content ?? '';
    const payload = system.includes('质量审核') || system.includes('一致性')
      ? CONSISTENCY_REPORT
      : SCENE_DESIGN;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: JSON.stringify(payload) }),
    });
  });

  await page.route('**/api/llm/generate-chapter', async (route) => {
    const sse =
      'event: start\ndata: {"provider":"mock","model":"mock"}\n\n' +
      'event: token\ndata: {"token":"少年推开山门，"}\n\n' +
      'event: token\ndata: {"token":"古观深处传来剑鸣。"}\n\n' +
      'event: done\ndata: {"totalTokens":12,"provider":"mock","model":"mock"}\n\n';
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sse,
    });
  });

  // Embedding 懒加载兜底（避免 transformers.js 下载模型）
  await page.route('**/api/llm/embedding', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ embedding: [] }),
    });
  });

  // ===== 创建项目（三步向导） =====
  await page.goto('/project/new');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('小说标题 *').fill('全流程测试书');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForSelector('text=目标字数');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForSelector('text=AI 模型配置');
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.waitForURL(/\/project\/proj_/);
  const projectId = new URL(page.url()).pathname.split('/')[2];
  expect(projectId).toBeTruthy();

  // ===== 进入第 1 章工作台并生成 =====
  await page.goto(`/project/${projectId}/workbench/chapter/1`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '开始生成' }).click();

  // 流式正文渲染（Mock 两个 token 依次到达）
  await expect(page.getByText(/少年推开山门/).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/古观深处传来剑鸣/).first()).toBeVisible({ timeout: 20000 });

  // 一致性校验通过报告展示
  await expect(page.getByText('一致性校验通过，未发现问题')).toBeVisible({ timeout: 20000 });

  // 章节已落库：刷新后回到本章页面，内容仍可从 IndexedDB 读回
  await page.reload();
  await page.waitForLoadState('networkidle');
  const saved = await page.evaluate(async (pid) => {
    const idb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ai_novel_workshop');
      req.onupgradeneeded = () => req.result;
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = idb.transaction('chapters', 'readonly');
    const store = tx.objectStore('chapters');
    return new Promise<number>((resolve) => {
      const req = store.getAll();
      req.onsuccess = () =>
        resolve((req.result as Array<{ projectId: string }>).filter((c) => c.projectId === pid).length);
      req.onerror = () => resolve(0);
    });
  }, projectId);
  expect(saved).toBeGreaterThan(0);
});
