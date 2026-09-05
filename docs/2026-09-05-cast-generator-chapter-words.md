# 交付文档 · AI 一键生成全套人物 + 每章字数可调

> 提交：c2ac23f · 已推送 master 并线上验证（Vercel chunk 特征串命中）

## 需求背景

用户要求「人物档案也可以自动生成，提供选择，关键词也要生成，其次才是自己操作填写。另外可以调整章节字数，调节章节。重点是 AI 全流程干预，操作，其次才是轻微人工干预」。

## 变更清单

### 1. AI 一键生成全套人物（全流程优先）

| 文件 | 变更 |
| --- | --- |
| `src/lib/character/cast.ts`（新增） | `generateCastProposal`：按题材/简介/世界观一次性产出 4-6 人人物团提案（姓名/角色定位/关键词全由 AI 给出）；LLM 不可用回退题材启发式人物团（确定性可测）；`normalizeCastProposal` 做去重/过滤/钳制 |
| `src/lib/character/cast.test.ts`（新增） | 7 条单测：归一化、LLM 成功、垃圾内容回退、抛错回退、count 钳制 |
| `src/components/settings/CastGenerator.tsx`（新增） | 两步式卡片：生成提案 → 勾选 + 微调姓名/关键词 → 批量逐位调 `generateCharacterWithLLM` 生成完整档案并保存，进度可视化，失败模板兜底 |
| `src/app/project/[id]/settings/characters/page.tsx` | 人物页置顶「AI 一键生成全套人物」（推荐标签），原单人生成卡降为次要入口 |
| `src/components/settings/CharacterList.tsx` | 空态文案引导改为批量生成入口 |

人工干预被压缩为「勾选与改词」；其余全部 AI 完成。

### 2. 每章字数可调（章节数联动）

| 文件 | 变更 |
| --- | --- |
| `src/types/index.ts` | `NovelProject.chapterWords?: number` |
| `src/lib/validators.ts` | 表单 schema 增加 chapterWords（1000-10000） |
| `src/components/project/project-form.tsx` | 第 2 步新增「每章字数」控件（2000/2500/3000/4000 快捷档），字数/章节数/每章字数三方实时联动 |
| `src/app/project/[id]/config/page.tsx` | 已建项目可在「项目配置」调整每章字数（含快捷档与章节数预估） |
| `src/lib/outline/volume-plan.ts` | `planVolumes/summarizePlan/estimateTotalChapters/estimateVolumeCount` 支持 `wordsPerChapter` 参数（缺省 2500，向后兼容） |
| `src/lib/outline/template.ts` + 大纲页 | 题材模板起底按项目 chapterWords 分卷 |
| `src/lib/agents/writing.ts` + `orchestrator.ts` | 写作 Agent 注入【字数要求】（±10%），AI 正文按每章字数控制篇幅（单写/批量/抽卡候选均生效） |
| `src/lib/health/health-check.ts`、`project-card.tsx` | 规划章数估算同步按 chapterWords |

## 验证

- vitest：112 文件 / 1024 用例全绿（含 cast 新增 7 条）
- tsc --noEmit：0 错误
- next build：成功
- 线上验证：`verify-deploy.mjs` 命中「每章字数」「AI 一键生成全套人物」chunk

## 兼容性

- 旧项目无 chapterWords 字段：全链路缺省按 2500 估算，行为与升级前一致
- 章节数换算、分卷规划、写作篇幅提示均向后兼容（参数带默认值）

---

## 追加迭代（c036df3 · 已上线验证）

### 3. 设定不满意可换一版（退出/重生成）

- 项目概览「故事设定」卡新增「不满意？换一版设定」：AI 以书名+题材+现有简介为灵感重出设定（复用 generateBookPackage，LLM 不可用自动启发式兜底），确认后替换简介并即时刷新
- 同卡提供「手动编辑」入口直达项目配置，不再只能单向往下操作

### 4. 每章字数按平台爆款标准

