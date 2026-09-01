// ============================================================================
// 章节修正重写 Agent
// 依据：计划「一致性校验修正闭环」
// 职责：当一致性校验存在 error 级问题时，依据问题清单对原文进行定向修正重写，
//       修正内容必须保留原有剧情推进，仅修复不一致之处。
// 降级：LLM 不可用时抛错，由 orchestrator 决定采用原稿。
// ============================================================================
import type { AssembledMemory, SceneDesign, StylePreset } from '@/types';
import { chat, LLMClientError } from '@/lib/llm/client';
import { memoryToPrompt } from '@/lib/memory/assembler';

export interface RewriteForConsistencyInput {
  content: string;
  memory: AssembledMemory;
  sceneDesign: SceneDesign;
  chapterNo: number;
  title: string;
  /** 一致性校验暴露的问题（决定修正方向） */
  issues: Array<{ type?: string; severity?: string; description: string; suggestion?: string }>;
  stylePreset?: StylePreset | null;
}

const SYSTEM_PROMPT = `你是一位网络小说精修编辑。你的任务是在不改变本章剧情推进的前提下，修正正文中与设定/主线不一致的问题。

要求：
1. 仅修复【待修正问题】中列出的不一致之处，不要重写整章故事情节
2. 保留原文行文节奏、人设与文风，修改要自然、不留痕迹
3. 绝对不得破坏主线锚点，不得让角色性格/能力/关系偏离设定
4. 直接输出修正后的完整章节正文，不要输出任何解释或前后缀`;

/**
 * 依据一致性校验问题，定向修正重写章节正文。
 * @throws LLMClientError - LLM 不可用时抛出，供上层采用原稿。
 */
export async function rewriteForConsistency(
  input: RewriteForConsistencyInput
): Promise<string> {
  const { content, memory, sceneDesign, chapterNo, title, issues, stylePreset } = input;

  const issueText = issues
    .map(
      (i, idx) =>
        `${idx + 1}. [${i.type ?? 'unknown'}/${i.severity ?? 'warning'}] ${i.description}${
          i.suggestion ? `（建议：${i.suggestion}）` : ''
        }`
    )
    .join('\n');

  const userPrompt = [
    `【第 ${chapterNo} 章 - ${title}】`,
    '',
    '【待修正问题】',
    issueText || '（无）',
    '',
    '【项目记忆】',
    memoryToPrompt(memory, { chapterNo }),
    '',
    '【本章剧情方案】',
    `场景：${sceneDesign.setting}`,
    `冲突：${sceneDesign.conflict}`,
    `爽点/反转：${sceneDesign.highlight}`,
    stylePreset?.sampleText ? `文风样本：${stylePreset.sampleText}` : '',
    '',
    '【原文（请修正后输出完整正文）】',
    content,
  ].join('\n');

  const result = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { responseFormat: 'text', temperature: 0.4, maxTokens: 4096 }
  );

  const revised = result.content?.trim();
  if (!revised || revised === content.trim()) {
    // 修正结果为空或未被改动 → 视为未改善，抛错让上层沿用原稿
    throw new LLMClientError('修正重写未产出有效内容', 502, true);
  }

  return revised;
}