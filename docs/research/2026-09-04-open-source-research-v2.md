# 开源对标补研 + 项目完善方案（v2）

> 调研日期：2026-09-04 　面向：AI 小说制作工坊（Next.js 15 + TS + Dexie + 多模型 LLMAdapter + 记忆/渐进生成/整套生产链路）
> 方法：GitHub 全库检索（topics: creative-writing / long-form-fiction / web-novel …）+ 仓库页核验，仅收录真实存在项目。
> 目的：对照最新（2025–2026）技术方案，找出当前项目的**差异化短板**，给出可直接落地的完善方案。

---

## 一、本轮新检索到的候选项目（2025–2026）

| 项目 | 仓库 | Star | 语言/形态 | 一句话定位 |
| --- | --- | --- | --- | --- |
| oh-story-claudecode | zengstory-ai/oh-story-claudecode | 6.4k | JS/skill | 网文全流程 skill 包：**扫榜 → 拆文 → 写作 → 去AI味 → 封面** |
| human-writing | KKKKhazix/human-writing | 3.4k | 通用改稿 skill | 让 AI 中文**读起来像一个具体的人在说话**（人设化去AI味） |
| AI-Novel-Writing-Assistant | ExplosiveCoderflome | 2.7k | TS，活跃 | 长篇**整本生产引擎**：创意中枢 + 自动导演开书 + 世界上下文 + 生产主链 + 写法引擎 + RAG |
| AI-Novel-Writer | EthanYoQ | 515 | Electron | 灵感/角色/世界观/大纲/章节/审稿/修稿全流程，**Ollama + DeepSeek-Harness 本地模型** |
| novel-studio | Xiaoyangy | 98 | Go/自托管 | **多智能体世界推演 + 按「弧」规划 + RAG 长程记忆 + 逐章审核 + 断点恢复** |
| Vela | heider-x | — | Electron | AI 小说 IDE：大纲/起草/重写/审阅 + 本地 RAG + 隐私本地优先 + i18n |
| OpenNovel | Yaemikoreal | MIT | CLI | 长篇小说"操作系统"：**人类层=纯 Markdown（可 git）**，AI 做状态追踪/一致性校验/迭代精修 |
| ai-story-builder | vlsergey | Apache | Electron | 本地**节点图 pipeline**：synopsis 输入 → 成书；SQLite 本地存储 |
| Long-Novel-GPT | MaoXiaoYuZ | — | Python/Agent | LLM+RAG 长篇 Agent：**大纲-章节-正文自上而下扩写 + 检索正文更新剧情纲要** |

（既有对标 WriteHERE / wfcz10086 / AI_NovelGenerator 已在 v1 报告覆盖，不重复。）

---

## 二、与当前项目的能力对照

| 维度 | 当前项目（已具备） | 参考对象（可挖内容） |
| --- | --- | --- |
| 设定/人物/大纲/正文 | ✅ 全链路 | AI-Novel-Writing-Assistant / AI-Novel-Writer |
| 记忆/一致性/健康体检 | ✅ 三级记忆+伏笔+一致性+卷级体检 | novel-studio（弧规划）、Long-Novel-GPT（剧情纲要） |
| 批量续写/断点恢复 | ✅ | ai-story-builder（节点 DAG）、novel-studio |
| 审稿/去AI味 | ✅ reviewer + humanize | human-writing（**人设化文风**）、oh-story 拆文 |
| 榜单/避撞 | ✅ 内置+实时抓取+全书体检 | oh-story（**扫榜/拆文学习闭环**） |
| 导出 | ✅ TXT/MD/EPUB/备份 | OpenNovel（**纯 Markdown 工作区可 git**） |
| 本地优先/隐私 | ✅ 纯本地 | Vela / OpenNovel / ai-story-builder（同向强化） |
| **自动「开书」** | ⚠️ 手动选题填表 | AI-Novel-Writing-Assistant（**一句灵感→自动开书包**） |
| **弧/卷级状态机** | ⚠️ 自律健体检 | novel-studio / Long-Novel-GPT（**剧情纲要随写随更新**） |
| **拆文学习** | ⚠️ 无 | oh-story-claudecode（**扫榜+拆文结构化分析**） |
| **文风「像人」** | ⚠️ 通用去AI味 | human-writing（**人设化、具体的人**） |
| **本地/离线模型** | ❌ 无 | AI-Novel-Writer（Ollama）、ai-story-builder（本地端点） |
| **世界时间线可视化** | ❌ 无 | AI-Novel-Writing-Assistant（时间线 track） |

---

## 三、完善方案（按优先级 & 阶段）

### P1 · 差异化核心（中高价值、中等工作量）

**1. 「一句话灵感 → 自动开书」向导**（对标 AI-Novel-Writing-Assistant）
- 现状：新建项目需手动填标题/题材/简介。
- 方案：新增「灵感一句话」入口 → 调用 LLM 生成**开书包**（书名·题材·金手指·主线冲突·长线钩子·世界观种子）→ 预填或一键入项目。
- 价值：降低新手零成本起步；衔接既有「找灵感/拆书」入口。工作量中，纯前端编排 + 1 个生成器。

**2. 「剧情纲要」随写随更 + 弧级一致性**（对标 Long-Novel-GPT / novel-studio）
- 现状：记忆是"摘要+伏笔"，但无"当前剧情纲要"这种全局真值被每次生成当作锚点。
- 方案：维护一份**全书剧情纲要（ArcCaonon）**，每生成 N 章用 LLM 增量压缩更新；卷级体检与章节生成都引用它，防止百万字中段跑偏。
- 价值：对口"百万字不掉线"核心诉求。工作量中高。

**3. 「扫榜+拆文」学习闭环**（对标 oh-story-claudecode）
- 现状：榜单用于避撞，未用于"学写法"。
- 方案：把抓取的在榜热书做**拆文分析**（首章钩子/节奏节拍/爽点分布/开场模式）存入"参考库"，生成时作为"同题材借鉴方向"。
- 价值：榜单数据一石二鸟（避撞 + 学结构）。工作量中。

**4. 「人设化文风」去AI味增强**（对标 human-writing）
- 现状：humanize 是通用规则去AI味。
- 方案：文风预设绑定**叙述者人格**（如"毒舌/冷峻/烟火气"），润色与生成都按人格约束输出。
- 价值：让成书更像真人连载。工作量中。

### P2 · 工程与体验增强（低-中工作量）

**5. 本地/离线模型端点**（对标 AI-Novel-Writer / ai-story-builder）
- LLMAdapter 增加 **Ollama / OpenAI 兼容本地端点**；符合"只用免费资源"偏好，离线也能用。

**6. Markdown 工作区双向**（对标 OpenNovel）
- 导出已有 md；补"导入 md → 自动解析成章节/设定"，实现文档可 git、可外部编辑回流。

**7. 世界时间线可视化**（对标 AI-Novel-Writing-Assistant）
- 记忆管理页新增**时间线视图**（事件按卷序排列），一眼看全局事件流。

### P3 · 后续可评估
- 整本生产 DAG 可视化 + 失败节点续跑（ai-story-builder）
- 任务队列后台常驻（配合批量续写）

---

## 四、说明与取舍
- 上述项目多采用 **AGPL（oh-story）或 skill/模板形态**，仅借鉴**思路**，不搬源码（规避传染）。
- 当前项目在"设定/生成/审校/导出/避撞"上已超多数对标；差异化投入应集中在 **P1 的①开书、②剧情纲要、③拆文、④人设文风**。

---