- 新增 `PLATFORM_CHAPTER_STANDARDS`（volume-plan.ts）：番茄/七猫 2000（免费端黄金字数）、通用 2500、晋江/纵横 3000、起点大章 4000；依据 2025-2026 各平台公开口径与爆款经验
- 新建向导与项目配置的快捷档位统一替换为平台标准，选中档位悬浮展示适配说明

---

## 全流程 E2E 实测报告（fix 提交 · 本次）

### 实测方式

- 本地 
pm run dev（加载 .env.local 真实 Gemini 调用）+ 浏览器自动化逐页走查，覆盖：首页 → 灵感页（生成灵感→以此新建小说）→ 新建向导 3 步（一句话开书包 / 每章字数平台档位联动）→ 项目概览（换一版设定×1）→ 世界观一键生成 → 人物档案「AI 一键生成全套人物」（提案→勾选→批量 5 位）→ 大纲题材模板起底（校验 75 章分卷一致）→ 创作工作台第 1 章真实生成×3 → 保存 → 数据看板 → 健康体检 → 导出中心 → 项目配置（每章字数改档联动）→ 趋势/拆书/起名/灵感库/技能库/文风/题材模板页

### 问题清单与修复

| # | 严重度 | 问题 | 根因 | 修复 |
|---|--------|------|------|------|
| 1 | **严重** | 章节正文生成后只有开头 ~110 字即被截断，一致性校验报「正文结尾出现未完成的句子」（2 次复现） | 思考型模型（Gemini 3.6-flash）的思考 token 计入输出上限；generate-chapter 默认 maxTokens=4096 被思考挤占，正文 100 token 即触发 MAX_TOKENS 硬截断 | generate-chapter 默认 maxTokens 4096→16384、上限 8192→32768；gemini maxOutputTokens 8192→65536。实测对比：4096 输出 2405 字 vs 8192 输出 4250 字；修复后第 1 章完整生成 **5015 字**且一致性校验不再报截断 |
| 2 | 中 | 人物名被 LLM 塞入附注：「寂灭者（原名：虚空行者·赫尔墨斯）」，关系图/看板/图谱直接显示长名 | character 生成器与 cast 提案对 name 字段未清洗 | 新增 sanitizeCharacterName（去括号附注/引号/破折号补充、截 12 字），character.ts 与 cast.ts 双入口应用；+4 单测 |
| 3 | 低 | 大纲卷标题重复前缀：「第 3 卷 · 第3卷 · 角力期局势」 | volumeTitle 模板自带「第N卷」前缀，展示层再拼一次 | volumeTitle 只返回纯主题名，卷号由展示层/记忆层统一拼接 |
| 4 | 环境 | 浏览器访问 localhost:3000 加载的是旧生产构建（无新功能控件） | 3000 端口被残留的 
ext start 进程占用，dev server 未绑上端口 | 终止残留进程后重跑 dev；非代码问题 |

### 实测通过项（真实 AI 调用）

- 一句话灵感 → 开书包（书名/简介/金手指/主线冲突/长线钩子/世界观种子全自动）→ 一键填入向导 ✓
- 每章字数平台档位联动：点「起点大章 4000」→ 目标 30 万字自动换算 75 章 → 大纲模板按 1-19/20-38/39-57/58-75 分 4 卷 ✓
- 换一版设定：确认后 AI 重出简介即时刷新 ✓
- 世界观一键生成：502 字设定 + 4 条强制规则自动入库 ✓
- 人物团批量生成：5 位提案（主角/反派×2/配角×2）逐位 AI 生成完整档案，关系图 5 节点 ✓
- 章节生成 Agent 五阶段（记忆装配→剧情设计→文笔创作→一致性校验→记忆更新）流式输出 ✓；修复后单章 5015 字、断章钩子完整 ✓
- 数据看板逐章字数/累计折线/人物图谱 ✓；健康体检（主线进度 1%、卷级预警）✓；导出中心合规提示+EPUB 元数据 ✓
- 项目配置改每章字数 2500 → 「约 120 章」即时联动 ✓；灵感页生成灵感卡 → 「以此新建小说」带参跳转向导 ✓

### 回归验证

- 全量 vitest：112 文件全绿（含本次新增 sanitizeCharacterName 4 例）
- tsc 0 错误、next build 成功
