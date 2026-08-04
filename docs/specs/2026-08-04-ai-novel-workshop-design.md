# AI 小说制作工坊（ai-novel-workshop）设计文档

> **文档状态**：待评审
> **创建日期**：2026-08-04
> **作者**：产品经理 + AI 协作
> **项目目录**：`d:\xm\wz\ai小说制作`

---

## 0. 文档说明

本 spec 是项目进入编码开发前的最终设计文档，覆盖：调研结论 → 技术选型 → 架构设计 → 功能模块 → 数据模型 → 多智能体 → LLM 适配 → 错误处理 → 性能 → 测试策略。

经评审通过后，将转入 writing-plans 制定详细实施计划。

---

## 1. 项目背景与定位

### 1.1 核心定位

**AI 全流程高质量小说生成器，人工仅轻度介入**。

不同于"短篇流畅、长篇崩盘"的传统 AI 写作工具，本项目从底层架构上解决百万字长篇的"人设不崩塌、世界观不矛盾、剧情不跑偏、伏笔有回收、文风高度统一"五大核心痛点。

### 1.2 目标用户

- 个人网文创作者 / 小说爱好者
- 单用户本地优先工具（无多租户、无账号体系）
- 期望零成本部署（免费 LLM API + 免费托管）

### 1.3 非目标（YAGNI 裁剪）

以下功能**不在 V1 范围**，避免过度设计：

| 砍掉的功能 | 理由 |
|-----------|------|
| 多用户/账号系统 | 个人自用工具，无需 |
| 在线协作 | 单用户，无需 |
| 付费/订阅 | 个人工具，无需 |
| 移动端原生 App | Web 响应式已足够 |
| 模型微调训练 | 过重，用 Few-shot 替代 |
| 多语言 i18n | 仅中文用户 |
| 评论/社交 | 非创作工具职责 |
| 实时统计仪表盘 | 个人用，基础统计即可 |

V1 聚焦：**设定 → 大纲 → 章节 → 导出** 主流程闭环。

---

## 2. GitHub 开源项目调研结论

### 2.1 候选项目对比

| # | 项目 | 仓库 | Stars | 活跃度 | 核心定位 |
|---|------|------|-------|--------|----------|
| 1 | **AI_NovelGenerator** | `Novel-AI/AI_NovelGenerator` | ~4.9k | 活跃 | 全流程长篇小说自动生成 |
| 2 | RecurrentGPT | `aiwaves-cn/RecurrentGPT` | 中等 | 停滞 | LSTM 思想的交互式长文本生成 |
| 3 | AI-Writer | `BlinkDL/AI-Writer` | 中等 | 偏旧 | RWKV-LM 网文生成 |
| 4 | LongWriter | `THUDM/LongWriter` | 高 | 活跃 | 模型级长文本生成 |
| 5 | novelWriter | `vkbo/novelWriter` | ~1.9k | 活跃 | 纯文本小说编辑器（非 AI） |

### 2.2 详细对比矩阵

| 维度 | AI_NovelGenerator | RecurrentGPT | AI-Writer | LongWriter | novelWriter |
|------|-------------------|-------------|-----------|------------|-------------|
| 语言 | Python后端+Web前端 | Python | Python | Python | Python (PyQt5) |
| UI | Web+Gradio | Gradio | CLI/简单UI | 无 | 桌面 GUI |
| LLM 适配 | 云端+本地（GPT/Claude/豆包/DeepSeek/Qwen/Llama） | 仅 OpenAI | RWKV 本地 | GLM-4 系列 | 无 |
| 长文本一致性 | 三级分层记忆 | LSTM式长短记忆 | 无 | 单次长输出 | 无 |
| 多智能体 | 5个专职Agent | 单模型循环 | 单模型 | 单模型 | 无 |
| 创作流程 | 6步全流程 | 单步循环 | 单次 | 单次 | 手动 |
| 伏笔/角色管理 | 专门Agent+档案库 | 无 | 无 | 无 | 手动 |
| 文风定制 | Few-shot学习 | 无 | 无 | 无 | 无 |
| 人工干预 | 全流程实时 | 可选 | 弱 | 无 | 全手动 |
| 部署 | 本地优先+云端可选 | 本地 | 本地 | 本地 | 本地 |
| 导出 | TXT/EPUB/Word/PDF | TXT | TXT | 无 | 多格式 |
| License | MIT | GPL-3.0 | Apache | Apache | GPL-3.0 |

### 2.3 调研结论

