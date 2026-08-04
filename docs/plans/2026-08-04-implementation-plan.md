# AI 小说制作工坊 实施计划

> **基于 spec**：`docs/specs/2026-08-04-ai-novel-workshop-design.md`
> **创建日期**：2026-08-04
> **目标**：将 spec 中的 10 个开发阶段（P0-P10）分解为可执行的任务清单

---

## 实施原则

1. **严格遵循 spec**：所有实现以 spec 为准，不偏离设计
2. **阶段交付**：每个 P 阶段完成后有明确可验证的交付物
3. **测试驱动**：核心逻辑先写测试再实现（TDD）
4. **小步提交**：每个子任务完成即 git commit
5. **D 盘存储**：所有文件存放 `d:\xm\wz\ai小说制作`，不占用 C 盘

---

## P0 · 基础设施

### P0.1 项目脚手架
- [ ] 初始化 Next.js 15 项目（App Router + TypeScript + Tailwind）
- [ ] 配置 `tsconfig.json`（路径别名 `@/*`）
- [ ] 配置 ESLint + Prettier
- [ ] 创建目录结构（`src/lib/{agents,memory,llm,store,db}`、`src/types`、`src/components`）
- [ ] 初始化 git 仓库 + `.gitignore`
- **验证**：`npm run dev` 启动成功，访问 localhost:3000 看到默认页

### P0.2 依赖安装
- [ ] 安装核心：`zustand`、`dexie`、`react-hook-form`、`zod`、`framer-motion`、`sonner`
- [ ] 安装 AI：`ai`（Vercel AI SDK）、`@xenova/transformers`
- [ ] 安装 UI：`shadcn/ui` CLI 初始化 + 基础组件
- [ ] 安装测试：`vitest`、`@testing-library/react`、`@playwright/test`、`jsdom`
- [ ] 安装工具：`clsx`、`tailwind-merge`、`lucide-react`、`jszip`（EPUB导出）
- **验证**：`npm install` 无错误，`package.json` 依赖完整

### P0.3 类型定义
- [ ] 创建 `src/types/index.ts`，定义 spec 5.5 节全部接口（NovelProject/Worldview/Character/Outline/Foreshadowing/Chapter/SceneDesign/ConsistencyReport/ChapterSummary/PlotThread/StylePreset/GenreTemplate）
- [ ] 定义辅助类型（LLMConfig/Genre/ProjectStatus/ChatMessage 等）
- [ ] 定义 UI 状态类型（GenerationStage/UserIntervention 等）
- **验证**：`tsc --noEmit` 类型检查通过

### P0.4 Dexie 数据库
- [ ] 创建 `src/lib/db/schema.ts`，定义 NovelDB 类（spec 5.6 节）
- [ ] 创建 `src/lib/db/queries.ts`，封装常用 CRUD（项目/设定/章节/记忆）
- [ ] 创建 `src/lib/db/seed.ts`，预置 20+ 题材模板和 5 个文风预设
- [ ] 编写数据库单元测试（`src/lib/db/schema.test.ts`）
- **验证**：测试通过，浏览器开发者工具可见 IndexedDB 数据库

### P0.5 UI 框架
- [ ] 创建 `src/app/layout.tsx`（全局布局 + Tailwind + 字体）
- [ ] 创建 `src/components/providers.tsx`（ErrorBoundary + Toaster）
- [ ] 创建 `src/components/ui/`（基础组件：Button/Card/Input/Dialog 等）
- [ ] 创建 `src/app/page.tsx`（首页占位）
- [ ] 配置 `tailwind.config.ts`（自定义主题色 + 中文字体）
- **验证**：页面有统一视觉风格，组件可复用

### P0.6 测试配置
- [ ] 配置 `vitest.config.ts`（jsdom 环境 + 路径别名）
- [ ] 配置 `playwright.config.ts`
- [ ] 创建 `src/test/setup.ts`（测试全局 setup）
- [ ] 创建 `src/test/mocks/llm-mock.ts`（spec 7.4 节 Mock 策略）
- [ ] 创建 `src/test/mocks/db-mock.ts`（内存版 Dexie）
- **验证**：`npm test` 可运行空测试套件

**P0 里程碑交付物**：可运行的空壳应用 + 类型定义 + 数据库 + 测试框架就绪

