// ============================================================================
// 工具函数
// ============================================================================
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { nanoid } from 'nanoid';

/**
 * 合并 Tailwind class（处理冲突）
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 生成唯一 ID
 */
export function generateId(prefix = ''): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * 估算中文文本 token 数（粗略：1 字 ≈ 1.5 token）
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars / 4);
}

/**
 * 统计中文字数（小说字数计算）
 */
export function countChineseWords(text: string): number {
  if (!text) return 0;
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

/**
 * 格式化时间戳为可读字符串
 */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 文本截断（保留完整句子）
 */
export function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastPunct = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？'),
    truncated.lastIndexOf('…')
  );
  return lastPunct > maxChars * 0.8 ? truncated.slice(0, lastPunct + 1) : truncated;
}

/**
 * 安全解析 JSON（容错）
 */
export function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    // 提取 JSON 块（处理 LLM 可能包裹 ```json 的情况）
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    return JSON.parse(jsonStr.trim()) as T;
  } catch {
    return fallback;
  }
}