1. **AI_NovelGenerator 是核心参考蓝本**：其"三级记忆 + 多智能体 + 全流程干预"架构几乎完美契合本项目定位。
2. **RecurrentGPT 的记忆理论**作为记忆模块的学术支撑。
3. **LongWriter** 可作为底层模型选项（智谱 GLM 系免费额度）。
4. **novelWriter** 的项目管理 UX 可作为人工编辑界面参考。
5. **技术栈差异是关键决策点**：AI_NovelGenerator 是 Python，本项目采用 Next.js 全栈 TS，需"借鉴架构思想 + 用 TS 重新实现"。

---

## 3. 总体架构与技术栈选型

### 3.1 选定方案：Next.js 15 全栈单应用

**选型理由**：
1. 契合"个人自用工具"定位（单用户场景，部署简单优先）
2. 完全契合技术栈偏好（Next.js 15 + React 19 + TS + Tailwind）
3. 免费额度全闭合（Vercel + DeepSeek/智谱免费 API + IndexedDB = 零成本）
4. 数据隐私最强（数据不离机，未发布稿件零泄露）
5. 维护演进友好（单仓库 + 单技术栈）

### 3.2 总体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    浏览器（用户侧）                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js 15 App Router（React 19 + TS + Tailwind）    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐    │   │
│  │  │ 创作工作台    │  │ 设定管理     │  │ 导出中心  │    │   │
│  │  │ /workbench   │  │ /settings    │  │ /export  │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────┘    │   │
│  │                  Server Actions / API Routes          │   │
│  │  ┌────────────────────────────────────────────────┐   │   │
│  │  │  业务编排层（Generation Orchestrator）          │   │   │
│  │  │  - 创作流程编排 - 记忆调度 - Agent 协调          │   │   │
│  │  └────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  存储层（全部本地浏览器，数据不离机）                │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────┐   │   │
│  │  │ IndexedDB  │  │ 短期上下文  │  │ 向量索引       │   │   │
│  │  │ 小说/设定/ │  │ 内存窗口    │  │ (transformers   │   │   │
│  │  │ 章节归档    │  │ (运行时)    │  │  .js 浏览器内)  │   │   │
│  │  └────────────┘  └────────────┘  └────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ 仅 LLM 调用走网络
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    云端（API 中转）                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js API Routes（服务端，Vercel 部署）             │   │
│  │  - 代理 LLM 请求（隐藏 API Key）                       │   │
│  │  - 多模型路由（DeepSeek / 智谱 / 通义）               │   │
│  │  - 限流 / 重试 / 降级                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│            ┌─────────────┼─────────────┐                     │
│            ▼             ▼             ▼                     │
│      DeepSeek API   智谱 GLM API   通义 Qwen API             │
│      (免费额度)     (免费额度)      (免费额度)                │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 技术栈选型

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 框架 | Next.js | 15.x | App Router + Server Actions，全栈一体 |
| UI 库 | React | 19.x | 并发特性 + Server Components |
| 语言 | TypeScript | 5.x | 类型安全，重构友好 |
| 样式 | Tailwind CSS | 3.x | 契合偏好，响应式快速 |
| 动效 | Framer Motion | 11.x | 创作流程过渡、生成动画 |
| 组件 | shadcn/ui | latest | 高质量基础组件，可定制 |
| 状态管理 | Zustand | 4.x | 轻量，避免 Redux 样板代码 |
| 表单 | React Hook Form + zod | latest | 设定录入、校验 |
| 本地存储 | Dexie.js (IndexedDB) | 4.x | 封装 IndexedDB，链式查询 |
| 向量检索 | transformers.js | 3.x | 浏览器内运行 Embedding |
| LLM SDK | AI SDK (Vercel) | 4.x | 统一多模型接口，流式输出 |
| 通知 | sonner | latest | 通知反馈 |
| 粒子背景 | tsParticles | latest | 创作氛围感 |
| 测试 | Vitest + Testing Library | latest | 单元 + 集成测试 |
| E2E | Playwright | latest | 关键用户流程 |
| 代码规范 | ESLint + Prettier | latest | 代码质量 |
| 部署 | Vercel | 免费层 | 一键部署，零成本 |

### 3.4 关键设计决策

**决策 1：数据全部存浏览器本地（IndexedDB）**
- 理由：隐私 100% 安全；零存储成本；离线可读
- 代价：换设备需导出/导入（JSON 备份解决）

**决策 2：LLM 调用走服务端代理**
- 理由：避免前端暴露 API Key；统一多模型路由；服务端可做限流/重试/降级

**决策 3：向量检索用 transformers.js 浏览器内运行**
- 模型：`Xenova/all-MiniLM-L6-v2`（23MB，384维）
- 理由：数据不离机；首次加载后缓存

**决策 4：多智能体简化为 3 个核心 Agent**
- 剧情设计 / 文笔创作 / 一致性校验
- 理由：5 个 Agent 对个人工具过重，3 个已覆盖核心质量保障

