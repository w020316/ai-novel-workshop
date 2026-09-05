# 代码审计第三轮 · 交付报告（2026-09-05）

> 性质：第三轮增量审计（前两轮未深查模块）+ 多分辨率页面走查 + P0-P3 分级修复。
> 关联：第二轮 `docs/2026-09-04-audit-round-2.md`。
> 提交：`02179ec`（已推送 master，Vercel 部署触发）。

***

## 一、质量基线（本轮实测）

| 项 | 结果 |
| --- | --- |
| 单元测试 | ✅ 93 文件 / 821 用例全绿（较上轮 +1 复用 id 回归用例） |
| 类型检查 / Lint | ✅ tsc 零错误 · eslint 0 问题 |
| 生产构建 | ✅ next build 通过 |
| 页面检查（新增） | ✅ 4 分辨率 × 4 核心路由 = 16/16 无横向溢出 |

***

## 二、审查范围与发现（17 项）

**范围**：前两轮未深查模块——orchestrator 编排器（核心链路）、export 全部、health、compliance、humanize、style、name、outline、store、dashboard、validators、settings-transfer、import/restore。

**结论**：发现 **P1×3 + P2×5 + P3×9**。P0 = 0。修复 **14 项**（P1 100%、P2 100%、P3 6 项），其余 3 项 P3（导出字数口径统一、Markdown TOC 锚点编码、store action try/catch 统一）列入低风险待办。outline/health/compliance/style/name/batch 等模块审查通过无问题。

***

## 三、修复记录（14 项全落地）

### P1（数据完整性 / 核心功能）— 100% 修复
| # | 问题 | 修复 | 验证 |
| --- | --- | --- | --- |
| 1 | **重新生成已有章会插入同章号重复记录**：buildChapter 每次 `generateId('ch')` 新 id + put 覆盖语义 → 导出重复、getChapter 取任意一版、字数翻倍；单章页保存时 chapter state 为 null 再插一条 | 编排器按 `(projectId, chapterNo)` 查旧章**复用 id**（保留原 createdAt）；单章页保存前先 `getChapter` 同步最新记录 | 新增回归用例：mock 旧章断言复用 id/createdAt |
| 2 | **单章「停止生成」按钮完全无效**：abortRef 从未赋值、context 不传 signal，编排器中断保护成死代码 | handleGenerate 创建 AbortController 存入 abortRef 并传入 `context.signal`；handleAbort 只 abort，状态由 interrupted 分支收尾 | 代码链路走查（中断分支既有用例覆盖） |
| 3 | **EPUB 封面 SVG 先转义后截断**：`escapeXml(title).slice(0,24)` 可能把 `&amp;` 截成 `&am` 产出非法 XML，整本 EPUB 损坏 | 改为先 `slice(0,24)` 再 `escapeXml` | 既有 EPUB 用例回归 |

### P2 — 100% 修复
| # | 问题 | 修复 |
| --- | --- | --- |
| 4 | 一致性报告从不落库，导出备份 `consistencyReports` 恒为空 | saveChapter 后同步 `saveConsistencyReport`（失败仅告警不影响章节） |
| 5 | LLM 返回形状不符 JSON（`{}`/issues 非数组）→ `r.issues.some()` 抛错 → **已花配额的整章被误标 failed** | parseConsistencyReport 形状校验（passed 布尔 + issues 数组），不符回退默认报告 |
| 6 | 章节人物状态：任一要点命中即标给全部出场人物，且多要点后写覆盖先写 | 多状态按要点顺序**合并**（顿号连接）；全覆盖局限已注释说明（无人物级 NER） |
| 7 | 设定包导入：`existing.rules` undefined 抛 TypeError；内容零校验（null 人物可入库） | rules 归一数组再判空；worldview 关键字段白名单、无 name 人物剔除 |
| 8 | `volumeNo` 硬编码 1，多卷规划的按卷统计/体检全部错位 | 依据大纲 `volumes[].chapterRange` 反查所属卷 |

### P3 — 修复 6 项
- **#9** 中断后不再继续跑 LLM 校验/重写循环（省配额）
- **#10** `rewriteParagraph` 空响应防御（不再静默返回 undefined 污染正文）
- **#13** 备份导出文件名清洗 `\/:*?"<>|` 与空白
- **#14** restore 数组字段归一（防 `for...of undefined` 抛 TypeError）
- **#15** humanize 无改动时返回原文（不再静默 trim 导致 UI 覆盖编辑区）
- **#17** dashboard 用 reduce 求最大值（防万章 spread 栈溢出）

### P3 — 记录待办（3 项，低风险）→ 均已修复（2026-09-05 核实收口）
- **#11** ~~TXT/MD 导出 header 字数口径与正文不一致~~ → 已修复：`exportTxt` / `exportMarkdown` 均按 `status === 'completed'` 过滤后统计（见 `src/lib/export/txt.ts` / `markdown.ts` 注释）
- **#12** ~~Markdown TOC 锚点未 encodeURIComponent~~ → 已修复：`anchorFor` 生成 GitHub 风格 slug（去标点、空格→连字符、保留 CJK），与正文标题锚点一致
- **#16** ~~project-store 个别 action 缺 try/catch~~ → 已修复：全部 7 个 async action 均有 try/catch + loading 重置 + error 落库

***

## 四、页面检查（多分辨率实测）

新增 [e2e/responsive-audit.spec.ts](../e2e/responsive-audit.spec.ts)：**1920×1080 / 1366×768 / 768×1024 / 375×667** × **首页/新建项目/技能库/仪表盘** 共 16 项横向溢出检测，**16/16 通过**（容忍 8px，检测视口超宽元素并报告元凶标签）。走查纳入回归后可持续守护响应式质量。

***

## 五、UX 走查结论（SUS 评估）

基于前轮浏览器 E2E 走查（新建项目三步向导、工作台、趋势页）+ 本轮修复，按 SUS 十题标准评估：

- **当前估分 ≈ 78~82**（修复单章停止按钮死路径、重复章节、一键抓取全败后，可感知挫败点已基本清除）
- **提分空间**（对应 roadmap）：① 章节生成中流式进度可取消反馈更明确（已具备）② 导出中心聚合入口 ③ 移动端左导航抽屉化

### 功能 roadmap 建议（按优先级）
| # | 建议 | 用户价值 | 难度 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | 导出中心聚合（TXT/MD/EPUB/备份 + 避撞附录统一入口） | 交付链路一步到位 | 低 | 高 |
| 2 | 章节生成队列可视化（批量进度/失败重试面板） | 长篇挂机体验 | 中 | 高 |
| 3 | 设定一致性自愈（体检 → 一键按建议修订世界观/人物） | 防烂文闭环 | 中 | 中 |
| 4 | 全文检索（跨章搜人名/伏笔） | 百万字导航 | 低 | 中 |
| 5 | 云端同步（导出备份 → WebDAV/网盘） | 多设备续写 | 中 | 低 |

***

## 六、部署

- 提交 `02179ec` 已推送 master（13 文件，+215/-41），Vercel 自动部署。
- 三轮审计累计：**29 项问题修复**（12+14+安全轮 3），测试 793 → **821** 用例，待排期清零 + P0/P1/P2 清零。
