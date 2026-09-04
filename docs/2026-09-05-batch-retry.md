# 批量续写失败重试机制 · 交付说明

日期：2026-09-05
范围：批量续写链路（工作台 → batch 编排 → 任务持久化）

## 一、问题

批量续写（最多 50 章）运行期间，任一章生成失败（网络抖动、LLM 瞬时 429/5xx）会直接中断整批：

1. 无自动重试——一次瞬时故障即停止整批挂机生成；
2. 失败章号与原因不持久化——刷新后只剩通用报错，用户不知道卡在哪一章、为何失败；
3. 队列可视化无失败态——失败章与待生成章无法区分。

## 二、方案

**设计取舍**：单章重试耗尽后停止整批而非跳章续写——后续章依赖前章记忆回溯，跳章会产生记忆断层（烂文风险），因此失败章必须原地重试成功后才能继续。

### 1. 章级自动重试（src/lib/agents/batch.ts）

- `generateChaptersBatch` 新增 `maxRetriesPerChapter`（默认 2）与 `retryDelayMs`（默认 1500ms，指数退避 ×2 递增）；
- 非中止类错误自动重试；`AbortError` 不重试，保持原有 aborted 暂停语义；
- 重试耗尽抛 `BatchChapterError`（携带 chapterNo / attempts / 原始错误信息）。

### 2. 失败现场持久化（src/lib/batch/job-store.ts + types）

- `BatchJob` 新增 `failedChapterNo` / `lastError`；
- `pauseBatchJob` 支持携带失败信息写入；新增 `clearBatchJobFailure` 在新一轮运行开始时清除旧标记。

### 3. UI 失败定位（src/app/project/[id]/workbench/page.tsx）

- 队列格子新增红色失败态（✕），悬停显示失败原因；
- 断点续写横幅显示「上次在第 X 章失败（已自动重试仍未成功）：原因」；
- toast 精确提示失败章号与重试次数；
- 「继续批量续写」从失败章原地重试（该章未落库，resume 的 maxChapterNo+1 恰好指向它）。

## 三、验证

- batch.test.ts 21/21 通过（新增 6 用例：瞬时失败重试成功 / 重试耗尽抛 BatchChapterError / AbortError 不重试 / failed 队列状态 / 空数组向后兼容）；
- `tsc --noEmit` 零错误；
- 全量回归见交付报告。

## 四、涉及文件

| 文件 | 变更 |
| --- | --- |
| src/lib/agents/batch.ts | 章级重试 + BatchChapterError + 队列 failed 态 |
| src/lib/batch/job-store.ts | 失败现场持久化 / 清除 |
| src/types/index.ts | BatchJob 增 failedChapterNo / lastError |
| src/app/project/[id]/workbench/page.tsx | 红格 / 失败横幅 / 精确 toast / 重试入口 |
| src/lib/agents/batch.test.ts | 新增 6 用例 |