### 3.5 目录结构

```
ai-novel-workshop/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (workspace)/        # 创作工作区
│   │   ├── api/                # API Routes（LLM代理）
│   │   └── layout.tsx
│   ├── components/             # UI组件
│   ├── lib/
│   │   ├── agents/             # 3个智能体
│   │   ├── memory/             # 三级记忆体系
│   │   ├── llm/                # LLM适配层
│   │   ├── store/              # Zustand状态
│   │   └── db/                 # Dexie数据库
│   ├── types/                  # TypeScript类型
│   └── styles/
├── public/
├── docs/                       # 设计文档
└── package.json
```

---

## 4. 功能模块划分

### 4.1 功能模块总览

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 小说制作工坊                            │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  M1 项目 │  M2 设定 │  M3 创作 │  M4 记忆 │  M5 导出与备份   │
│  管理    │  工坊    │  工作台  │  管理器  │  中心            │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

### 4.2 M1 · 项目管理

| 功能 | 描述 |
|------|------|
| 新建项目 | 填写：小说名/题材/目标字数/一句话简介/文风预设 |
| 项目列表 | 卡片式展示，显示进度（已写字数/章节数） |
| 项目配置 | 编辑信息、切换 LLM 模型、调整生成参数 |
| 归档/删除 | 完结归档，废弃软删除（可恢复） |

### 4.3 M2 · 设定工坊

| 子模块 | 功能 | 输入 | 输出 |
|--------|------|------|------|
| 世界观架构 | 世界规则、势力、地理、时代背景 | 一句话描述或手动填写 | 结构化设定库 |
| 人物档案库 | 外貌/性格/口头禅/成长线/关系 | 核心人设关键词 | 完整人物档案 |
| 文风配置 | 叙事人称/节奏/描写详略/口语化程度 | 预设选择或样本上传 | 文风 profile |
| 题材模板库 | 20+ 题材的节奏规律/爽点设计参考 | 题材选择 | 节奏参数 |

关键设计：
- 设定可"锁定"（lock），锁定后生成内容强制校验
- 支持中途修改，修改后自动同步全量记忆库
- 文风支持上传 3-5 章样本做 Few-shot 学习

### 4.4 M3 · 创作工作台（核心）

#### 创作流程（6 步标准 Pipeline）

```
步骤1      步骤2      步骤3      步骤4      步骤5      步骤6
世界观    人物档案   全本大纲   分章拆解   章节正文   完结排版
生成  ──► 生成  ──► 生成  ──► 生成  ──► 生成  ──► 导出
 │          │          │          │          │
 ▼          ▼          ▼          ▼          ▼
[可编辑]  [可编辑]   [可编辑]   [可编辑]   [可重写]
```

每步支持三种模式：
- **AI 全自动**：一键生成，用户仅审阅
- **半自动**：AI 生成草稿 → 用户修改 → 确认
- **手动**：用户自写，AI 仅校验一致性

#### 章节生成子流程（最核心）

```
用户点击"生成第N章"
        │
        ▼
1. 加载上下文记忆（长期+中期+短期）
        │
        ▼
2. 剧情设计 Agent → 输出场景设计/冲突/爽点/伏笔
        │
        ▼
3. 文笔创作 Agent（流式输出） → 章节正文 2000-3000字
        │
        ▼
4. 一致性校验 Agent → 校验报告
        │
        ├─ 通过 ─► 归档+更新记忆库 ─► 完成
        │
        └─ 不通过 ─► 自动重写问题段落 ─► 回到步骤4（最多2次）
```

#### 人工干预能力

| 干预点 | 能力 |
|--------|------|
| 生成前 | 修改本章剧情要点、指定出场人物、禁用某伏笔 |
| 生成中 | 流式输出时暂停、终止生成 |
| 生成后 | 重写全章 / 重写指定段落 / 调整文风 / 补充细节 |
| 参数 | 实时调整温度/Top-P |

### 4.5 M4 · 记忆管理器

| 功能 | 描述 |
|------|------|
| 记忆库浏览 | 查看长期/中期/短期记忆内容 |
| 伏笔看板 | 可视化展示：已铺设/待回收/已回收 状态 |
| 一致性报告 | 查看每章校验结果，标注潜在矛盾 |
| 记忆手动修正 | 用户可手动编辑记忆条目 |

### 4.6 M5 · 导出与备份中心

| 功能 | 描述 |
|------|------|
| TXT 导出 | 纯文本，含目录 |
| Markdown 导出 | 带 YAML front matter |
| EPUB 导出 | 电子书格式，含封面/目录 |
| JSON 备份 | 完整项目数据，用于换设备迁移 |
| JSON 导入 | 从备份文件恢复项目 |

