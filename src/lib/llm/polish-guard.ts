// ============================================================================
// 润色改写侦测守卫
// 职责：确保「润色 = 在原文基础上扩写完善」而非「整体改写」。
// 原理：以原文字符 bigram（相邻两字组合）为指纹，计算润色结果对原文的保留覆盖率；
//       扩写会在原文词句之后追加内容 → 覆盖率高；整体改写会更换措辞 → 覆盖率骤降。
// ============================================================================

/** 去除空白（bigram 指纹对空白不敏感，标点保留以增强区分度） */
function normalize(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * 原文保留覆盖率：原文 bigram 中出现在润色结果里的比例（0-1）。
 * 度量「原文还有多少被保留下来」：扩写（原文全保留 + 追加新内容）→ 接近 1；
 * 整体改写（更换措辞重述）→ 接近 0；与结果新增内容的长度无关。
 * - 原文过短（去空白后 < 6 字）时指纹不稳定，直接返回 1（不拦截）；
 * - 润色结果为空返回 0。
 */
export function retentionRatio(original: string, polished: string): number {
  const src = normalize(original);
  const dst = normalize(polished);
  if (src.length < 6) return 1;
  if (dst.length < 2) return 0;
  let kept = 0;
  for (let i = 0; i < src.length - 1; i++) {
    if (dst.includes(src.slice(i, i + 2))) kept++;
  }
  return kept / (src.length - 1);
}

/** 默认拦截阈值：原文指纹覆盖率低于 50% 视为整体改写 */
export const DEFAULT_REWRITE_THRESHOLD = 0.5;

/**
 * 判定润色结果是否构成「整体改写」（应被守卫拦截）：
 * - 原文过短（< 6 字）不拦截（无法可靠判定）；
 * - 覆盖率低于阈值 → 改写。
 */
export function isRewritten(
  original: string,
  polished: string,
  threshold: number = DEFAULT_REWRITE_THRESHOLD
): boolean {
  return retentionRatio(original, polished) < threshold;
}
