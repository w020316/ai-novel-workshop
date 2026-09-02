// ============================================================================
// 起名工具生成器（真实 LLM）
// 依据：spec 设定工坊 / 调研 Q2（OpenWrite 起名工具）
// 职责：调用兼容层 chat 接口，按类别/主题/题材批量生成贴合网文审美的名字。
// 降级：LLM 失败或返回非法结构时返回空数组，由调用方回退本地模板（lib/name/template.ts）。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { generateId, safeParseJSON } from '@/lib/utils';
import { NAME_CATEGORY_LABEL } from '@/lib/name/template';
import type { NameIdea, NameLLMInput } from '@/types';

/** LLM 返回的最小结构（包装为对象以便 safeParseJSON 解析） */
interface RawNamePayload {
  names?: Array<{ name?: string; meaning?: string }>;
}

const SYSTEM_PROMPT = `你是一位资深网络小说创作与命名师，擅长为不同题材创作贴切、有记忆点、符合网文审美的名字（人名/地名/功法/门派/兵器/法宝）。
要求：
1. 名字贴合给定类别与题材风格，避免俗套与撞名。
2. 每个名字附一句简洁的"含义/气质/来历"（20-50字），解释其意蕴。
3. 必须严格输出 JSON 对象（不要输出 JSON 以外的解释）：
{"names":[{"name":"名字","meaning":"含义/气质/来历"}]}`;

/**
 * 调用真实 LLM 批量生成名字。
 * @returns 清洗后的名字列表；LLM 不可用或输出非法时返回空数组，供上层回退模板。
 */
export async function generateNamesWithLLM(input: NameLLMInput): Promise<NameIdea[]> {
  const count = Math.min(10, Math.max(1, Math.round(input.count) || 1));

  const userPrompt = `类别：${NAME_CATEGORY_LABEL[input.category]}
主题/关键词：${input.topic.trim() || '（请自行发挥）'}
题材：${input.genre || '不限'}
数量：${count}

请输出 ${count} 个贴合类别的名字。`;

  let raw: NameIdea[] = [];
  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.9, maxTokens: 1000 }
    );
    const payload = safeParseJSON<RawNamePayload>(result.content, {});
    raw = (payload?.names ?? []).map((n) => ({
      id: generateId('name'),
      name: n?.name?.trim() ?? '',
      meaning: n?.meaning?.trim() ?? '',
    }));
  } catch {
    raw = [];
  }

  // 清洗：剔除空名字，限制数量，保证结构一致
  return raw
    .filter((n) => n.name.length > 0 && n.meaning.length > 0)
    .slice(0, count);
}