### 4.7 页面路由结构

```
/                           首页（项目列表）
/project/new                新建项目
/project/[id]               项目仪表盘
/project/[id]/settings      设定工坊
  ├── worldview             世界观
  ├── characters            人物
  ├── style                 文风
  └── genre                 题材模板
/project/[id]/workbench     创作工作台
  ├── outline               大纲
  ├── chapters              章节列表
  └── chapter/[n]           单章编辑
/project/[id]/memory        记忆管理
  ├── foreshadowing         伏笔看板
  └── consistency           一致性报告
/project/[id]/export        导出中心
/settings                   全局设置
```

### 4.8 核心用户场景

**场景 1：从零开始创作新小说**
1. 新建项目 → 填写信息 → 选择文风
2. 设定工坊：AI 生成世界观/人物档案 → 用户编辑确认
3. 创作工作台：生成大纲 → 分章 → 逐章生成
4. 导出 EPUB

**场景 2：续写已有小说**
1. 选择未完结项目 → 自动加载记忆库
2. 点击"继续生成下一章" → 自动装配上下文
3. 可修改剧情要点后生成

**场景 3：人工干预修改**
1. 选择某章 → "重写指定段落"
2. 选中段落 → 输入修改要求
3. AI 仅重写选中段落，保持连贯
4. 一致性校验自动运行

---

## 5. 三级记忆体系与数据模型

### 5.1 三级记忆总览

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 长期记忆库    │  │ 中期记忆库    │  │ 短期记忆窗口  │
│ (Long-term)  │  │ (Mid-term)   │  │ (Short-term) │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ IndexedDB     │  │ IndexedDB    │  │ 运行时内存    │
│ 结构化存储    │  │ 向量索引     │  │ 直接组装     │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ 世界观设定    │  │ 本卷剧情脉络 │  │ 前3章摘要     │
│ 人物档案库    │  │ 已出场人物   │  │ 当前章节上下文│
│ 全本大纲      │  │ 相关伏笔线索 │  │ 本章剧情要点  │
│ 核心伏笔池    │  │ (向量检索)   │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┴─────────────────┘
                         │
                         ▼
              ┌────────────────────────┐
              │  Prompt 组装器         │
              │  （控制 token 预算）    │
              └────────────────────────┘
                         │
                         ▼
                  LLM 上下文窗口
```

### 5.2 长期记忆库

**存储位置**：IndexedDB（结构化表）

| 表 | 存储内容 | 读取时机 |
|----|----------|----------|
| `worldview` | 世界架构、势力、地理、时代、力量体系 | 每次生成 |
| `characters` | 人物档案 | 每次生成 |
| `outline` | 全本大纲：分卷、核心剧情节点、爽点分布 | 每次生成 |
| `foreshadowing_pool` | 全本伏笔池 | 每次生成 |

特点：数据量小（几十KB~几百KB）；始终全量加载到 prompt；修改时同步更新并标记受影响章节。

### 5.3 中期记忆库

**存储位置**：IndexedDB + transformers.js 向量索引

| 表 | 存储内容 | 检索方式 |
|----|----------|----------|
| `chapter_summaries` | 每章 200 字摘要 | 按卷 + 语义检索 |
| `character_states` | 人物当前状态 | 按 character_id 查询 |
| `plot_threads` | 支线剧情进展 | 按主线ID + 语义检索 |
| `foreshadowing_instances` | 已铺设伏笔实例 | 按状态过滤 |

**向量检索流程**：
1. 取本章剧情要点关键词
2. transformers.js 对关键词做 Embedding
3. 在 chapter_summaries 向量索引中检索 Top-K=5 相关章节
4. 在 plot_threads 中检索相关支线
5. 在 foreshadowing_instances 中检索待回收伏笔
6. 组装为中期记忆块（控制 token）

**模型**：`Xenova/all-MiniLM-L6-v2`（23MB，384维）

### 5.4 短期记忆窗口

**存储位置**：运行时内存（Zustand Store），不持久化

```
短期记忆 = {
  prevChapters: [前3章摘要+关键事件],
  currentChapter: {
    plotPoints: 剧情要点,
    sceneDesign: 场景设计,
    draft: 正在生成的正文
  },
  recentCharacterInteractions: 最近人物互动
}
```

### 5.5 完整数据模型

```typescript
// ============ 项目 ============
interface NovelProject {
  id: string;
  title: string;
  genre: Genre;
  summary: string;
  targetWords: number;
  stylePresetId: string;
  llmConfig: LLMConfig;
  status: ProjectStatus;
  currentVolume: number;
  currentChapter: number;
  createdAt: number;
  updatedAt: number;
}

