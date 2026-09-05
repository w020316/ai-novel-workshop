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
