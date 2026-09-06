# API 文档

> 更新：2026-09-06 · 所有端点均为服务端无状态代理，不落库用户数据

## LLM

### POST `/api/llm/chat`
非流式对话代理。
```jsonc
// 请求
{ "messages": [{ "role": "system" | "user" | "assistant", "content": "..." }],
  "provider": "gemini", "model": "…", "temperature": 0.9,
  "maxTokens": 1200, "responseFormat": "json" }
// 响应
{ "content": "模型输出文本", "provider": "…", "model": "…", "usage": { … } }
```
- `responseFormat: "json"` 时提示模型仅输出 JSON；调用方需 `safeParseJSON` 并做空值防御
- 错误统一 `{ "error": "…" }` + 非 200 状态码；`LLMClientError` 可重试标记 `retryable`

### POST `/api/llm/generate-chapter`
章节流式生成（SSE）。请求体同 chat（可带 `signal` 对应的中断由客户端 abort 触发）。事件：
- `event: start` → `{ provider, model }`
- `event: token` → `{ token }`
- `event: progress` → `{ status: "retrying", attempt, error }`
- `event: done` → `{ totalTokens, provider, model }`
- `event: error` → `{ error }`

前端解析器：`src/lib/llm/client-stream.ts#streamChapter`。

### POST `/api/llm/embedding`
Embedding 代理，响应 `{ "embedding": number[] }`；失败时前端降级 TF-IDF。

### GET `/api/llm/providers`
可用供应商/模型发现（含免费模型列表），用于模型配置页。

## 业务代理

### POST `/api/rank/fetch`
网文榜单抓取代理（服务端 fetch 规避跨域），返回榜单条目列表，供 `src/lib/rank/viral.ts` 拆解成灵感卡。

### POST `/api/skills/import`
技能 JSON 批量导入，请求为技能数组，逐条校验（name/instruction 必填），返回成功/失败明细。

### POST `/api/webdav/proxy`
WebDAV 请求代理（PUT/GET/PROPFIND/MKCOL），请求头携带目标服务器与鉴权，浏览器侧仅与本代理通信。

## E2E Mock 约定

`e2e/generate-novel.spec.ts` 演示了对以上端点的 `page.route` Mock 方式（chat 按 system 关键词分支返回 SceneDesign/一致性报告，generate-chapter 返回 SSE 文本），可作为其他用例模板。
