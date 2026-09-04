// ============================================================================
// LLM 请求消息结构校验（共享工具）
// /api/llm/chat 与 /api/llm/generate-chapter 均需校验 messages 每条消息的
// 结构与 role 白名单，避免非法内容穿透到各 provider 适配器。抽为纯函数复用
// 并便于单测。
// ============================================================================

const ALLOWED_ROLES = ['system', 'user', 'assistant'] as const;
export type ChatRole = (typeof ALLOWED_ROLES)[number];

/** 单条消息是否结构合法 */
export function isValidChatMessage(m: unknown): m is { role: ChatRole; content: string } {
  return (
    !!m &&
    typeof (m as { content?: unknown }).content === 'string' &&
    typeof (m as { role?: unknown }).role === 'string' &&
    (ALLOWED_ROLES as readonly string[]).includes((m as { role: string }).role)
  );
}

/**
 * 校验一整个 messages 数组。全部合法返回 null；
 * 任一非法返回可读错误描述（供调用方直接作为响应 error）。
 */
export function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages 必填且不能为空';
  }
  for (const m of messages) {
    if (!isValidChatMessage(m)) {
      return 'messages 中存在非法消息项';
    }
  }
  return null;
}