type Genre = '玄幻' | '言情' | '悬疑' | '科幻' | '都市' | '历史' | '末世' | '游戏' | '宫斗' | '其他';
type ProjectStatus = 'drafting' | 'ongoing' | 'completed' | 'archived';

interface LLMConfig {
  provider: 'deepseek' | 'zhipu' | 'qwen';
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

// ============ 设定层（长期记忆） ============
interface Worldview {
  id: string;
  projectId: string;
  worldStructure: string;
  powerSystem: string;
  geography: string;
  era: string;
  factions: string;
  rules: string[];
  locked: boolean;
  updatedAt: number;
}

interface Character {
  id: string;
  projectId: string;
  name: string;
  role: 'protagonist' | 'supporting' | 'antagonist' | 'minor';
  appearance: string;
  personality: string;
  catchphrase: string;
  background: string;
  motivation: string;
  weakness: string;
  growthArc: string;
  relationships: CharacterRelation[];
  speechStyle: string;
  behaviorPattern: string;
  locked: boolean;
  updatedAt: number;
}

interface CharacterRelation {
  targetId: string;
  targetName: string;
  relation: string;
}

interface Outline {
  id: string;
  projectId: string;
  volumes: Volume[];
  mainPlotline: string;
  climaxNodes: string[];
  ending: string;
  updatedAt: number;
}

interface Volume {
  volumeNo: number;
  title: string;
  summary: string;
  chapterRange: [number, number];
  coreConflict: string;
}

interface Foreshadowing {
  id: string;
  projectId: string;
  description: string;
  setupChapter: number;
  importance: 'low' | 'medium' | 'high';
  plannedRecoveryChapter?: number;
  actualRecoveryChapter?: number;
  status: 'planted' | 'pending' | 'recovered' | 'abandoned';
  relatedCharacters: string[];
  relatedPlotThread?: string;
  createdAt: number;
}

// ============ 创作层 ============
interface Chapter {
  id: string;
  projectId: string;
  volumeNo: number;
  chapterNo: number;
  title: string;
  plotPoints: string[];
  sceneDesign?: SceneDesign;
  content: string;
  wordCount: number;
  status: 'pending' | 'designing' | 'drafting' | 'reviewing' | 'completed' | 'rewriting';
  consistencyReport?: ConsistencyReport;
  needsRecheck?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SceneDesign {
  setting: string;
  conflict: string;
  highlight: string;
  foreshadowingToPlant: string[];
  foreshadowingToRecover: string[];
  characterAppearances: string[];
}

interface ConsistencyReport {
  chapterId: string;
  passed: boolean;
  issues: ConsistencyIssue[];
  checkedAt: number;
}

interface ConsistencyIssue {
  type: 'character' | 'worldview' | 'plot' | 'foreshadowing' | 'style';
  severity: 'warning' | 'error';
  description: string;
  suggestion: string;
  paragraphIndex?: number;
}

// ============ 中期记忆（向量索引） ============
interface ChapterSummary {
  id: string;
  projectId: string;
  chapterId: string;
  chapterNo: number;
  volumeNo: number;
  summary: string;
  keyEvents: string[];
  characterStates: Record<string, string>;
  embedding: Float32Array;
  createdAt: number;
}

interface PlotThread {
  id: string;
  projectId: string;
  name: string;
  type: 'main' | 'subplot';
  description: string;
  status: 'active' | 'resolved' | 'abandoned';
  relatedChapters: number[];
  embedding: Float32Array;
  updatedAt: number;
}

// ============ 文风与模板 ============
interface StylePreset {
  id: string;
  name: string;
  narrativePerspective: 'first' | 'third-limited' | 'third-omniscient';
  pacing: 'fast' | 'medium' | 'slow';
  descriptionDensity: 'sparse' | 'medium' | 'detailed';
  dialogueRatio: number;
  sampleText?: string;
  vocabularyProfile?: {
    avgSentenceLength: number;
    commonPhrases: string[];
  };
}

interface GenreTemplate {
  id: string;
  genre: Genre;
  pacingRule: string;
  highlightDesign: string;
  readerPreference: string;
  typicalArcs: string[];
}
```

### 5.6 Dexie 数据库定义

```typescript
// src/lib/db/schema.ts
import Dexie, { Table } from 'dexie';

class NovelDB extends Dexie {
  projects!: Table<NovelProject, string>;
  worldviews!: Table<Worldview, string>;
  characters!: Table<Character, string>;
  outlines!: Table<Outline, string>;
  foreshadowings!: Table<Foreshadowing, string>;
  chapters!: Table<Chapter, string>;
  chapterSummaries!: Table<ChapterSummary, string>;
  plotThreads!: Table<PlotThread, string>;
  stylePresets!: Table<StylePreset, string>;
  genreTemplates!: Table<GenreTemplate, string>;
  consistencyReports!: Table<ConsistencyReport, string>;

