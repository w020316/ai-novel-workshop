# WebDAV 云同步 · 交付说明

日期：2026-09-05
范围：导出中心 → 服务端代理 → 用户自建 WebDAV 网盘

## 一、背景

路线图最后一项：多设备数据同步。项目数据存 IndexedDB（仅本机），换设备/浏览器丢失；本地 JSON 备份需手动拷贝。接入用户自有 WebDAV 网盘（坚果云/群晖/Nextcloud 等，均免费额度）实现云备份与异地容灾。

## 二、方案

### 1. 客户端库（src/lib/sync/webdav.ts）

- 零依赖：WebDAV 本质是 HTTP 动词（PUT / PROPFIND / GET / DELETE），原生 fetch 实现；
- 纯函数可测：`buildWebdavPath`（斜杠规范化）、`backupFilename`（与本地下载命名一致）、`parsePropfind`（正则解析 multistatus XML，容忍 D:/d:/无前缀命名空间，跳过目录、解码 href、按时间排序）；
- 配置仅存本机 localStorage（`webdav_sync_config`），不上传不落库。

### 2. 服务端代理（src/app/api/webdav/proxy/route.ts）

浏览器直连 WebDAV 普遍被 CORS 拦截，统一走同源代理。安全与 /api/skills/import 同标准：

| 防线 | 措施 |
| --- | --- |
| 协议 | 仅允许 https（Basic Auth 凭据不明文过公网） |
| 静态校验 | 复用 checkUrlTarget：拒绝内网主机名 / IP 字面量 / 非 http(s) |
| DNS 校验 | lookup all，拒绝解析到内网/本地/保留段（含 IPv6） |
| 重定向 | manual 逐跳重校验，最多 3 跳 |
| 包体 | 请求/响应均限 64MB |
| 错误映射 | 401→凭据错误、404→目录/文件不存在，均有用户可读提示 |

### 3. UI（导出中心 · 云同步卡片）

- 配置：服务器地址 / 账号 / 应用密码（坚果云须用应用密码）/ 远端目录，可保存/清除；
- 操作：上传备份到云端、刷新云端列表；
- 列表：文件名 + 修改时间 + 大小，支持恢复（复用 restoreBackup，不覆盖现有项目）与删除（带确认）；
- 备份组装抽取 `collectBackup` 与本地 JSON 下载共用，含 Float32Array 序列化/复原。

## 三、验证

- webdav.test.ts 10/10 通过（路径/命名/PROPFIND 解析/容错）；
- 全量回归 97 文件 / 857 用例全绿；`tsc --noEmit` 零错误；`npm run build` 通过；
- 部署：Vercel（commit 记录见 git log）。

## 四、涉及文件

| 文件 | 变更 |
| --- | --- |
| src/lib/sync/webdav.ts | 新增：客户端同步库 |
| src/app/api/webdav/proxy/route.ts | 新增：SSRF 防护代理 |
| src/app/project/[id]/export/page.tsx | 云同步卡片 + collectBackup 抽取 |
| src/lib/sync/webdav.test.ts | 新增：10 用例 |

## 五、已知边界

- 上传的是「整项目快照」而非增量同步（恢复语义为新建项目不覆盖，安全优先）；
- 章节生成中断网不影响本地写作，恢复联网后可再上传最新快照。
