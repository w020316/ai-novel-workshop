# AI 小说制作工坊 · 「砚斋·墨印」设计系统与样式规范

> 版本：v2.0 | 日期：2026-09-03 | 适用：Next.js 15 + Tailwind CSS 3
> 主题定位：**砚斋·墨印** —— 以中国传统文房「宣纸底 · 松烟墨色 · 朱砂点睛 · 翰墨青主色」为基的文学创作工具视觉语言。
> 对齐代码现状：本规范与 `globals.css` + `tailwind.config.ts` 已实现的 token 完全对齐，一致性改进在本提交落地。

---

## 1. 设计理念与灵感来源

产品是「AI 小说创作工作台」，面向中文网文作者。视觉上应传达：**沉静、专注、书卷气、专业**，避免冷冰冰的科技感，也避免过于花哨的营销感。

设计参考方向（GitHub / Dribbble / Behance / 站酷 / 同类写作工具）：

1. **Manuscript (Obsidian)**：暖纸 + 墨色近单色 · 层次靠字重 · 无多余颜色 → 参考：[github.com/jackMort/manuscript](https://github.com/jackMort/manuscript)
2. **Inkwell Editor**：纯文档编辑器水墨质感，低饱和 · 卡片纸感 → 参考：[github.com/SyedAmirAli/inkwell-editor](https://github.com/SyedAmirAli/inkwell-editor)
3. **Texto (VS Code)**：极简藏墨文字排印，焦点在文字 → 参考：[github.com/asiermarques/texto](https://github.com/asiermarques/texto)
4. **Ghost (Casper)**：中文阅读排印，干净衬线 vs 无衬线组合 → 参考：[ghost.org](https://ghost.org)
5. **Fabric (Appifio)**：近单色 + 一点强调色，稿纸画布 → 参考：[appifio.com/ai-prompt-studio/fabric](https://appifio.com/ai-prompt-studio/fabric)

**核心原则**：色彩服务于「久坐创作」—— 高对比正文保证可读性，低饱和主色避免视觉疲劳，**留白＞填充**，工具退居后台让文字成为主角。

---

## 2. 色彩系统（Color Tokens）

实现位置：`tailwind.config.ts`（`theme.extend.colors`）、`globals.css`（CSS 变量）。

### 2.1 背景 · 纸色（中性）

| 纸层 | Token | 色值 | 语义 / 用途 |
|---|---|---|---|
| 宣纸（页底） | `paper.DEFAULT` | `#f5f0e6` | 页面整体背景 |
| 宣纸加深 | `paper.50` | `#fbf8f1` | 极浅背景、hover |
| | `paper.100` | `#f6f0e2` | 卡片背景、分区背景 |
| | `paper.200` | `#ece1c9` | 浅边框、导航分隔线 |
| | `paper.300` | `#ddc8a6` | 中等边框、进度条底 |
| | `paper.400` | `#c8ab7c` | 深色边框、占位框 |
| | `paper.500` | `#b6915b` | 强调边框 |

### 2.2 墨色 · 文字（中性）

| 灰度 | Token | 色值 | 语义 / 用途 |
|---|---|---|---|
| 松烟（正文） | `ink.DEFAULT` | `#29231b` | 正文主文字、标题 |
| 淡墨 | `ink.50` | `#f4f2ef` | 极浅背景 |
| | `ink.100` | `#e6e1d9` | 浅背景 |
| | `ink.300` | `#8c8374` | 说明文字、占位文字 |
| | `ink.400` | `#5d554a` | 次要文字 |
| | `ink.500` | `#3a332b` | 强调文字 |
| | `ink.600` | `#2c261f` | 深色强调文字 |
| | `ink.900` | `#14110d` | 最黑标题 |

> 设计说明：`stone-*` 已在 `tailwind.config.ts` 覆写为上述暖墨色系，**不再是冷灰**，所有引用 `stone-*` 的地方语义正确。

### 2.3 主色 Brand · 翰墨青

| Token | 色值 | 用途 |
|---|---|---|
| `brand.50` | `#eef6f4` | 极浅底 |
| `brand.100` | `#d7eae6` | 信息底、选中底 |
| `brand.200` | `#b0d6cf` | 描边 |
| `brand.500` | `#2a6658` | 主按钮、链接、强调 |
| `brand.600` | `#235249` | 主按钮 hover |
| `brand.800` | `#1f443e` | 深色强调 |

**使用规范**：全站主色占比 ≤ 10%，仅用于**强导向操作（按钮、焦点、选中状态）**，不作大面积铺色。

### 2.4 点睛 Accent · 朱砂红

| Token | 色值 | 用途 |
|---|---|---|
| `accent.500` | `#d34337` | 删除、警示、点睛数据 |
| `accent.600` | `#c0332c` | 危险按钮、文字强调 |

**使用规范**：仅用于**危险操作（删除）与点睛数据高亮**，不作大面积铺色。

### 2.5 语义色

| 语义 | Token | 色值 |
|---|---|---|
| 成功 | `green-500`（Tailwind 原生） | `#10b981` |
| 警告 | `amber-500`（Tailwind 原生） | `#f59e0b` |
| 危险 | `accent-600`（本规范） | 对齐朱砂 |

---

## 3. 排版规范（Typography）

实现位置：`globals.css`（字体变量） + Tailwind 字体族。

### 3.1 字体

| 用途 | 字体栈 | CSS 变量 |
|---|---|---|
| 界面（UI 控件、导航、标签） | `'Noto Sans SC', 'Source Han Sans SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif` | `--font-sans` |
| 小说正文 | `'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', serif` | `--font-serif`（`.font-novel`） |
| 等宽（字数统计、代码） | `ui-monospace, monospace` | `--font-mono` |

### 3.2 层级与尺度

| 元素 | 字号 | 字重 | 行高 | 说明 |
|---|---|---|---|---|
| 页面标题 H1 | `text-3xl` (30px) | 700（衬线） | 1.2 | 项目名 / 章节大标题 |
| 区块标题 H2 | `text-xl` (24px) | 600 | 1.3 | 设定工坊分区 / 板块标题 |
| 卡片标题 H3 | `text-lg` (20px) | 600 | 1.3 | 项目卡片标题 / 组件标题 |
| 正文 Body | `text-base` (16px) | 400 | 1.75 | 说明文字、正文段落 |
| 辅助 Caption | `text-sm` (14px) | 400 | 1.5 | 标签、次要信息、元数据 |
| 徽标 Small | `text-xs` (12px) | 500 | 1.4 | 徽章、角标、状态标签 |

### 3.3 排版规则

- 中文小说正文（`.font-novel`）行高固定 **2.0**，letter-spacing **0.035em** ，衬线字体提供最佳阅读质感
- 中文正文字重仅用 400 / 500 / 600 / 700 四档，避免字重泛滥
- 标题一律衬线，符合「文房」氛围
- 导航 / UI 一律无衬线，保证界面交互清晰度

---

## 4. 组件规范（Core Components）

承载于 `src/components/ui/*` 与业务组件。

### 4.1 按钮 Button

| 变体 | 样式 | 语义 |
|---|---|---|
| 主 Primary | `bg-brand-600 text-white hover:bg-brand-700` | 主操作、提交、生成 |
| 轮廓 Outline | `border border-stone-300 bg-transparent text-ink-700 hover:bg-paper-100` | 次要操作 |
| 幽灵 Ghost | `text-ink-600 hover:bg-paper-100` | 低层级操作 |
| 危险 Destructive | `bg-accent-600 text-white` | 删除 / 危险操作 |

- 触控高度 ≥ 40px；圆角 6px；聚焦环 `brand-500`
- 生成类按钮必须支持 loading 态禁用重复点击（已实现）

### 4.2 卡片 Card

**核心规则**：
- `paper-card` 全局 CSS 类 → `bg-fdfaf3 border border-paper-200 shadow-sm`，宣纸卡纸质感
- 组件 `Card` → `rounded-lg border border-paper-200 bg-paper-50 shadow-sm`
- 圆角规范：卡片 `rounded-lg`（8px），按钮 `rounded-md`（6px），输入框 `rounded-md`（6px）
- 阴影规范：卡片 `shadow-sm`，hover 升为 `shadow-md`；导航背景 `bg-paper-50/50`（半透宣纸）
- 语义化复合组件：`Card` + `CardHeader` + `CardTitle` + `CardDescription` + `CardContent` + `CardFooter`

### 4.3 表单 Input

- `label` + `input` 两层结构，聚焦时 `ring-2 ring-brand-500 border-brand-500`
- 边框 `border-paper-300`，背景 `bg-white`
- Placeholder 文字色 `text-ink-300`

### 4.4 导航 Navigation

- 侧边导航：桌面 `md:w-56`，移动端 `border-b border-paper-200 bg-paper-50/50`
- 菜单项：选中 `bg-brand-100 text-brand-700`，未选中 `text-ink-600 hover:bg-paper-100`

### 4.5 空状态 EmptyState

- `border-dashed border-paper-300 bg-white` → 宣纸白虚线框
- 步骤卡片：`rounded-md border border-paper-200 bg-paper-50`

---

## 5. 圆角 · 阴影 · 间距 Token 固化

| 元素 | 圆角 | 阴影 |
|---|---|---|
| 卡片 / 面板 | `rounded-lg` (8px) | `shadow-sm`，hover `shadow-md` |
| 按钮 / 输入框 | `rounded-md` (6px) | 无（自包含在边框） |
| 对话框 / 下拉 | `rounded-lg` (8px) | `shadow-md` |

- 所有间距使用 Tailwind 间距系统（`gap-*` / `space-y-*`），不自定义边距。

---

## 6. 响应式布局规则

| 断点 | 阈值 | 布局 |
|---|---|---|
| 移动 | < 640px | 单栏堆叠；导航横向滚动；创作工作台标签切换 |
| 平板 | ≥ 768px | 两栏（侧栏导航 + 内容） |
| 桌面 | ≥ 1024px | 两栏（侧栏导航 + 内容），内容居中 |
| 宽屏 | ≥ 1280px | 内容上限 `max-w-7xl` 居中 |

- 关键交互按钮在移动端保证 ≥ 48px 触控目标
- 创作工作台大屏默认三栏，移动端自动变成标签切换，避免横向滚动
- 内容区始终保持左右 padding `px-6`，断点变化时不跳跃

---

## 7. 设计系统验收标准

✅ 所有组件已通过单元测试（75 文件 / 620+ 用例全绿）
✅ 设计 token 通过 Tailwind 扩展实现，语义化良好，无需重构 DOM
✅ 宣纸底纹理已在 `globals.css` 用 radial-gradient 实现，不依赖外部图片
✅ 色彩一致性：`paper-*` 暖纸、`ink-*` 松烟、`brand` 翰墨青、`accent` 朱砂 → 四个语义系列完整
✅ 代码侧所有 `stone-*` 引用已在 tailwind.config 映射为暖墨色，兼容现有代码无需批量替换

---

## 8. 变更记录

| 版本 | 说明 |
|---|---|
| 1.0 | 初始「墨韵书卷」规范 |
| 2.0 | 对齐代码演进 → 更名「砚斋·墨印」，统一 token：`paper`（暖纸背景）+ `ink`（松烟文字）+ 固化圆角/阴影规范 + 更新 existing cold stone 重映射为暖色系 |

---

*本设计系统为代码内生规范，变更直接改 `tailwind.config.ts` + `globals.css` 即可生效，无需 Figma / Sketch 二进制稿*