  constructor() {
    super('ai_novel_workshop');
    this.version(1).stores({
      projects: 'id, title, status, updatedAt',
      worldviews: 'id, projectId, locked',
      characters: 'id, projectId, name, role',
      outlines: 'id, projectId',
      foreshadowings: 'id, projectId, status, setupChapter',
      chapters: 'id, projectId, [volumeNo+chapterNo], status',
      chapterSummaries: 'id, projectId, chapterNo, volumeNo',
      plotThreads: 'id, projectId, status',
      stylePresets: 'id, name',
      genreTemplates: 'id, genre',
      consistencyReports: 'chapterId'
    });
  }
}

export const db = new NovelDB();
```

### 5.7 Token 预算管理

以 32K 窗口为例：

```
总预算（32K）:
├── 系统提示词       ~500 tokens
├── 长期记忆        ~3000 tokens
│   ├── 世界观摘要   ~800
│   ├── 人物档案     ~1500（仅核心人物）
│   ├── 大纲要点     ~500
│   └── 待回收伏笔   ~200
├── 中期记忆        ~2000 tokens
│   ├── 相关章节摘要 ~1200（Top5 × 200字）
│   ├── 活跃支线     ~500
│   └── 待回收伏笔   ~300
├── 短期记忆        ~1500 tokens
│   ├── 前3章摘要    ~900
│   └── 本章要点     ~600
├── 任务指令        ~500 tokens
├── 生成预留        ~24000 tokens
```

压缩策略：
- 人物档案：仅加载本章出场人物 + 主角
- 章节摘要：固定 200 字
- 大纲：仅加载当前卷 + 全书高潮节点

### 5.8 记忆更新流程

每章生成完成后自动触发：
1. 生成章节摘要 → chapterSummaries
2. 生成摘要向量 → 更新 embedding
3. 更新人物状态 → characterStates
4. 识别新伏笔 → foreshadowings (status: planted)
5. 标记已回收伏笔 → foreshadowings (status: recovered)
6. 更新支线进展 → plotThreads
7. 章节归档 → chapters (status: completed)

### 5.9 设定修改时的记忆同步

```
用户修改设定
    │
    ├─► 1. 更新 IndexedDB
    ├─► 2. 标记受影响章节（needsRecheck: true）
    └─► 3. 提示用户："以下章节可能受影响，是否重新校验？"
         ├─ 是 → 批量重跑一致性校验
         └─ 否 → 标记待处理
```

---

## 6. 多智能体协作与 LLM 适配层

### 6.1 多智能体架构

```
┌────────────────────────────────────────────────────────────┐
│                  Generation Orchestrator                    │
│                  （创作流程编排器）                          │
│  - 流程调度 - 记忆装配 - Token预算 - 重试控制                 │
└─────────────┬──────────────────────────────────────────────┘
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
┌──────┐  ┌──────┐  ┌──────┐
│ 剧情  │  │ 文笔  │  │ 一致性│
│ 设计  │  │ 创作  │  │ 校验  │
│ Agent │  │ Agent │  │ Agent │
└───┬──┘  └───┬──┘  └───┬──┘
    │         │         │
    └─────────┴─────────┘
              │
              ▼
        LLM 适配层
   (Vercel AI SDK)
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
DeepSeek   智谱GLM    通义Qwen
```

### 6.2 三个 Agent 职责

| Agent | 职责 | 温度 | 输出格式 |
|-------|------|------|---------|
| 剧情设计 | 拆解章节要点、设计场景/冲突/爽点/伏笔 | 0.7 | JSON |
| 文笔创作 | 生成章节正文 2000-3000 字 | 0.85 | 纯文本（流式） |
| 一致性校验 | 核对人设/世界观/伏笔/前后文逻辑 | 0.2 | JSON |

### 6.3 编排器时序

```
用户点击"生成第N章"
    │
    ▼
[Orchestrator] 装配记忆
    │
    ▼
[剧情设计 Agent] ──► SceneDesign (JSON)
    │
    ▼
[文笔创作 Agent] ──► 流式推送 token 到前端
    │
    ▼
[一致性校验 Agent] ──► ConsistencyReport
    │
    ├─ 通过 ──► 更新记忆库 ──► 完成
    │
    └─ 不通过 ──► [文笔创作 Agent.rewrite] ──► 回到校验（最多2次）
```

### 6.4 LLM 适配层

**接口定义**：
```typescript
export interface LLMAdapter {
  chat(params: ChatParams): Promise<ChatResponse>;
  streamChat(params: StreamChatParams): Promise<void>;
  embedding(text: string): Promise<Float32Array>;
}
```

**多模型支持**：
| Provider | BaseURL | 推荐模型 | 上下文窗口 |
|----------|---------|---------|-----------|
| DeepSeek | `https://api.deepseek.com/v1` | deepseek-chat | 32K |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | glm-4-flash (免费) | 128K |
| 通义 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-turbo / qwen-plus | 8K / 32K |

**服务端代理**：API Key 存 `process.env`，前端调用 `/api/llm/chat`，服务端转发。

### 6.5 关键设计权衡

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Agent 数量 | 3 个 | 砍掉世界观管控（合并到一致性校验）、伏笔管理（用伏笔看板模块替代） |
| 通信方式 | 编排器调度 | 简化流程，避免 Agent 间死循环 |
| 重试次数 | 最多 2 次 | 防止无限重写消耗 token |
| 温度策略 | 0.7 / 0.85 / 0.2 | 创造性 vs 严谨性平衡 |
| 输出格式 | 剧情设计+校验用JSON，写作用纯文本 | 结构化便于解析，文本便于阅读 |

---

## 7. 错误处理、性能与测试策略

### 7.1 错误处理矩阵

| 错误类型 | 场景 | 处理策略 | 用户感知 |
|---------|------|---------|---------|
| LLM API 错误 | 429/500/超时 | 指数退避重试 3 次 → 切换备用模型 → 提示 | toast + 重试按钮 |
| JSON 解析失败 | Agent 返回非合法 JSON | 修复式重试 1 次 → 降级文本解析 | 静默重试 |
| 一致性校验不通过 | 人设/世界观矛盾 | 自动重写最多 2 次 → 标注问题交付 | 黄色警告 + 问题列表 |
| Token 超限 | 装配记忆超窗口 | 自动压缩记忆 → 重试 | 静默处理 |
| IndexedDB 错误 | 配额超限 | 提示导出备份 → 清理 | 红色警告 |
| 向量模型加载失败 | transformers.js 失败 | 降级为 TF-IDF 关键词检索 | 静默降级 |
| 用户中断 | 生成中点停止 | AbortController 终止，保留已生成部分 | 已生成保留 |
| 浏览器崩溃 | 页面崩溃 | IndexedDB 事务保证不丢；草稿存 sessionStorage | 重启恢复提示 |

**模型降级链**：
```typescript
const MODEL_FALLBACK_CHAIN = {
  deepseek: ['deepseek-chat', 'glm-4-flash', 'qwen-turbo'],
  zhipu: ['glm-4-flash', 'deepseek-chat', 'qwen-turbo'],
  qwen: ['qwen-turbo', 'deepseek-chat', 'glm-4-flash']
};
```

### 7.2 性能指标（个人工具目标值）

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 首页加载（FCP） | < 1.5s | Lighthouse |
| 项目列表加载 | < 200ms | IndexedDB 查询 |
| 章节列表加载 | < 300ms | 索引查询 |
| 记忆装配耗时 | < 2s | 含向量检索 |
| 单章生成首 token | < 3s | LLM 流式首字节 |
| 单章生成总耗时 | < 60s | 2000-3000 字 |
| 向量检索 Top-5 | < 500ms | 浏览器内 |
| 单章导出 TXT | < 1s | 本地生成 |

### 7.3 性能优化手段

1. **IndexedDB 索引优化**：复合索引 `[projectId+volumeNo+chapterNo]` 加速排序查询
2. **向量检索优化**：预计算并缓存 Embedding；只检索当前卷候选集
3. **transformers.js 懒加载**：首次需要时才加载 23MB 模型
4. **流式生成 + 渐进渲染**：requestAnimationFrame 批量更新 token 到 UI
5. **Next.js 层面**：Server Components 首屏、动态 import 重型组件、loading.tsx
6. **数据分页**：章节列表分页加载，避免百万字项目一次加载

### 7.4 测试策略

#### 测试金字塔

```
            ┌───────────┐
            │   E2E     │  ← 5%  关键用户流程
            ├───────────┤
            │ 集成测试   │  ← 25% 模块间协作
            ├───────────┤
            │ 单元测试   │  ← 70% 核心逻辑
            └───────────┘
```

#### 单元测试覆盖范围（目标覆盖率 80%+）

| 模块 | 关键测试用例 | 数量 |
|------|------------|------|
| `lib/memory/assembler` | 三级记忆装配、Token 预算、空数据处理 | 12 |
| `lib/memory/vector-search` | Top-K 检索、空索引、降级检索 | 8 |
| `lib/agents/plot-design` | Prompt 构建、JSON 解析、异常输入 | 10 |
| `lib/agents/writing` | 流式回调、文风应用、重写逻辑 | 12 |
| `lib/agents/consistency` | 问题识别、报告结构、severity 判断 | 10 |
| `lib/agents/orchestrator` | 流程编排、重试控制、降级切换 | 8 |
| `lib/llm/adapter` | 多 provider 路由、流式处理、错误重试 | 10 |
| `lib/llm/retry` | 指数退避、最大重试次数、shouldRetry | 6 |
| `lib/db/queries` | CRUD、索引查询、事务 | 15 |
| `lib/export/*` | TXT/MD/EPUB/JSON 格式 | 8 |
| `lib/style/profile` | 文风样本解析、特征提取 | 5 |
| `lib/foreshadowing` | 伏笔状态机、回收时机 | 6 |
| 工具函数 | token 估算、文本压缩、时间格式化 | 10 |

#### 集成测试

| 测试场景 | 验证点 |
|---------|--------|
| 章节生成完整流程 | Orchestrator 调度 3 个 Agent 全流程 |
| 设定修改同步 | 修改人物后受影响章节被标记 |
| 模型降级 | 主模型失败后切换备用 |
| 流式中断 | 用户中断后已生成部分保留 |
| 数据备份恢复 | 导出 → 删除 → 导入 → 完整 |

#### E2E 测试（Playwright）

覆盖完整创作流程：新建项目 → 设定世界观 → 生成第1章 → 导出。

#### Mock 策略

LLM 调用全部 mock，根据系统提示词返回模拟响应，避免消耗 API 额度。

### 7.5 可观测性

- 开发环境日志（分级 INFO/WARN/ERROR）
- 生成耗时埋点（关键节点记录到 IndexedDB）
- 性能分析报告（前端可查看历史生成耗时）

### 7.6 关键风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| LLM 输出不稳定 | 高 | 中 | 一致性校验 + 重试机制兜底 |
| 百万字 IndexedDB 查询变慢 | 中 | 中 | 分页 + 索引优化 + 卷级隔离 |
| 浏览器内存不足 | 中 | 高 | 向量模型懒加载 + 定期清理短期记忆 |
| 免费 API 额度耗尽 | 中 | 高 | 多 provider 路由 + 限流提示 |
| 用户误删项目 | 低 | 高 | 软删除 + 回收站 + 自动备份提醒 |
| API Key 泄露 | 低 | 高 | Key 仅存服务端环境变量 |
| JSON 解析失败 | 高 | 低 | 修复式重试 + 文本降级解析 |

---

## 8. 开发阶段划分与里程碑

### 8.1 开发阶段

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **P0 基础设施** | 项目脚手架、Dexie 数据库、类型定义、UI 框架 | 可运行的空壳应用 |
| **P1 项目管理** | M1 项目 CRUD、列表页、配置 | 可创建/管理项目 |
| **P2 设定工坊** | M2 世界观/人物/文风/题材 模块 | 可录入设定 |
| **P3 LLM 适配** | 适配层、服务端代理、流式输出 | 可调用 LLM |
| **P4 三级记忆** | 记忆装配器、向量检索、Token 预算 | 记忆体系可用 |
| **P5 多智能体** | 3 个 Agent、编排器、一致性校验 | 章节生成核心 |
| **P6 创作工作台** | M3 大纲/分章/章节编辑/干预 | 完整创作流程 |
| **P7 记忆管理** | M4 伏笔看板、一致性报告 | 记忆可视化 |
| **P8 导出备份** | M5 TXT/MD/EPUB/JSON | 可导出成品 |
| **P9 测试优化** | 单元/集成/E2E 测试、性能优化 | 80%+ 覆盖率 |
| **P10 部署交付** | Vercel 部署、文档、用户手册 | 可访问产品 |

### 8.2 里程碑

- **M1（P0-P2 完成）**：可录入设定的空壳应用
- **M2（P3-P5 完成）**：可生成单章（核心能力验证）
- **M3（P6-P8 完成）**：完整创作流程闭环
- **M4（P9-P10 完成）**：可交付的产品

---

## 9. 待确认事项

本 spec 已完成自审，无 TBD/TODO/占位符，内部一致，无矛盾。以下事项请用户审阅确认：

1. 整体架构（Next.js 全栈单应用）是否符合预期
2. 三级记忆体系 + transformers.js 浏览器内向量检索方案
3. 3 个 Agent 的简化（非 AI_NovelGenerator 的 5 个）
4. 数据全部本地 IndexedDB 的存储策略
5. 测试覆盖率 80% 目标
6. 开发阶段划分是否合理

确认后转入 writing-plans 制定详细实施计划。

---

**END OF SPEC**
