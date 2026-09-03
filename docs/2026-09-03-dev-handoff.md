# AI 小说制作工坊 · 开发交接总文档

> 生成日期：2026-09-03。用途：给后续开发会话/新任务一个零上下文即可上手的**单一事实来源**。
> 原则：本地存储、无账号、无后端服务；所有资料、架构、功能、部署、参考链接与坑，均在此一处收拢。

---

## 1. 项目一句话

**AI 小说 / 长文本生成工具（网页应用）**：用户在**浏览器本地（Dexie/IndexedDB）**创建小说项目，AI 全流程生成设定→人物→大纲→章节，并带长篇一致性保障（三级记忆/伏笔/一致性校验/健康体检/去AI味/冷读复核/投稿合规/拆书灵感），主打「人工轻度介入 + 长篇连续性」。

- 线上地址：https://ai-novel-workshop-o25z.vercel.app
- 本地：`npm run dev`（http://localhost:3000）
- 仓库：github.com/w020316/ai-novel-workshop（默认分支 `master`）
- 部署：Vercel 项目 `ai-novel-workshop-o25z`（生产分支=master，Git 自动部署已修复）

---

## 2. 技术栈与架构

| 项 | 选型 |
|---|---|
| 框架 | Next.js 15（App Router）+ React + TypeScript |
| 存储 | Dexie / IndexedDB（本地，无需后端） |
| LLM 适配 | 统一适配层 deepseek / zhipu / qwen / openai 兼容；支持 `LLM_PROVIDER_ORDER`、`{PROVIDER}_BASE_URL`、`{PROVIDER}_DEFAULT_MODEL` 环境变量覆盖 |
| 长文本 | 三级记忆（长期/中期/短期）+ 向量/检索 + 多 Agent 编排（写作流水线） |

**功能/代码五层**（调研结论）：设定与知识层 / 大纲与规划层 / 章节生成层（SSR+流式） / 记忆与一致性层 / 审校与迭代层。

---

## 3. 核心模块地图（@路径）

| 模块 | 路径 | 说明 |
|---|---|---|
| 数据库 | `src/lib/db/schema.ts`、`seed.ts`、`queries.ts` | Dexie 表 + 题材/文风种子 + 查询 |
| LLM 适配 | `src/lib/llm/{client,adapter,providers,orchestrator}.ts`、`src/lib/llm/generators/*` | providers 表 + 适配降级 + 各生成器（character/worldview/name/chapter-title 等） |
| 一致性 | `src/lib/consistency/*`、`src/lib/agents/consistency.ts` | 一致性校验报告与修正 |
| 记忆 | `src/lib/memory/{long-term,mid-term,short-term,vector-search,tfidf}.ts` | 三级记忆 + 检索 |
| 健康体检 | `src/lib/health/health-check.ts` | 卷级 5 维度指标（主线/伏笔/人物遗忘/力量通胀/节奏厚度）+ 爽点密度 |
| 去AI味 | `src/lib/review/`（风格指纹）+ 拆文 | P1 已扩 11 类确定性规则 + spot-fix 定点修复 |
| 冷读复核 | `src/lib/review/reader-review.ts` | 0-100 读者吸引力评分，LLM 定性+本地降级 |
| 投稿合规 | `src/lib/compliance/check.ts` | 必改/需处理/提示 分级（含违禁品、外链、AI痕迹、章节规模） |
| 拆书工坊 | `src/lib/deconstruct/analyzer.ts` | 粘贴拆文：钩子/爽点/节奏/断章指标 + 灵感卡（LLM，降级本地） |
| 文风 | `src/lib/style/profile.ts`、`src/lib/db/seed.ts` | 句长/对话/ngram 指纹；5 个文风预设 |
| UI 页面 | `src/app/`：`/project/new`、`/project/[id]/{概览,workbench,settings/*,memory,health,export,config}` | 9 大题材 + 短剧爆款模板等 |

**页面导航（项目内七宫格）**：概览 / 创作工作台 / 设定工坊 / 记忆管理 / 健康体检 / 导出中心 / 项目配置。

---

## 4. 已实现功能清单（含参考视频落地项 P1–P6）

