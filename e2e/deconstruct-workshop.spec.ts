// 拆书工坊 E2E 走查：粘贴对标文本 → Mock LLM 返回剧情骨架（五件套+因果链+公式+灵感卡）
// → 校验拆解结果展示 → 灵感卡收藏 → 存为技能（拆书→沉淀→复用闭环）
import { test, expect } from '@playwright/test';

// 与 analyzer SYSTEM_PROMPT 字段对应：骨架五件套 + 因果链 + 公式 + 建议 + 灵感卡
const DECON_RESULT = {
  skeleton: {
    goal: '查明黑衣人身份',
    openingHook: '尸体突现制造危机，三段内抛出悬念',
    conflict: '主角与幕后黑手争夺残卷，赌注是满城性命',
    payoff: '当众反将一军的智斗快感',
    cliffhanger: '火光冲天+半遮半掩的疑问收尾',
  },
  causalChain: [
    '因为黑衣人携旧暗号出现',
    '所以主角识破雷家布局',
    '进而城西火起，全局危机升级',
  ],
  formula: '使者位携旧暗号归来 → 执棋位识破布局 → 危机位同步爆发收尾',
  suggestions: ['开头 3 段内完成主角亮相与危机压顶', '章末用"就在这时"式断章'],
  cards: [
    { kind: 'hook', title: '断章钩子', content: '章末用"就在这时"+危机爆发锁住追读' },
    { kind: 'coolpoint', title: '打脸节奏', content: '冲突后立刻接一个当众反将' },
  ],
};

const SAMPLE_TEXT = `夜色如墨，朱雀大街空无一人。突然，巷口传来一声闷响——李沉舟脚步一顿，握紧了刀柄。
黑衣人贴着墙根滑落，像一块被丢开的破布。李沉舟只觉得心脏骤停：这人不可能还活着。
"谁派你来的？"他压低嗓音，刀已出鞘三寸。黑影没有答话。半晌，一只苍白的手探出，指尖叩地三下——是暗号，第五记。
李沉舟瞳孔微缩，当众反将一军："第五记？三日前那夜，你早该被烧成灰了。"
话音未落，黑衣人口中溢出血沫："雷家……动的手。"李沉舟想起什么，骤然转身。就在这时，城西方向火光冲天，隐约传来喊杀声。
他深吸一口气，又缓缓吐出，望着映红半边天的火光，脑海里只剩下一个念头：这场局，究竟是谁布下的？
然而更让他不安的是，暗号第五记早已随着三年前那场大火一同埋葬，除了他自己，不该再有任何人知道。`.replace(/\n/g, '');

test('拆书工坊：骨架拆解 → 灵感卡收藏 → 存为技能', async ({ page }) => {
  // Mock LLM：拆书教练请求返回骨架五件套 + 因果链 + 公式 + 建议 + 灵感卡
  await page.route('**/api/llm/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: JSON.stringify(DECON_RESULT) }),
    });
  });

  // 新建项目（三步向导）
  await page.goto('/project/new');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('小说标题 *').fill('拆书测试书');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForSelector('text=目标字数');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForSelector('text=AI 模型配置');
  await page.getByRole('button', { name: '创建项目' }).click();
  await page.waitForURL(/\/project\/proj_/);
  const projectId = new URL(page.url()).pathname.split('/')[2];
  expect(projectId).toBeTruthy();

  // 进入拆书工坊
  await page.goto(`/project/${projectId}/settings/deconstruct`);
  await page.waitForLoadState('networkidle');

  // 粘贴对标文本并触发拆解
  await page.getByPlaceholder(/粘贴参考章节/).fill(SAMPLE_TEXT);
  await page.getByPlaceholder('例如：《XXX》第三章').fill('《测试》第三章');
  await page.getByRole('button', { name: '开始拆解' }).click();

  // 拆解结果：剧情骨架五件套 + 因果链 + 可复用公式 + 建议 + 灵感卡
  await page.waitForSelector('text=剧情骨架');
  await expect(page.getByText('查明黑衣人身份')).toBeVisible();
  await expect(page.getByText('因果链（逐步升级）')).toBeVisible();
  await expect(page.getByText('使者位携旧暗号归来')).toBeVisible();
  await expect(page.getByText('开头 3 段内完成主角亮相与危机压顶')).toBeVisible();
  await expect(page.getByText('断章钩子').first()).toBeVisible();

  // 灵感卡点击收藏（同名文本在收藏后会出现在收藏库，取第一个）
  await page.getByText('断章钩子').first().click();
  await expect(page.getByText('灵感卡已收藏')).toBeVisible();

  // 存为技能：拆解沉淀进入技能库（复用闭环）
  await page.getByRole('button', { name: '存为技能' }).click();
  await expect(page.getByText('已存为技能')).toBeVisible();
});
