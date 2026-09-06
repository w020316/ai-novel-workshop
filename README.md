# AI 小说工坊（ai-novel-workshop）

浏览器端 AI 长篇小说创作工坊：从灵感、世界观、人设、大纲到逐章正文生成的全流程创作系统，内置三级记忆体系与一致性校验，支持多模型、抽卡式多候选、风格蒸馏与一键开书。

**线上地址**：https://ai-novel-workshop-o25z.vercel.app

## 功能总览

- **项目管理**：多项目 CRUD、归档、字数进度统计
- **灵感一键开书**：书名+简介+金手指+世界观种子一键生成，灵感起点支持「换一批」（AI 优先 + 兜底池）
- **设定工坊**：世界观 AI 生成（脑洞内核）、人设生成（内核冲突句式「渴望X却害怕Y所以总是Z」）、文风蒸馏（样本 → 风格指南）、20+ 题材模板
- **扫榜拆书**：实时网文榜单抓取 + 出圈拆解成灵感卡（题材定位/金手指/钩子/爽点/手法三原则）
- **多智能体创作**：剧情设计 → 文笔创作 → 一致性校验三 Agent 编排，支持 1-3 候选抽卡、流式输出、中断与段落重写
- **三级记忆**：长期（设定/大纲/伏笔）+ 中期（摘要检索/向量+TF-IDF 降级）+ 短期（前情），Token 预算自动压缩
- **主线锚点**：卷规划、章题联动、剧情纲要（ArcCanon）、一致性自愈，防止长篇烂文
- **技能库**：15 个内置写作方法论技能（人设/期待感/反派/反转/对白/群像/逻辑等），按生成环节注入，支持 JSON 导入导出自建「专属数据库」
- **导出**：TXT / Markdown / EPUB / JSON 备份恢复 / 打包导出、WebDAV 同步
- **多模型**：Gemini / GLM / DeepSeek 等 OpenAI 兼容端点 + Ollama 本地模型 + 免费模型发现，服务端代理不落库 Key

## 快速开始

```bash
# 环境要求：Node.js 18+
npm install

# 配置环境变量（可选，也可在页面内配置 API Key）
cp .env.example .env.local

# 开发
npm run dev        # http://localhost:3000

# 测试
npm run test       # 单元测试（vitest）
npm run typecheck  # 类型检查
npm run test:e2e   # E2E（playwright）

# 构建
npm run build
```

## 技术栈

Next.js 15（App Router）· React 19 · TypeScript · Tailwind CSS · Zustand · Dexie（IndexedDB）· Framer Motion · Vitest · Playwright

## 文档

- 用户手册：[docs/user-manual.md](docs/user-manual.md)
- 交付报告：[docs/2026-09-03-delivery-report.md](docs/2026-09-03-delivery-report.md)
- 实施计划与进度：[docs/plans/2026-08-04-implementation-plan.md](docs/plans/2026-08-04-implementation-plan.md)
- 设计规格：[docs/specs/2026-08-04-ai-novel-workshop-design.md](docs/specs/2026-08-04-ai-novel-workshop-design.md)
- 功能更新记录：`docs/2026-09-0X-*.md`（按日期）

## License

MIT
