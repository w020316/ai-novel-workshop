# 交付文档：一句话自动开书 + 世界时间线

> 日期：2026-09-05
> 来源：docs/research/2026-09-04-open-source-research-v2.md 差距清单 P1-1（自动开书，对标 AI-Novel-Writing-Assistant）与 P2-7（时间线可视化，对标 AI-Novel-Writing-Assistant 时间线 track），延续笔枢/Openwrite 视频功能参考路线。

## 一、功能清单

### A. 一句话灵感 → 自动开书（新建项目页）
- 新增 `src/lib/llm/generators/book-package.ts`：
  - `generateBookPackage`：输入一句灵感，LLM 生成**开书包**（书名·备选书名·题材·一句话简介·金手指·主线冲突·长线钩子·世界观种子），题材白名单校验，关键字段缺失整包降级
  - `heuristicBookPackage`：确定性启发式兜底（灵感关键词 → 题材映射 + 模板组装），LLM 不可用时绝不阻塞开书
  - `bookPackageToSummary`：开书包四要素 → 向导「简介」预填文本
- 新建页顶部新增「一句话灵感 · 自动开书」卡片（[new-project-client.tsx](../src/components/project/new-project-client.tsx)）：生成/换一版/用此设定填入向导，填入后平滑滚动至三步向导
- `ProjectForm` 增加可选 `prefill` prop（version 驱动填入），不影响既有 URL query 预填与草稿恢复逻辑
- 单测 `book-package.test.ts`：10 用例（题材映射/兜底/书名提取/LLM 白名单/半残降级/失败降级/短灵感不调 LLM/摘要拼接）

### B. 世界时间线（记忆管理页）
- 新增 `src/lib/worldstate/timeline.ts`：纯函数构建「卷 → 章 → 关键事件」时间线（每章至多 3 条事件、空事件过滤、无摘要章节仅标题），确定性可测
- 新增 `src/components/memory/WorldTimeline.tsx`：品牌色竖向时间轴，按卷分组展示全局事件流，一眼核对事件因果链
- 单测 `timeline.test.ts`：5 用例（分组排序/事件截断/无摘要章/空输入/确定性）

## 二、质量验证

| 项目 | 结果 |
| --- | --- |
| tsc --noEmit | 通过 |
| vitest 全量 | 101 文件 / 891 用例 全部通过（较上轮 +2 文件 / +15 用例） |
| next build | 通过 |
| 部署 | push master → Vercel 自动部署 success |

## 三、设计取舍
- 开书包 LLM 产出不合规时**整包**退回启发式（而非半残拼接）：开书是新手第一触点，宁可用模板也不能给坏起点。
- 时间线为纯展示聚合（与 WorldStateCard 同源数据），不引入新存储：摘要已有 keyEvents 字段，零迁移成本。
- 填入向导用 prop 驱动而非 URL 跳转：同页交互下 URL effect 不会重跑，prop+version 可靠且不与草稿恢复冲突。

## 四、涉及文件
- 新增：`src/lib/llm/generators/book-package.ts`、`book-package.test.ts`、`src/components/project/new-project-client.tsx`、`src/lib/worldstate/timeline.ts`、`timeline.test.ts`、`src/components/memory/WorldTimeline.tsx`
- 修改：`src/app/project/new/page.tsx`（NewProjectClient 组装）、`src/components/project/project-form.tsx`（prefill prop）、`src/app/project/[id]/memory/page.tsx`（WorldTimeline 接入）

## 五、剩余差距（下轮候选）
- P1-2 剧情纲要（ArcCanon）随写随更：全书真值锚点，防百万字中段跑偏（工作量中高）
- P1-4 人设化文风去AI味增强：文风预设绑定叙述者人格
- P2-5 Ollama/本地端点接入、P2-6 Markdown 导入回流
