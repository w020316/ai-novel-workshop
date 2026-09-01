# AI 小说制作工坊 · 设计系统与样式规范

> 版本：1.0 | 日期：2026-09-01
> 适用：Next.js 15 + Tailwind CSS 3 + shadcn/ui 风格组件
> 主题定位：**墨韵书卷** —— 以中国传统「墨韵青 + 丹砂红」为基的文学创作工具视觉语言。

---

## 1. 设计理念与灵感来源

产品是「AI 小说创作工作台」，面向中文网文作者。视觉上应传达：**沉静、专注、书卷气、专业**，避免冷冰冰的科技感，也避免过于花哨的营销感。

设计参考方向（GitHub / Dribbble / Behance / 站酷）：
1. 中文阅读类产品（起点/晋江/微信读书）的排版秩序
2. 创作者工具（Notion / Craft / Obsidian）的组件克制与层次
3. 文学感视觉（水墨 UI 案例、书卷配色）的低饱和度色彩
4. 设计系统的实现参考：shadcn/ui、Radix UI、Tailwind UI

> 核心原则：色彩服务于「久坐创作」——高对比正文保证可读性，低饱和主色避免疲劳。

---

## 2. 色彩系统（Color Tokens）

实现位置：`tailwind.config.ts`（`theme.extend.colors`）、`globals.css`（CSS 变量）。

### 2.1 主色 Brand · 墨韵青
| Token | 色值 | 用途 |
|---|---|---|
| `brand.50` | `#f0f7f6` | 极浅底、hover 背景 |
| `brand.100` | `#daece9` | 描边、信息底 |
| `brand.300` | `#8cbfb8` | 次级元素 |
| `brand.500` | `#3d847c` | 主按钮、主色 |
| `brand.700` | `#275451` | 主按钮 hover |
| `brand.900` | `#1f393c` | 深色强调 |

使用规范：主按钮/链接/选中/焦点统一 `brand-600`（禁 `#2e6a64`）。**全站主色占比 ≤ 10%**，用于强导向操作。

### 2.2 辅助色 Accent · 丹砂红
| Token | 色值 | 用途 |
|---|---|---|
| `accent.500` | `#ef443c` | 警示、删除、关键数据 |
| `accent.600` | `#dc2626` | 危险按钮 |

规范：仅用于危险操作与需要强调的「点睛」数据（如高能章节/热度），不作大面积铺色。

### 2.3 中性色 Neutral & 语义
| 层 | 光色（默认） | 用途 |
|---|---|---|
| 背景 | `#fafaf9` | 页面底 |
| 卡片/面板 | `#ffffff` | 卡片 |
| 弱底 | `#f5f5f4` | hover / 分区 |
| 边框 | `#e7e5e4` | 分隔线、描边 |
| 主文字 | `#1c1917` | 正文 |
| 次文字 | `#57534e` | 说明 |
| 弱文字 | `#a8a29e` | placeholder |

- **成功**：`#0f9d6e` / **警告**：`#d97706` / **危险**：`#ef443c`（与 accent 5 对齐）
- 深浅色模式切换建议经由 `globals.css` 的 `:root` / `[data-theme="dark"]` 变量实现，组件使用 `bg-card text-foreground border-border` 语义类，避免硬编码色值。

---

## 3. 排版规范（Typography）

实现位置：`globals.css`（字体变量）+ Tailwind 字体族。

### 3.1 字体
| 用途 | 字体 | 变量 |
|---|---|---|
| 界面 | Inter + Noto Sans SC | `--font-sans` |
| 小说正文 | Noto Serif SC / Source Han Serif SC | `--font-serif`（`.font-novel`） |
| 等宽 | ui-monospace | `--font-mono` |

### 3.2 层级与尺度
| 元素 | 字号 | 字重 | 行高 | 说明 |
|---|---|---|---|---|
| 页面标题 H1 | `2xl` (30px) | 600 | 1.2 | 项目名/章节大标题 |
| 区块标题 H2 | `xl` (24px) | 600 | 1.3 | 设定工坊分区 |
| 卡片标题 H3 | `lg` (20px) | 500 | 1.3 | 卡片标题 |
| 正文 Body | `base` (16px) | 400 | 1.75 | 中文正文、说明 |
| 辅助 Caption | `sm` (14px) | 400 | 1.5 | 标签、次要信息 |
| 徽标 Small | `xs` (12px) | 500 | 1.4 | 徽章、角标 |

### 3.3 规范条目
- 中文正文行高 ≥ 1.75；标题 1.2~1.3。
- 数字/英文用 `font-mono` 对齐的场景（如字数统计）允许。
- 禁用过多字重（400/500/600 三档即可）。

---

## 4. 组件规范（Core Components）

> 承载于 `src/components/ui/*` 与业务组件。

### 4.1 按钮 Button
| 变体 | 样式 | 语义 |
|---|---|---|
| 主 Primary | `bg-brand-600 text-white hover:bg-brand-700` | 主操作 |
| 次 Secondary | `bg-white border hover:bg-stone-50` | 常规操作 |
| 危险 Destructive | `bg-accent-600 text-white` | 删除/危险 |
| 幽灵 Ghost | `text-stone-600 hover:bg-stone-100` | 低层级操作 |

- 触控高度 ≥ 40px；圆角 8px；联动 `disabled` 态（含 loading spinner）。
- 生成类按钮**必须有 loading 态并禁用重复点击**（已实现于世界观/章节生成，UX② 已验证）。

### 4.2 卡片 Card
- 白底 + 1px `border-stone-200` + 圆角 12px；hover 轻提升阴影。
- 用于项目卡片、设定工坊卡片、记忆条目。

### 4.3 表单 Form
- `label + input + error` 三态；聚焦时 `ring-2 ring-brand-100 border-brand-500`。
- 校验错误红字 `text-accent-600 text-sm`，与字段就近。

### 4.4 徽章 / 状态 Badge
- 章节状态以不同背景色区分（对应 `ChapterStatusBadge`）。

---

## 5. 响应式布局规则

| 断点 | 阈值 | 布局 |
|---|---|---|
| 移动 | < 640px | 单栏堆叠；工作台上下排列 |
| 平板 | ≥ 768px | 两栏（侧栏导航 + 内容） |
| 桌面 | ≥ 1024px | 三栏（列表 + 编辑区 + 辅助） |
| 宽屏 | ≥ 1280px | 内容宽度上限 `max-w-7xl` 居中 |

- 关键交互（新建、保存、生成）在移动端为全宽触控目标，避免横向滚动。
- 创作工作台在移动端改为「章节列表 / 编辑器」标签切换，替代并排三栏。

---

## 6. 可交付实现稿说明

- 由于采用 **Tailwind tokens + CSS 变量**，设计系统即「活的规范」：主题色/字体/间距直接映射 `tailwind.config.ts` 与 `globals.css`，无需额外导出 Figma/Sketch 二进制稿即可保持实现与规范一致。
- 如需视觉稿，建议基于本规范在 Figma 建立 Design Tokens（Colors/Typography/Radius）后同步至上述配置文件。
- UI 文件尚未改动（保持功能稳定），落地时按 §2~§5 更新 `globals.css`、`tailwind.config.ts` 及关键组件类名即可，不影响页面结构与逻辑。

---

## 7. 变更记录
| 版本 | 说明 |
|---|---|
| 1.0 | 初始规范，对齐现有 `brand`/`accent` tokens 与 `globals.css` |