// 跨章全文检索 E2E 走查：新建项目 → 写入两章带关键词文字 → 记忆页检索
import { test, expect } from '@playwright/test';

test('跨章全文检索：命中章节、片段与跳转', async ({ page }) => {
  await page.goto('/project/new');
  await page.waitForLoadState('networkidle');

  // 三步向导第 1 步：填标题
  await page.getByLabel('小说标题 *').fill('检索测试书');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForSelector('text=目标字数');
  // 第 2 步继续
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForSelector('text=AI 模型配置');
  // 第 3 步创建
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.waitForURL(/\/project\/proj_/);
  const projectId = new URL(page.url()).pathname.split('/')[2];
  expect(projectId).toBeTruthy();

  // 用 IndexedDB 注入两章带关键词的正文（走数据库层更快更稳）
  await page.evaluate(async (projectId) => {
    const idb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ai_novel_workshop');
      req.onupgradeneeded = () => req.result;
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = idb.transaction('chapters', 'readwrite');
    const store = tx.objectStore('chapters');
    const now = Date.now();
    const chapter = (id: string, chapterNo: number, title: string, content: string) =>
      store.put({ id, projectId, volumeNo: 1, chapterNo, title, plotPoints: [], content, wordCount: 30, status: 'completed', createdAt: now, updatedAt: now });
    await chapter('ch_t1', 1, '初入宗门', '少年满怀期待第一次走进这座古老宗门，宗门的长老端坐堂前。');
    await chapter('ch_t2', 2, '宗门试炼', '宗门试炼中他得到一把灵剑，剑身刻着「凌云」二字。');
    await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = () => resolve; });
  }, projectId);

  // 进入记忆页检索
  await page.goto(`/project/${projectId}/memory`);
  await page.waitForLoadState('networkidle');
  const searchBox = page.getByLabel('跨章检索关键词');
  await expect(searchBox).toBeAttached();

  await searchBox.fill('宗门');
  await page.getByRole('button', { name: '检索' }).click();
  await page.waitForSelector('text=找到 2 章');
  await expect(page.getByText(/找到 2 章/)).toBeVisible();
  await expect(page.getByText(/命中 2 处/).first()).toBeVisible();
  // 两章的标题链接均命中（用 link role 避免与正文片段 strict 冲突）
  await expect(page.getByRole('link', { name: /初入宗门/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /宗门试炼/ })).toBeVisible();

  // 点击跳转第 1 章
  await page.getByRole('link', { name: '第1章 初入宗门' }).click();
  await page.waitForURL(new RegExp(`/project/${projectId}/workbench/chapter/1$`));
});