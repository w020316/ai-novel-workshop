# 架构文档

> 更新：2026-09-06

## 总体架构

纯浏览器端（client-heavy）单页应用，数据与密钥均不落服务器：小说数据存 IndexedDB，LLM Key 存本地，服务端仅做无状态代理。

```
浏览器（Next.js 15 App Router / React 19）
├── 页面层  src/app/**               项目/设定/工作台/记忆/导出/灵感
├── 组件层  src/components/**        业务组件 + ui/（shadcn 风格基件）
├── 智能体  src/lib/agents/**        编排器 orchestrator：剧情设计 → 文笔创作 → 一致性校验（含修正闭环、多候选抽卡、批量生成）
├── 记忆    src/lib/memory/**        三级记忆装配 assembler（Token 预算压缩）、向量检索（transformers.js 懒加载，TF-IDF 降级）、更新器
├── LLM     src/lib/llm/**           client（chat/JSON 模式）、client-stream（SSE）、providers、retry/fallback、各 generators（世界观/人设/大纲/开书包/卷名/章题…）
├── 技能库  src/lib/skills/**        内置方法论技能 + 用户自建，按生成环节注入 prompt
├── 扫榜    src/lib/rank/**          榜单抓取 + 出圈拆解（viral）成灵感卡
├── 数据    src/lib/db/**            Dexie（IndexedDB）：projects/worldview/characters/outline/chapters/summaries/foreshadowings/consistencyReports…
├── 状态    src/lib/store/**         Zustand：项目/短期记忆/生成状态
└── 导出    src/lib/export/**        TXT/Markdown/EPUB/JSON 备份、WebDAV 同步
```

## 服务端 API（无状态代理）

全部位于 `src/app/api/**`，仅转发请求与 CORS 代理，不存储用户数据：

| 端点 | 职责 |
|---|---|
| `POST /api/llm/chat` | LLM 对话代理（支持 JSON 响应模式），Key 从请求头/环境变量读取 |
| `POST /api/llm/generate-chapter` | 章节流式生成（SSE：start/token/progress/done/error） |
| `POST /api/llm/embedding` | Embedding 代理（向量检索用） |
| `GET /api/llm/providers` | 可用模型/供应商发现（含免费模型） |
| `POST /api/rank/fetch` | 网文榜单抓取代理（扫榜） |
| `POST /api/skills/import` | 技能 JSON 批量导入 |
| `POST /api/webdav/proxy` | WebDAV 同步代理（规避浏览器跨域） |

## 核心流程（单章生成）

1. **记忆装配**：长期（设定/大纲/伏笔，含主线锚点）+ 中期（相关摘要/支线检索）+ 短期（前情），超预算按层压缩
2. **剧情设计**：LLM 产出 SceneDesign JSON（场景/冲突/爽点/伏笔/出场人物），解析失败回退默认
3. **章题生成**：LLM 生成，失败回退「第 N 章」
4. **文笔创作**：流式生成，支持 1-3 候选抽卡、技能注入、文风/叙述者人格/原创性规避
5. **一致性校验**：报告落库；不通过且可自动修正时进入重写闭环
6. **记忆更新 + 落库**：摘要/伏笔状态更新，章节与报告写回 IndexedDB

## 防烂文机制

主线锚点强制注入（章节 prompt 级）· 卷规划核心冲突 · 剧情纲要 ArcCanon · 一致性校验与自愈 · 文风漂移告警 · 章题-大纲联动。

详见 `docs/specs/2026-08-04-ai-novel-workshop-design.md` 与 `docs/2026-09-03-delivery-report.md`。