---

## P1 · 项目管理（M1）

### P1.1 项目 Store
- [ ] 创建 `src/lib/store/project-store.ts`（Zustand：项目列表/当前项目/加载状态）
- [ ] 实现 `loadProjects()` / `createProject()` / `updateProject()` / `deleteProject()`
- **验证**：store 单元测试通过

### P1.2 首页（项目列表）
- [ ] 创建 `src/app/page.tsx`（卡片式项目列表）
- [ ] 创建 `src/components/project/ProjectCard.tsx`（显示标题/进度/状态）
- [ ] 创建 `src/components/project/EmptyState.tsx`（空状态引导）
- [ ] 实现加载/错误/空三种状态
- **验证**：访问 `/` 显示项目列表

### P1.3 新建项目
- [ ] 创建 `src/app/project/new/page.tsx`
- [ ] 创建 `src/components/project/ProjectForm.tsx`（React Hook Form + zod 校验）
- [ ] 字段：标题/题材/目标字数/一句话简介/文风预设/LLM 配置
- [ ] 提交后写入 IndexedDB 并跳转项目仪表盘
- **验证**：可创建项目并出现在列表

### P1.4 项目仪表盘
- [ ] 创建 `src/app/project/[id]/page.tsx`（概览：字数/章节/进度）
- [ ] 创建 `src/components/project/ProjectOverview.tsx`
- [ ] 创建侧边栏导航（设定/工作台/记忆/导出）
- **验证**：从首页进入项目仪表盘

### P1.5 项目配置与归档
- [ ] 创建 `src/app/project/[id]/config/page.tsx`（编辑/归档/删除）
- [ ] 实现软删除（status: 'archived'）
- **验证**：可编辑/归档/删除项目

**P1 里程碑交付物**：完整的项目 CRUD 流程

---

## P2 · 设定工坊（M2）

### P2.1 设定工坊布局
- [ ] 创建 `src/app/project/[id]/settings/layout.tsx`（Tab 切换：世界观/人物/文风/题材）
- **验证**：4 个 Tab 可切换

### P2.2 世界观模块
- [ ] 创建 `src/app/project/[id]/settings/worldview/page.tsx`
- [ ] 创建 `src/components/settings/WorldviewEditor.tsx`（手动填写表单）
- [ ] 创建 `src/components/settings/WorldviewGenerator.tsx`（AI 一键生成）
- [ ] 实现"锁定"功能（locked 字段）
- [ ] 单元测试
- **验证**：可手动填写并锁定世界观

### P2.3 人物档案模块
- [ ] 创建 `src/app/project/[id]/settings/characters/page.tsx`
- [ ] 创建 `src/components/settings/CharacterList.tsx`（人物卡片列表）
- [ ] 创建 `src/components/settings/CharacterForm.tsx`（人物编辑表单）
- [ ] 创建 `src/components/settings/CharacterRelationGraph.tsx`（关系图）
- [ ] 实现 AI 生成人物档案（输入关键词 → 完整档案）
- **验证**：可创建/编辑/删除人物

### P2.4 文风配置模块
- [ ] 创建 `src/app/project/[id]/settings/style/page.tsx`
- [ ] 创建 `src/components/settings/StyleSelector.tsx`（预设选择）
- [ ] 创建 `src/components/settings/StyleSampleUploader.tsx`（样本上传）
- [ ] 实现 Few-shot 样本解析（`src/lib/style/profile.ts`）
- **验证**：可选择预设或上传样本

### P2.5 题材模板模块
- [ ] 创建 `src/app/project/[id]/settings/genre/page.tsx`
- [ ] 显示题材模板库（从 seed 加载）
- **验证**：可浏览 20+ 题材模板

**P2 里程碑交付物**：完整设定录入流程（M1 里程碑达成）

---

## P3 · LLM 适配层

### P3.1 适配器接口
- [ ] 创建 `src/lib/llm/types.ts`（LLMAdapter/ChatParams/ChatResponse 接口）
- [ ] 创建 `src/lib/llm/providers/openai-compatible.ts`（OpenAI 兼容实现）
- [ ] 创建 `src/lib/llm/adapter.ts`（provider 路由 + 工厂函数）
- [ ] 单元测试（mock fetch）
- **验证**：可创建 DeepSeek/智谱/通义 adapter