- **P1 去AI味规则库升级**（InkOS 11 条确定性规则 + oh-story 三遍去AI法；扩至 11 类 + **spot-fix 定点修复**，只修命中句）
- **P2 黄金三法则注入**：展示而非讲述 / 冲突驱动 / 悬念承上启下 → 写入章节/世界观/大纲模板；每章开头钩子、结尾断章约束
- **P3 文风仿写**：粘贴参考文本 → 统计指纹 + LLM 定性风格指南 → 注入写作链路（与去AI味互补）
- **P4 追读力看板**：健康体检增**爽点密度(Cool-point)** 指标
- **P5 拆文/拆书工坊**：粘贴参考片段 → 确定性拆解（钩子/爽点密度/节奏/断章/词频）+ LLM 建议与**拆书灵感卡**（kind: golden-three/hook/coolpoint/pacing/character/structure/other）→ 可收藏、可并入设定/大纲；LLM 失败降级本地启发式
- **P6 文档/过审应对**：用户手册补充质量保障与「AI 制造」争议应对
- **长篇不烂文 6 机制**：主线锚定 / 一致性修正循环 / 章题-大纲联动 / 卷级健康体检 / 去AI味 / 读者冷读复核
- **投稿合规体检**：必改（违禁品）/需处理（外链/Markdown残留/AI痕迹/章节规模）/提示 分级 + 优先级清单
- **章节生成 5 阶段流水线**：记忆装配 → 剧情设计 → 文笔创作 → 一致性校验 → 记忆更新
- **导出中心**：TXT / Markdown / EPUB / JSON 完整备份 + 恢复 + **导出前版权/商用合规提示**（2026-09-03 新增）
- **题材模板**：9 大题材 ×3 变体 + **都市「短剧爆款」强冲突变体**（人设反差+阶层冲突+节奏卡点，2026-09-03 新增）
- **首页空态「三步上手」新手引导**（2026-09-03 新增）

---

## 5. LLM 接入与环境变量

### 设计
- Provider 是否可用由 `Boolean(对应 API key)` 决定；`LLM_PROVIDER_ORDER` 控制顺序；`{PROVIDER}_BASE_URL`/`{PROVIDER}_DEFAULT_MODEL` 覆盖默认。
- 当前线上真正可用：**智谱 GLM（glm-4-flash，主用）+ DeepSeek 槽位走 agnes 网关（agnes-2.5-pro）**；Qwen 未配置（本地无 key）。
- 限流：`LLM_RATE_LIMIT_ENABLED=false` 时关闭（否则默认开启，可能 429）。

### 线上 Vercel 环境变量（项目 ai-novel-workshop-o25z，均为普通值，非 @secret 引用）
| 变量 | 值 |
|---|---|
| `DEEPSEEK_API_KEY` | sk-…（**注意：这是 agnes 网关 key，不是官方 deepseek**） |
| `DEEPSEEK_BASE_URL` | `https://apihub.agnes-ai.com/v1` |
| `DEEPSEEK_DEFAULT_MODEL` | `agnes-2.5-pro` |
| `ZHIPU_API_KEY` | …（智谱 key） |
| `ZHIPU_DEFAULT_MODEL` | `glm-4-flash` |
| `LLM_PROVIDER_ORDER` | `zhipu,deepseek` |
| `LLM_RATE_LIMIT_ENABLED` | `false` |

> ⚠️ 不要在 `vercel.json` 里写 `"XX_API_KEY": "@yyy"` 这种指向不存在 secret 的引用——会导致构建报错（`references Secret "yyy", which does not exist`）。当前 `vercel.json` 已无 `env` 块。

### 本地 `.env.local`
`LLM_PROVIDER_ORDER=zhipu,deepseek`；`ZHIPU_API_KEY`+`ZHIPU_DEFAULT_MODEL=glm-4-flash`；`DEEPSEEK_API_KEY`+`DEEPSEEK_BASE_URL=https://apihub.agnes-ai.com/v1`+`DEEPSEEK_DEFAULT_MODEL=agnes-2.5-pro`。

---

## 6. 数据模型（Dexie 表）

`projects / worldviews / characters / outlines / foreshadowings / chapters / chapterSummaries / plotThreads / stylePresets / genreTemplates / consistencyReports / deconstructions / inspirationCards`
（见 `src/lib/db/schema.ts`；种子见 `src/lib/db/seed.ts`）

---

## 7. 部署与集成（已全部打通）

