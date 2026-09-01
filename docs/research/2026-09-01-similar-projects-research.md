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