### P3.2 服务端代理
- [ ] 创建 `src/app/api/llm/chat/route.ts`（POST 代理）
- [ ] 创建 `src/app/api/llm/embedding/route.ts`（Embedding 代理）
- [ ] API Key 从 `process.env` 读取
- [ ] 创建 `.env.example`（DEEPSEEK_API_KEY/ZHIPU_API_KEY/QWEN_API_KEY）
- **验证**：curl 调用 `/api/llm/chat` 返回 LLM 响应

### P3.3 流式输出
- [ ] 创建 `src/lib/llm/stream.ts`（SSE 流式解析）
- [ ] 创建 `src/app/api/llm/generate-chapter/route.ts`（章节生成端点，SSE 推送 progress + token）
- [ ] 创建 `src/lib/llm/client-stream.ts`（前端流式接收）
- **验证**：前端可接收流式 token

### P3.4 重试与降级
- [ ] 创建 `src/lib/llm/retry.ts`（spec 7.1 节 withRetry 函数）
- [ ] 创建 `src/lib/llm/fallback.ts`（模型降级链）
- [ ] 单元测试（指数退避/最大次数/shouldRetry）
- **验证**：重试与降级测试通过

**P3 里程碑交付物**：LLM 适配层可用，可流式调用

---

## P4 · 三级记忆体系

### P4.1 长期记忆查询
- [ ] 创建 `src/lib/memory/long-term.ts`（读取世界观/人物/大纲/伏笔）
- [ ] 实现 `loadLongTermMemory(projectId)` 函数
- [ ] 单元测试
- **验证**：可从 IndexedDB 读取长期记忆

### P4.2 向量检索
- [ ] 创建 `src/lib/memory/embedding.ts`（transformers.js 懒加载封装）
- [ ] 创建 `src/lib/memory/vector-search.ts`（Top-K 余弦相似度检索）
- [ ] 实现 TF-IDF 降级检索（`src/lib/memory/tfidf.ts`）
- [ ] 单元测试（空索引/Top-K/降级）
- **验证**：向量检索 + 降级测试通过

### P4.3 中期记忆查询
- [ ] 创建 `src/lib/memory/mid-term.ts`（章节摘要/支线/伏笔检索）
- [ ] 实现 `loadMidTermMemory(projectId, chapterNo, query)` 函数
- [ ] 单元测试
- **验证**：中期记忆检索测试通过

### P4.4 短期记忆
- [ ] 创建 `src/lib/store/short-term-memory.ts`（Zustand Store）
- [ ] 实现 `setPrevChapters()` / `setCurrentDraft()` 等方法
- **验证**：短期记忆 store 可用

### P4.5 记忆装配器
- [ ] 创建 `src/lib/memory/assembler.ts`（spec 5.5 节 assembleMemory）
- [ ] 实现 Token 预算控制（压缩策略）
- [ ] 集成测试（三级记忆完整装配）
- **验证**：记忆装配测试通过，Token 在预算内

### P4.6 记忆更新
- [ ] 创建 `src/lib/memory/updater.ts`（章节完成后更新记忆库）
- [ ] 实现摘要生成/Embedding 计算/伏笔状态更新/支线更新
- [ ] 实现"设定修改同步"（标记 needsRecheck）
- **验证**：记忆更新测试通过

**P4 里程碑交付物**：三级记忆体系完整可用

---

## P5 · 多智能体

### P5.1 剧情设计 Agent
- [ ] 创建 `src/lib/agents/plot-design.ts`（spec 6.3 节）
- [ ] 实现 Prompt 构建 / JSON 解析 / 异常处理
- [ ] 单元测试（10 个用例）
- **验证**：输入剧情要点，输出合法 SceneDesign JSON

### P5.2 文笔创作 Agent
- [ ] 创建 `src/lib/agents/writing.ts`
- [ ] 实现流式生成 / 文风应用 / 重写逻辑
- [ ] 单元测试（12 个用例）
- **验证**：流式回调触发，文风正确应用

### P5.3 一致性校验 Agent
- [ ] 创建 `src/lib/agents/consistency.ts`
- [ ] 实现问题识别 / 报告生成 / severity 判断
- [ ] 单元测试（10 个用例）
- **验证**：能识别人设/世界观矛盾