- **Git 自动部署已修复（2026-09-03）**：Vercel GitHub App 已安装（授权全部仓库）；项目 `ai-novel-workshop-o25z` 绑定 `w020316/ai-novel-workshop`，生产分支=master。**关键修复**：旧连接是导入式建立、push webhook 没真正注册到 GitHub → 通过 Settings→Git **断开并重连**令 webhook 重新注册。现在 push master 即自动部署（实测 ~51s 变绿 READY）。
- **备用部署**：`vercel --prod --token <token>`（需 Vercel token；中文路径可在临时 ASCII junction 下部署；`--name ai-novel-workshop-o25z` 绑到现有项目复用环境变量）。token 用完即撤。
- **构建**：`npx next build`；**测试**：`npx vitest run`（当前 72 文件 / 602 用例全绿）。
- 账号/团队：Vercel `w020316s-projects`；已清理重复空项目 (`ai-novel-workshop`)，仅保留 `ai-novel-workshop-o25z`。

---

## 8. 参考资料与对标（视频/链接 → 结论，均已核验）

完整调研：`docs/research/2026-09-01-similar-projects-research.md`

| 来源 | 项目/链接 | 借鉴点 |
|---|---|---|
| 醉尘仙·开源AI小说盘点（抖音） | [InkOS](https://github.com/Narcooo/inkos) | 11 条确定性写后验证规则；spot-fix 定点修复；文风仿写 |
| 同日 | [Webnovel Writer](https://github.com/lingfengQAQ/webnovel-writer) | 追读力/Cool-point 爽点密度；情节债务/伏笔追踪；实体图谱 Dashboard（未落地，可选） |
| 同日 | [oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode) | 去AI味 ban 词表+三遍法；扫榜/拆文；4 视角审稿 |
| 同日 | [chinese-novelist-skill](https://github.com/PenglongHuang/chinese-novelist-skill) | 黄金三法则；断点续写 |
| 圣诞老人·vibecoding（抖音） | 社区帖 | 「AI 制造」争议应对 → 已进合规/文档 |
| 我不是码神·Openwrite（抖音） | [Openwrite 生态](https://www.douyin.com/video/7660190864156675391) | 扫码/粘贴拆书收集灵感 → 已落地拆书工坊 |
| 头条系调研 | [AI_NovelGenerator 头条安利](http://m.toutiao.com/group/7546391332651074098/) | 长篇连续性才是差异点（方向校验） |
| 头条系 | [4.9k Star 写长篇不掉线](http://m.toutiao.com/group/7638994523170882098/) | 同上 |
| 头条系 | [2026 长篇小说 AI 工具评测](https://blog.csdn.net/2601_95667107/article/details/162946282) | 长篇上下文断裂/人设崩坏/题材适配/商用合规四大痛点 |
| 头条系 | [短剧爆款流量公式](http://m.toutiao.com/group/7577749848871404042/) | 人设反差+阶层冲突+节奏卡点 → 已落地「短剧爆款」模板 |

---

## 9. 已知边界 / 待办 / 坑（务必先读）

- **待办（规划中，未实施）**：P5 扫榜（依赖平台实时榜单，需约定数据源，暂收敛为「粘贴拆文」）；实体图谱 Dashboard（Webnovel 特色，复杂度较高）；4 视角多平台审稿（对标番茄/起点/知乎，可与冷读合并演进）。
- **坑 1**：`vercel.json` 不要写 `@secret` 引用，除非对应 secret 真实存在。
- **坑 2**：DeepSeek 槽位走 agnes 网关，未设 `DEEPSEEK_BASE_URL`/`DEEPSEEK_DEFAULT_MODEL` 时 key 会打到官方域名而失效。
- **坑 3**：远程部署改动后记得 `npx vitest run` + `npx next build` 全绿再 push；push 即自动上线。
- **坑 4**：数据全在浏览器本地，换设备不迁移；导出 JSON 备份可恢复（恢复会新建项目）。
- **坑 5**：`LLM_RATE_LIMIT_ENABLED` 设 `false` 才关闭限流；留空/否则默认开启（可能 429）。

---

## 10. 近期提交（本地==远端，均已上线自动部署验证）

- `eee8e8d`：导出合规提示 + 都市「短剧爆款」模板 + vercel.json 去 @引用
- `0d498aa`：首页空态「三步上手」引导

后续开发：改代码 → `npx vitest run` → `npx next build` → commit → `git push origin master` 即自动部署。