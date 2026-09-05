# 实体图谱 Dashboard 交付说明

> 日期：2026-09-05 　commit：c7aa128（Vercel success）　对标：Webnovel Writer 实体图谱 + 情节债务/伏笔追踪（开发交接文档 §8 视频来源项）

## 一、背景
开发交接文档 §8 视频来源（醉尘仙·开源AI小说盘点）中，Webnovel Writer 借鉴点仅剩两项未落地：**实体图谱 Dashboard** 与 **情节债务/伏笔追踪**。同来源的 4 视角多平台审稿经核查已在 `src/lib/review/multi-platform-review.ts` + 审校页落地，无需重复实现。本次一并收口。

## 二、实现内容

### 1. 纯函数（src/lib/entity/graph.ts）
- `buildRelationGraph(characters)`：
  - 节点 = 全部人物；边 = 人物 `relationships`
  - 目标解析：优先 `targetId`，失效回退姓名精确匹配（trim），无匹配丢弃（不指向幽灵实体）；自环丢弃
  - 去重键 = 无序人物对 + 关系名（A→B 与 B→A 同名关系视为同一条边）
  - 返回孤立人物 id（未建关系），UI 提示补充
- `layoutCircular(nodes, w, h)`：确定性环形布局——按角色优先级（主角→配角→反派→路人）+ 姓名排序，从顶部顺时针均分；无随机，同输入恒同输出
- `buildPlotDebt(foreshadowings, currentChapterNo)`：情节债务
  - overdue：planted/pending 且计划回收章 < 当前章号（携带超期章数）
  - upcoming：未到期有排期（按计划章号升序）；unscheduled：无排期
  - recovered/abandoned 计入统计；openCount = 未回收总数

### 2. 组件（src/components/dashboard/EntityGraphCard.tsx）
- 纯 SVG 人物关系网络（640×340）：节点按角色配色（主角=墨绿 / 反派=朱砂 / 配角=烟墨 / 路人=浅灰），主角节点更大；关系边连线 + 关系名标签；`<title>` 悬浮提示
- 剧情线 chips：主线/支线 + 状态（进行中/已收束/已废弃）+ 涉及章节悬浮
- 情节债务红榜：超期伏笔列表（前 8 条，含「超 N 章」徽标、铺设章、计划回收章），无超期显示健康绿勾；近期待回收摘要
- 三类数据全空时整卡自动隐藏

### 3. 看板页接入
- `load()` 并行拉取人物/剧情线/伏笔（各自 `.catch(() => [])` 容错），当前章号取 max(chapterNo)
- 卡片置于「累计字数折线图」之后

## 三、测试与验证
- 新增 `graph.test.ts` 10 用例：targetId/姓名回退解析、去重、自环丢弃、幽灵目标、孤立人物、布局确定性与单节点不除零、债务分类/超期章数/升序/空输入
- 全量：**109 文件 / 980 用例全绿**；tsc 0 错误；`next build` 通过；Vercel production 部署 success