### P5.4 编排器
- [ ] 创建 `src/lib/agents/orchestrator.ts`（spec 4.3 节 generateChapter）
- [ ] 实现流程调度 / 重试控制 / 降级切换
- [ ] 单元测试（8 个用例）
- [ ] 集成测试（3 个 Agent 全流程）
- **验证**：完整章节生成流程可运行（M2 里程碑达成）

**P5 里程碑交付物**：可生成单章（核心能力验证）

---

## P6 · 创作工作台（M3）

### P6.1 大纲生成
- [ ] 创建 `src/app/project/[id]/workbench/outline/page.tsx`
- [ ] 创建 `src/components/workbench/OutlineEditor.tsx`
- [ ] 实现 AI 生成全本大纲（基于世界观+人设）
- [ ] 实现分卷/分章拆解
- **验证**：可生成并编辑大纲

### P6.2 章节列表
- [ ] 创建 `src/app/project/[id]/workbench/chapters/page.tsx`
- [ ] 创建 `src/components/workbench/ChapterList.tsx`（分页）
- [ ] 创建 `src/components/workbench/ChapterStatusBadge.tsx`
- **验证**：章节列表分页显示

### P6.3 章节生成
- [ ] 创建 `src/app/project/[id]/workbench/chapter/[n]/page.tsx`
- [ ] 创建 `src/components/workbench/ChapterGenerator.tsx`（生成按钮 + 进度条 + 流式显示）
- [ ] 创建 `src/components/workbench/GenerationProgress.tsx`（spec 4.7 节进度反馈）
- [ ] 实现 AbortController 中断生成
- **验证**：可流式生成章节

### P6.4 章节编辑与干预
- [ ] 创建 `src/components/workbench/ChapterEditor.tsx`（编辑正文）
- [ ] 实现"重写指定段落"功能
- [ ] 实现生成前干预（修改剧情要点/出场人物/禁用伏笔）
- [ ] 实现生成后干预（重写/调整文风/补充细节）
- [ ] 实现参数实时调整（温度/Top-P）
- **验证**：三种干预能力可用

### P6.5 一致性报告查看
- [ ] 创建 `src/components/workbench/ConsistencyReportView.tsx`
- [ ] 在章节页显示校验结果
- **验证**：可查看每章一致性报告

**P6 里程碑交付物**：完整创作工作台

---

## P7 · 记忆管理（M4）

### P7.1 记忆库浏览
- [ ] 创建 `src/app/project/[id]/memory/page.tsx`
- [ ] 创建 `src/components/memory/MemoryBrowser.tsx`（长期/中期/短期 Tab）
- **验证**：可浏览三级记忆

### P7.2 伏笔看板
- [ ] 创建 `src/app/project/[id]/memory/foreshadowing/page.tsx`
- [ ] 创建 `src/components/memory/ForeshadowingBoard.tsx`（Kanban 视图）
- [ ] 列：已铺设 / 待回收 / 已回收 / 已废弃
- **验证**：伏笔看板可视化

### P7.3 一致性报告列表
- [ ] 创建 `src/app/project/[id]/memory/consistency/page.tsx`
- [ ] 列出所有章节的校验报告
- [ ] 支持批量重校验（设定修改后）
- **验证**：可查看全部校验报告

### P7.4 记忆手动修正
- [ ] 创建 `src/components/memory/MemoryEditor.tsx`
- [ ] 支持编辑章节摘要/伏笔状态
- **验证**：可手动编辑记忆条目

**P7 里程碑交付物**：记忆管理完整

---

## P8 · 导出与备份（M5）

### P8.1 TXT/Markdown 导出
- [ ] 创建 `src/lib/export/txt.ts`
- [ ] 创建 `src/lib/export/markdown.ts`
- [ ] 创建导出按钮组件
- [ ] 单元测试
- **验证**：可导出 TXT/MD

### P8.2 EPUB 导出
- [ ] 安装 `jszip`
- [ ] 创建 `src/lib/export/epub.ts`（含封面/目录/章节）
- [ ] 单元测试
- **验证**：可导出 EPUB 并在阅读器打开

