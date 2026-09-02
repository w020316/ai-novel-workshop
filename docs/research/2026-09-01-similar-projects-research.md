# AI 小说 / 长文本生成开源项目调研与技术选型报告

> 调研日期：2026-09-01
> 面向项目：AI 小说制作工坊（Next.js 15 + React + TypeScript + Dexie/IndexedDB + 多模型适配 deepseek/zhipu/qwen/openai 兼容 + 向量检索/记忆 + 写作 Agent 编排）
> 说明：所有候选项目均通过 GitHub 官方仓库 / shields.io 核验真实存在，无编造。

## 一、候选项目总览

| # | 项目 | 仓库 | Star | 最后活跃 | 主语言 | 许可证 |
|---|---|---|---|---|---|---|
| 1 | AI_NovelGenerator | [YILING0013](https://github.com/YILING0013/AI_NovelGenerator) | ~5955 | 2026-08 | Python | AGPL-3.0 |
| 2 | SillyTavern | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | 33k+ | 持续维护 | Node/JS | AGPL-3.0 |
| 3 | WriteHERE | [principia-ai](https://github.com/principia-ai/WriteHERE) | ~970 | 2025-09（EMNLP'25 oral） | Python+React | MIT |
| 4 | AI-automatically-generates-novels | [wfcz10086](https://github.com/wfcz10086/AI-automatically-generates-novels) | ~922 | 2025-07（v5.2，近一年停更） | JS/HTML/Python | Apache-2.0 |
| 5 | AI_Novel | [kele-tao](https://github.com/kele-tao/AI_Novel) | ~252 | 2026-07 | Python | Apache-2.0 |

注：用户提及的 `huggingface/nanochat`、`CreativeAGI/WritingAssistant` 等经检索未验证为相关成熟项目，按"宁缺毋滥"原则剔除。

## 二、横向对比分析

| 维度 | AI_NovelGenerator | SillyTavern | WriteHERE | wfcz10086 | AI_Novel |
|---|---|---|---|---|---|
| 长文一致性记忆 | ★★★ | ★★ | ★★★ | ★★ | ★★ |
| 多 Agent / 任务编排 | ★★ 流水线 | ★ 会话式 | ★★★ 递归规划+任务图 | ★ 提示词模板 | ★ |
| 章节/大纲自动生成 | ★★★ | ★ | ★★★ | ★★★ | ★★ |
| 流式/多模型 | △ | ★★★ | ★★★ | ★★★ | ★ |
| 前端深度集成 | △ 本地GUI | ★★★ UI+插件 | ★★ React可视化 | ★★ WebUI | △ CLI |
| 向量检索/记忆 | △ | △ | ★★ | △ | △ |
| 活跃度/维护 | ★★★ | ★★★极高 | ★ 研究型 | △ 停更 | ★★ |
| 许可友好（商用） | ✗ AGPL | ✗ AGPL | ✓ MIT | ✓ Apache | ✓ Apache |

## 三、契合度结论

- **架构蓝本：WriteHERE**（MIT）——异质递归规划 + 检索/推理/写作子任务分离 + 记忆 + 缓存 + 任务图，与我方「SSR 写作 Agent 编排 + 向量记忆」同构度最高。
- **功能清单：wfcz10086**——deepseek/千问/豆包 CN 适配、专业提示词体系、右键润色、思维导图、知识库记忆，直接可移植。
- **产品对标准绳：AI_NovelGenerator**——验证「设定→大纲→目录→正文→审校→迭代」长篇小说流水线有效。注意 AGPL 传染风险，仅参考思想。
- **补充参考：SillyTavern / AI_Novel**——多模型统一接入层与轻量数据结构。

## 四、实现建议

**功能模块 5 层**：设定与知识层 / 大纲与规划层 / 章节生成层（SSR+流式）/ 记忆与一致性层 / 审校与迭代层。

**技术栈**：维持 Next.js 15 + React + TS；Dexie/IndexedDB 管理局部向量，量级上升预留 pgvector/Milvus 迁移接口；采纳 WriteHERE 缓存与任务复用控制成本。

**关键风险**：①百万字级文体一致性仍无成熟方案，需自研伏笔登记+周期摘要压缩（我方差异化投入）；②AGPL 传染，勿照搬源码；③CN 模型流式/字段差异，需 `LLMAdapter` 统一 normalizer + 超时重试；④wfcz10086/WriteHERE 维护弱，勿 fork 依赖，核心自研。

**Source**:上述 5 个 GitHub 仓库链接。

---

## 五、短视频 / 头条系生态补充调研（2026-09-01 追加）

> 背景：用户要求从抖音等短视频平台寻找相关项目/开源项目作为参考。抖音本体为封闭生态、无法直接爬取，故以**头条系 UGC 与搜索检索**为主证据源，交叉核验短视频与图文上被持续安利、具备真实影响力的项目与产品，结论如实标注口径，不臆测抖音内部数据。

### 5.1 开源项目（被字节头条系内容高频推荐）
| 项目 | 短视频/图文卖点关键词 | 与本项目契合点 |
|---|---|---|
| AI_NovelGenerator（~5.9k Star） | 一键孕育百万字、世界观→分卷→目录→正文→审校迭代、**前文摘要 / 伏笔 / 一致性** | 与一至四节结论一致：长篇连续性才是核心差异点，本项目同向 |
| 商业化工具（FeelFish / 新月写作 / 星火 / 笔灵） | 长篇上下文断裂、**人设崩坏、题材适配弱、商用合规**四大痛点 | 印证需在「人设/题材/版权合规」上做深，而非堆功能 |

### 5.2 爆款内容方法论（可迁移到题材模板与大纲节奏）
- 短视频/短剧流量公式强调 **「人设反差 + 阶层冲突 + 节奏卡点」**（草根/弃妇/赘婿 + 隐藏上流身份）。→ 本项目的**题材模板 / 大纲生成**可增补这类「强冲突、高密度卡点」预设，贴合平台创作向用户。
- 2026 年中长文作者高频诉求被归纳为：**长篇连续性、章节续写、人物/世界观/伏笔管理**（如蛙趣拼文、笔灵等主推能力），与本项目已实现的三级记忆 + 伏笔看板 + 一致性报告高度同构。

### 5.3 对本项目的可借鉴结论
1. **定位校验**：生态口径下「耳熟能详」的 AI 写小说工具，赢点都在**可控的长文连续性**而非「一句话抽卡」——本项目方向正确，应继续守住「人工轻度介入 + 记忆一致性」差异化。
2. **可补强**：新增**版权/商用合规提示**（导出时附授权与去重说明）、**强冲突题材模板**（短剧化预设）、**导出前的目录/卷分档**（成品可发布），均已有 P8 导出基础，成本低。
3. **不追热点**：生态中大量「一键爆款/矩阵变现」类工具为营销文案驱动、技术含金量低，不建议作为架构参考；仅吸收其内容方法论。

**Source**：
- [AI_NovelGenerator 头条安利（百万字小说工厂）](http://m.toutiao.com/group/7546391332651074098/)
- [4.9k Star AI 小说工具：写长篇不掉线](http://m.toutiao.com/group/7638994523170882098/)
- [2026 写长篇小说 AI 工具：FeelFish/新月写作/星火/笔灵（CSDN 评测）](https://blog.csdn.net/2601_95667107/article/details/162946282)
- [AI 写小说软件哪个好 2026（蛙趣拼文等长篇能力盘点）](http://m.toutiao.com/group/7639286847877513782/)
- [爆款短剧脚本流量公式（人设反差+阶级冲突）](http://m.toutiao.com/group/7577749848871404042/)

---

## 六、抖音视频补充调研（2026-09-02 追加）

> 依据用户提供的两条抖音视频：①「圣诞老人」——《有开源 vibecoding 作品的吗》；②「醉尘仙」——《热门开源AI小说软件盘点》。四条被点名项目均经 GitHub 仓库核验真实存在，Star/版本以核验时为准。

### 6.1 视频①（圣诞老人）：开源 vibecoding 作品被喷「AI 制造」的社区讨论

- **观点**：开源作品一经发布就可能被路人质疑「AI 制造」，作者需要具备自证能力（说明工程视角 vs 生成视角的工作量）。
- **对本项目意义**：与上一轮「去AI味」同一主题的**平台侧视角**——用户把 AI 小说投到番茄/起点/七猫等平台同样面临「AI 味过重被审」风险，去AI味 + 冷读复核的价值被二次印证，无需新增功能，但在用户手册中可补充「如何面对 AI 质疑/过审」的说明。

### 6.2 视频②（醉尘仙）：四款热门开源 AI 小说软件（已核验）

| # | 项目 | 仓库 / 规模 | 定位与亮点 | 对我方可借鉴点 |
|---|---|---|---|---|
| 1 | **InkOS**（含 Studio 界面） | [Narcooo/inkos](https://github.com/Narcooo/inkos)（~1.9k Star，MIT；Studio 为 changanchang/inkos 可视化 Web 封装） | 多智能体 CLI 流水线：Radar/Architect/Writer/Auditor/Reviser；**7 个真相文件**长期记忆（世界状态/角色矩阵/资源账本/伏笔池/章节摘要/支线板/情感弧线）；**33 维审计**；**11 条确定性写后验证规则**（禁"不是…而是…"句式/禁破折号/转折词密度/连续"了"字/长段上限等）；**spot-fix 定点修复**（非整章重写，防引入更多 AI 味）；文风仿写（style_profile.json + 风格指南）；番外隔离审稿 | ①我方一致性/健康体检与「真相文件」同向，可借鉴**11 条确定性验证规则**补强去AI味规则库；②**spot-fix 定点修复**优于当前整章重写，是低成本高收益改进；③**文风仿写**（统计指纹+定性指南）是全新差异化能力 |
| 2 | **Webnovel Writer** | [lingfengQAQ/webnovel-writer](https://github.com/lingfengQAQ/webnovel-writer)（~1k Star，GPL-3.0，Claude Code 插件） | 专攻**200 万字长篇一致性**：RAG+rerank 混合检索（auto/graph_hybrid/BM25 兜底）接外部 embedding；**追读力系统**（Hook 追踪、Cool-point 爽点密度、微兑现、情节债务表）；多模型分工（规划/写作/审查分用 Opus/Sonnet/Haiku）；可视化 Dashboard（实体图谱/章节/追读力） | ①「情节债务/伏笔追踪+超期提醒」与我方伏笔看板、健康体检同向，可补**爽点密度(Cool-point)量化指标**；②实体图谱 Dashboard 是中高复杂度但辨识度高的差异化功能；③RAG 混合检索思路可指导我方记忆组装器演进 |
| 3 | **oh-story-claudecode** | [worldwonderer/oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode)（~1.7k Star；另有 njacknot/oh-story-codex、Aradotso 等衍生） | 网文 skill 包全流程：**扫榜/拆文/写作/去AI味/封面**；文件系统式管理（设定一人一文件/世界观分目录/分卷纲+细纲/正文一章一文件/**追踪目录**管伏笔状态与时间线）；7 个 Agent 按模型分层（Opus 架构、Sonnet 角色/正文、Haiku 一致性快速扫描）；story-deslop 专用去AI味（ban 词表 + 三遍去AI法：节奏→排比密度→修饰词冗余）；story-review 4 Agent 多视角审稿（对标番茄/起点/知乎标准） | ①我方缺**扫榜/拆文**能力，「市场趋势→题材→拆解对标书」可成为新功能候选；②去AI味可用其 ban 词表思路与「三遍去AI法」补强现有规则；③「4 Agent 多视角审稿」与我方读者冷读复核可合并演进（增加平台分发标准维度） |
| 4 | **chinese-novelist-skill** | [PenglongHuang/chinese-novelist-skill](https://github.com/PenglongHuang/chinese-novelist-skill)（Claude Code skill，v2.0） | 内置写作指南让 AI 变**白金文风**：三大黄金法则（展示而非讲述/冲突驱动剧情/悬念承上启下）；三层递进式问答；**偏好记忆**；**中断续写**；自动校验 + 不合格自动重写（≤3 轮）；去 AI 痕迹细则 | ①三大黄金法则是可整体注入我方写作提示词的高性价比改进；②「每章开头即高潮、结尾留悬念」与我方钩子/断章评分一致，可同步到读者冷读复核；③断点续写（检测未完成项目/状态回证）值得纳入生成链路 |

### 6.3 由两条视频凝练的「下一任务」建议清单（按性价比排序）

1. **P1. 去AI味规则库升级**：吸收 InkOS 11 条确定性规则（禁"不是…而是…"/破折号/连续"了"字/转折词密度/长段上限）与 oh-story 三遍去AI法，扩展现有 6 类检测为 8-10 类，并新增**定点改写 spot-fix**（只修命中句，替代整章重写）。
2. **P2. 白银法则注入生成提示词**：将「展示而非讲述/冲突驱动/悬念承上启下」三条黄金法则写入章节/世界观/大纲生成模板，配合每章开头钩子、结尾断章约束。
3. **P3. 文风仿写（风格克隆）**：用户粘贴参考文本 → 提取统计指纹 + LLM 定性风格指南 → 注入写作提示词（InkOS style analyze/import 思路）。全新差异化能力，与「去AI味」天然互补。
4. **P4. 追读力看板增强**：在健康体检基础上增加**爽点密度(Cool-point)** 与**情节债务/钩子回收进度**可视化（Webnovel Writer 量纲），服务长文追读性判断。
5. **P5. 扫榜/拆文工具（方向性）**：平台榜单热度趋势 → 题材风口提醒 → 参考书拆解（黄金三章/爽点密度/节奏）。独立度最高、也最偏「选题工具」，建议作为后续大版本增量。
6. **P6. 文档补充**：用户手册增加「去AI味/冷读复核使用说明」与「如何应对 AI 制造争议/过审」提示（对应视频①）。

**Source**：
- [醉尘仙·热门开源AI小说软件盘点（抖音）](https://v.douyin.com/9r9aNmujzSY/)
- [圣诞老人·有开源vibecoding作品的吗（抖音）](https://v.douyin.com/KD3oT24bLeI/)
- [InkOS 官网仓库（Narcooo）](https://github.com/Narcooo/inkos) ｜ [InkOS Studio（changanchang）](https://github.com/changanchang/inkos)
- [Webnovel Writer（lingfengQAQ）](https://github.com/lingfengQAQ/webnovel-writer)
- [oh-story-claudecode（worldwonderer）](https://github.com/worldwonderer/oh-story-claudecode)
- [chinese-novelist-skill（PenglongHuang）](https://github.com/PenglongHuang/chinese-novelist-skill)
- [AI 网文/小说创作平台：AI-Writer、InkOS、MuMuAINovel（CSDN 评测）](https://blog.csdn.net/lonelymanontheway/article/details/159128829)
- [Claude写200万字网文不忘角色（小红薯转载，Webnovel Writer）](https://post.m.smzdm.com/p/ak8epkl8/)
- [把写网文拆成工程问题聊聊 oh-story-claudecode（aiqianji 博客）](https://aiqianji.com/blog/article/5446)