// ============================================================================
// 章节标题生成器（真实 LLM）
// 依据：计划「章节标题+大纲联动」
// 职责：基于剧情要点、场景设计与当前卷定位，生成简短、有吸引力的章节标题。
// 降级：LLM 不可用或标题不合规时回退为「第 N 章」，绝不阻塞章节生成。
// ============================================================================
import type { SceneDesign } from '@/types';
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';

export interface ChapterTitleInput {
  chapterNo: number;
  plotPoints: string[];
  sceneDesign: SceneDesign;
  /** 当前卷标题（可选，用于提升标题的归属性） */
  volumeTitle?: string;
}

const SYSTEM_PROMPT = `你是一位网文章节标题策划。根据本章剧情要点、场景与爽点，为这一章起一个简短、有网感且不剧透过多的小标题。

规则：
1. 标题长度 4-8 个字，最多不超过 12 个字
2. 要能勾起读者好奇、聚焦本章最精彩看点
3. 用词贴合网络小说习惯，避免文言和学究气
4. 不要输出任何标点、引号或多余文字，只输出标题本身`;

/** 默认回退标题 */
function fallbackTitle(chapterNo: number): string {
  return `第${chapterNo}章`;
}

/**
 * 调用真实 LLM 生成章节标题。
 * 任何失败或产物不合规都会回退为「第 N 章」，保证调用方零负担。
 */
export async function generateChapterTitle(
  input: ChapterTitleInput
): Promise<string> {
  const { chapterNo, plotPoints, sceneDesign } = input;
  const fallback = fallbackTitle(chapterNo);

  const userPrompt = [
    `第 ${chapterNo} 章剧情要点：`,
    ...plotPoints.map((p) => `- ${p}`),
    '',
    '本章场景：' + (sceneDesign.setting || '（无）'),
    '核心冲突：' + (sceneDesign.conflict || '（无）'),
    '本章爽点/反转：' + (sceneDesign.highlight || '（无）'),
    input.volumeTitle ? `所属卷：${input.volumeTitle}` : '',
    '',
    '请给出本章标题（直接输出标题文字）：',
  ].join('\n');

  let result;
  try {
    result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'text', temperature: 0.9, maxTokens: 32 }
    );
  } catch {
    return fallback;
  }

  const title = sanitizeTitle(result.content);
  return title || fallback;
}

/** 清洗：去首尾空白/引号/换行；先识别 JSON 兜底解析，再对纯文本限长；空则回退 */
function sanitizeTitle(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/^[\s「」『』“”"'\n]+|[\s「」『』“”"'\n]+$/g, '')
    .trim();
  if (!cleaned) return '';
  // 偶发模型输出 JSON 时兜底解析
  if (cleaned.startsWith('{')) {
    const parsed = safeParseJSON<{ title?: string }>(cleaned, {});
    return parsed?.title?.trim().slice(0, 12) || '';
  }
  return cleaned.slice(0, 12);
}