### P8.3 JSON 备份与导入
- [ ] 创建 `src/lib/export/backup.ts`（完整项目导出 JSON）
- [ ] 创建 `src/lib/import/restore.ts`（JSON 导入恢复）
- [ ] 创建导出中心页面
- [ ] 集成测试（导出 → 删除 → 导入 → 完整）
- **验证**：备份恢复数据完整（M3 里程碑达成）

**P8 里程碑交付物**：完整创作流程闭环

---

## P9 · 测试与优化

### P9.1 单元测试补全
- [ ] 补全所有模块单元测试（spec 7.4 节清单）
- [ ] 覆盖率达到 80%+
- **验证**：`npm run test:coverage` 报告 ≥ 80%

### P9.2 集成测试
- [ ] 章节生成完整流程
- [ ] 设定修改同步
- [ ] 模型降级
- [ ] 流式中断
- [ ] 数据备份恢复
- **验证**：集成测试全部通过

### P9.3 E2E 测试
- [ ] 创建 `e2e/generate-novel.spec.ts`（spec 7.4 节）
- [ ] 覆盖完整创作流程
- **验证**：`npm run test:e2e` 通过

### P9.4 性能优化
- [ ] IndexedDB 索引优化验证
- [ ] 向量检索性能测试（< 500ms）
- [ ] transformers.js 懒加载验证
- [ ] 流式渲染优化（requestAnimationFrame）
- [ ] Lighthouse 跑分（FCP < 1.5s）
- **验证**：性能指标达标

### P9.5 UI 美化（用户需求第7项）
- [ ] 调研 10 个优质 UI 设计案例（Dribbble/Behance/站酷）
- [ ] 设计色彩系统（主色/辅助色/中性色）
- [ ] 设计排版规范（字体层级/行高/字重）
- [ ] 优化核心组件（按钮/表单/卡片）
- [ ] 响应式适配（桌面/平板/移动端）
- [ ] 去除"AI 生成感"，提升品牌一致性
- **验证**：视觉评审通过

**P9 里程碑交付物**：测试覆盖率达标 + 性能优化 + UI 美化

---

## P10 · 部署交付

### P10.1 Vercel 部署
- [ ] 配置 `vercel.json`（环境变量）
- [ ] 推送 GitHub 仓库
- [ ] 连接 Vercel 部署
- [ ] 配置环境变量（DEEPSEEK_API_KEY 等）
- [ ] 验证线上访问
- **验证**：可通过公网域名访问

### P10.2 文档
- [ ] 创建 `README.md`（项目介绍 + 快速开始）
- [ ] 创建 `docs/user-manual.md`（用户操作指南）
- [ ] 创建 `docs/faq.md`（常见问题）
- [ ] 创建 `docs/api.md`（API 文档）
- [ ] 创建 `docs/architecture.md`（架构文档）
- **验证**：文档完整

### P10.3 测试报告
- [ ] 创建 `docs/test-report.md`（测试计划/用例/结果）
- [ ] 创建 `docs/bug-tracking.md`（缺陷跟踪）
- **验证**：测试报告完整

### P10.4 交付报告
- [ ] 创建 `docs/delivery-report.md`（功能清单 + 测试结果 + 问题修复记录）
- [ ] 按 spec 8.1 阶段汇总完成状态
- **验证**：交付报告满足验收标准（M4 里程碑达成）

**P10 里程碑交付物**：可访问的产品 + 完整文档 + 交付报告

---

## Git 提交规范

每个子任务完成后提交：

```
<type>(<scope>): <subject>

- <type>: feat | fix | test | docs | refactor | chore
- <scope>: p0 | p1 | ... | p10 或模块名
- <subject>: 简短描述

示例：
feat(p0): 初始化 Next.js 15 项目脚手架
feat(p0): 定义全部 TypeScript 类型（spec 5.5）
test(p4): 添加记忆装配器单元测试
docs(p10): 创建用户手册
```

---

## 风险与应对

参见 spec 7.6 节。开发过程中如遇以下情况立即停止并沟通：
1. LLM 输出严重不稳定，一致性校验无法通过
2. 浏览器内存不足导致崩溃
3. IndexedDB 配额超限
4. 免费 API 额度耗尽

---

**END OF IMPLEMENTATION PLAN**
