# 增量交付：跨章全文检索 + 审计待办收尾（2026-09-05）

> 提交：`7c3c84e`（已推送 master，Vercel 部署触发，线上 200 验证）。
> 关联：审计第三轮 `docs/2026-09-05-audit-round-3.md`。本交付承接其 roadmap #4 并清零其 P3 待办。

***

## 一、新功能：跨章全文检索（roadmap #4 · 低难度中价值）

| 项 | 说明 |
| --- | --- |
| 检索库 | [chapter-search.ts](../src/lib/search/chapter-search.ts) 纯函数：全部章节正文搜人名/伏笔/设定词，跨章聚合命中章节 + 命中次数 + 上下文片段（命中词居中、含省略号、防重复），大小写不敏感，`maxSnippets`/`snippetRadius` 可调，无网络/IndexedDB 依赖、确定性可测 |
| UI | [ChapterSearch.tsx](../src/components/search/ChapterSearch.tsx) 卡片：输入即搜、命中片段与次数展示、点击跳转对应章节、前 20 章分页提示；接入记忆管理页顶部 |
| 测试 | 单测 5 条（空查/跨章计数/大小写/片段限制/片段含命中词）+ E2E [chapter-search.spec.ts](../e2e/chapter-search.spec.ts)（建项目→注入两章→检索命中 2 章 3 处→点击跳转）全绿 |

**用户价值**：百万字长篇中「主角在哪些章节出现」「金手指何时登场」「某伏笔埋在哪」一搜即得，替代逐章翻找，显著缩短设定连贯性核对路径。

## 二、审计 P3 待办清零（3 项）

| # | 项 | 修复 |
| --- | --- | --- |
| 11 | TXT/Markdown 导出字数口径与正文不符 | header 字数只统计已完成章，与正文导出一致 |
| 12 | Markdown TOC 锚点失效 | 按 GitHub 风格 slug（去标点→连字符）生成锚点，含空格/中文标点标题可跳转 |
| 16 | project-store 个别 action 异常悬挂 | `archiveProject`/`refreshCurrentProject` 补 try/catch/finally，loading 与 error 状态正确归位 |

至此审计第三轮 P3 待办全部清零。

## 三、质量基线（本轮实测）

- 单元测试：94 文件 / **826 用例**全绿（+5 检索 + 导出回归）
- tsc / lint / build：零错误
- E2E：**17 项全过**（跨章检索 1 + 4 分辨率响应式 16）

## 四、下阶段建议（roadmap 剩余）

按优先级：**导出中心聚合**（已基本具备，建议补「一键打包全部格式」增强）→ **批量生成队列可视化** → 一致性自愈 → 云端同步。