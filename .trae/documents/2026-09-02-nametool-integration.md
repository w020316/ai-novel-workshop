# 起名工具落地（Q2）实现计划

## Context（背景与目标）

依据《2026-09-01-similar-projects-research.md》对 OpenWrite/openxz.cn 的调研，「起名工具」（按题材/风格批量生成人名/地名/功法/门派/兵器/法宝）是低成本、网文作者高频、且我方尚未落地的候选（调研编号 Q2）。

本轮「整合所有资源·完善项目」将落地该功能。Q4（上下文预算压缩）经确认已在 `src/lib/memory/assembler.ts` 实现（`DEFAULT_TOKEN_BUDGET` / `compressMemory`），Q3 抽卡模式经用户确认本轮不做。

目标：新增一个「设定工坊」下的「起名工具」页签，沿用项目既定「LLM 主生成 + 模板兜底」模式，生成的姓名可一键收藏为灵感卡，反哺大纲/设定生成。全程本地 IndexedDB 存储，无新增依赖。

## 设计概览

- **数据模型**：不新建表。收藏的姓名复用现有 `inspirationCards` 表（`kind: 'other'`，title=姓名，content=`[类别] 含义`），沿用 `saveInspirationCards` / `listInspirationCards` 已存在函数。

- **生成模式**：完全复用世界观/人物生成器的 `chat()` + `safeParseJSON` + 本地模板兜底模式（见下文代表实现路径）。

- **UI 复用**：镜像 `CharacterGenerator.tsx` 的 Card + Input/Select/Button + loading/toast 模式。

## 新增文件

1. **`src/lib/llm/generators/name-generator.ts`** — 核心生成器

   - 导出 `generateNamesWithLLM(input: NameLLMInput): Promise<NameIdea[]>`

   - `NameLLMInput = { projectId: string; category: NameCategory; topic: string; genre?: Genre; count: number }`

   - `NameCategory = 'person' | 'place' | 'skill' | 'sect' | 'weapon' | 'treasure'`（人名/地名/功法/门派/兵器/法宝）

   - `NameIdea = { id: string; name: string; meaning: string }`（`id` 用 `generateId('name')`）

   - 内部：构造 system 提示词（要求输出 JSON 数组 `[{name, meaning}]`）→ 调 `chat(messages, { responseFormat:'json', temperature:0.9, maxTokens: 1000 })` → `safeParseJSON` 清洗为 `NameIdea[]` 并 `slice(0, count)`；任一环节失败/非法 → 返回 `[]`（不抛错），由调用方回退模板。

   - `count` 上限 10，下限 1（防过量 LLM 消耗）。

2. **`src/lib/name/template.ts`** — 本地模板兜底

   - 导出 `generateNameTemplate(input: NameLLMInput): NameIdea[]`

   - 确定性：各 `NameCategory` 内置字根池 + topic 关键词合成，产出 `count` 条 `NameIdea`，保证离线/无配额时仍可用。

   - 格式对齐 `NameIdea`。

3. **`src/components/settings/NameGenerator.tsx`** — 起名工具 UI（镜像 CharacterGenerator）

   - 输入：类别 select（6 类标签）、主题/题材关键词 Input、数量（1-10）、可选题材。

   - 运行：调 `generateNamesWithLLM`，返回空则回退 `generateNameTemplate`（toast 提示「LLM 暂不可用，已用模板」）。

   - 结果：展示 `NameIdea` 列表，每条含「复制」与「收藏为灵感卡」按钮；收藏走 `saveInspirationCards([...])`（`kind:'other'`），成功后 toast。

   - loading 禁用、错误 toast，与 CharacterGenerator 一致。

4. **`src/app/project/[id]/settings/name/page.tsx`** — 路由页

   - `'use client'`，`useParams` 取 projectId，渲染 `<NameGenerator projectId={projectId} />`。

## 修改文件

1. **`src/app/project/[id]/settings/layout.tsx`** — 设定工坊页签

   - 在 `SETTINGS_TABS` 末尾新增 `{ slug: 'name', label: '起名工具', icon: UserRoundSearch, desc: '人名地名 · 功法门派 · 招式法宝' }`。

   - 从 `lucide-react` 补充导入 `UserRoundSearch`。

## 复用清单（勿重复造轮子）

- `chat` / `LLMClientError`：`src/lib/llm/client.ts`

- `safeParseJSON` / `generateId`：`src/lib/utils.ts`

- `saveInspirationCards` / `listInspirationCards`：`src/lib/db/queries.ts`

- `InspirationCard` 类型：`src/types/index.ts`

- UI 基元 `Card/CardContent/CardHeader/CardTitle/CardDescription`、`Button`、`Input/Label`：`src/components/ui/*`

- 生成器「LLM 主生成 + 模板兜底 + 核心字段判空抛错」范式：`src/lib/llm/generators/character.ts`

- 工具组件运行流程范式：`src/components/settings/CharacterGenerator.tsx`

## 测试

- 新增 **`src/lib/name/template.test.ts`**：验证各类别模板兜底产出条数与格式（count 生效、字段非空）。

- 新增 **`src/lib/llm/generators/name-generator.test.ts`**：mock `chat` 返回合法/非法/抛错三种情况，断言 LLM 清洗、count 截断、失败回退 `[]`。

- 跑全量 `npm run test`，预期全部通过（当前 576 个用例保持绿色 + 新增用例）。

## 验证（端到端）

1. `npm run build` 成功（含 /project/\[id]/settings/name 路由与类型校验）。
2. dev server（job-5dd4b24ba68542d99bf36ff60bc8f053）上浏览器打开 `/project/{id}/settings/name`：

   - 起名工具页签可见、页面加载正常。

   - 选择类别「人名」+ 主题关键词 → 点生成 → 出现姓名列表（LLM 或有模板提示）。

   - 点「收藏为灵感卡」→ toast 成功，切到「拆书工坊」页签可见已收藏灵感卡。

   - 窄屏下按钮/结果不被截断。
3. `npm run test` 全绿。

## 交付

- 完成实现后：`git add` 相关文件 → `git commit`（如 `feat(name): 起名工具上线——按题材批量生成人名/地名/功法/门派/兵器/法宝并可收藏为灵感卡`）。

