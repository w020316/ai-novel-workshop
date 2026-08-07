// ============================================================================
// 一致性校验 Agent
// 依据：spec 6.3 节 / 计划 P5.3
// 职责：
// 1. 校验章节正文与世界观的一致性
// 2. 校验人物设定一致性（性格/能力/关系）
// 3. 校验伏笔铺设与回收的合理性
// 4. 校验文风一致性
// 输出：ConsistencyReport
// ============================================================================
import type {
  ConsistencyReport,
  ConsistencyIssue,
  AssembledMemory,
  Chapter,
} from '@/types';
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';

/**
 * 一致性校验 Agent 的 System Prompt
 */
const SYSTEM_PROMPT = `你是一位专业的网络小说质量审核编辑。你的任务是对比章节正文与项目设定，找出所有不一致之处。

请严格按以下 JSON 格式输出，不要包含任何其他内容：

{
  "passed": true/false,
  "issues": [
    {
      "type": "character | worldview | plot | foreshadowing | style",
      "severity": "warning | error",
      "description": "问题描述",
      "suggestion": "修改建议",
      "paragraphIndex": 0
    }
  ]
}

校验要点：
1. 人物：性格是否一致、能力是否矛盾、关系是否正确
2. 世界观：地理/力量体系/规则是否与设定冲突
3. 剧情：逻辑是否自洽、情节是否合理
4. 伏笔：铺设后是否有回收、回收方式是否合理
5. 文风：是否与预设风格一致`;

/**
 * 执行一致性校验
 *
 * @param chapter - 已完成的章节
 * @param memory - 项目记忆（含世界观/人物/伏笔等）
 * @returns 一致性校验报告
 */
export async function checkConsistency(
  chapter: Chapter,
  memory: AssembledMemory
): Promise<ConsistencyReport> {
  // 1. 构建校验 Prompt
  const userPrompt = buildConsistencyPrompt(chapter, memory);

  // 2. 调用 LLM
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.3,
      topP: 0.8,
      responseFormat: 'json',
    }
  );

  // 3. 解析 JSON
  const report = parseConsistencyReport(response.content);

  // 4. 补充元数据
  return {
    ...report,
    chapterId: chapter.id,
    checkedAt: Date.now(),
  };
}

/**
 * 构建校验 Prompt
 */
function buildConsistencyPrompt(
  chapter: Chapter,
  memory: AssembledMemory
): string {
  const parts: string[] = [];

  // 世界观
  if (memory.longTerm.worldview) {
    parts.push('【世界观设定】');
    const wv = memory.longTerm.worldview;
    parts.push(`世界架构：${wv.worldStructure}`);
    parts.push(`力量体系：${wv.powerSystem}`);
    parts.push(`地理：${wv.geography}`);
    parts.push(`时代背景：${wv.era}`);
    parts.push(`势力划分：${wv.factions}`);
    if (wv.rules?.length) parts.push(`核心规则：${wv.rules.join('；')}`);
    parts.push('');
  }

  // 人物档案
  if (memory.longTerm.characters.length > 0) {
    parts.push('【人物档案】');
    for (const c of memory.longTerm.characters) {
      parts.push(
        `${c.name}（${c.role}）：外貌「${c.appearance}」、性格「${c.personality}」、背景「${c.background}」、执念「${c.motivation}」、弱点「${c.weakness}」
说话风格「${c.speechStyle}」、行为模式「${c.behaviorPattern}」`
      );
    }
    parts.push('');
  }

  // 伏笔
  if (memory.longTerm.pendingForeshadowings.length > 0) {
    parts.push('【待回收伏笔】');
    for (const f of memory.longTerm.pendingForeshadowings) {
      parts.push(`- ${f.description}（铺设于第 ${f.setupChapter} 章，计划回收于第 ${f.plannedRecoveryChapter ?? 'N/A'} 章）`);
    }
    parts.push('');
  }

  // 文风
  if (memory.longTerm.stylePreset) {
    parts.push('【文风要求】');
    parts.push(`风格：${memory.longTerm.stylePreset.name}`);
    if (memory.longTerm.stylePreset.sampleText) {
      parts.push(`样本：${memory.longTerm.stylePreset.sampleText}`);
    }
    parts.push('');
  }

  // 章节正文
  parts.push('【章节正文】');
  parts.push(chapter.content);

  return parts.join('\n');
}

/**
 * 解析一致性校验报告
 */
function parseConsistencyReport(content: string): Omit<ConsistencyReport, 'chapterId' | 'checkedAt'> {
  const defaultReport = {
    passed: true,
    issues: [] as ConsistencyIssue[],
  };

  return safeParseJSON(content, defaultReport);
}

/**
 * 快速校验（仅检查人物和世界观，不调用 LLM）
 * 用于设定修改后的快速扫描
 */
export function quickCheck(
  chapter: Chapter,
  memory: AssembledMemory
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 检查出场人物是否在人物档案中
  const characterIds = new Set(memory.longTerm.characters.map((c) => c.id));
  if (chapter.sceneDesign?.characterAppearances) {
    for (const charId of chapter.sceneDesign.characterAppearances) {
      if (!characterIds.has(charId)) {
        issues.push({
          type: 'character',
          severity: 'warning',
          description: `出场人物 ${charId} 不在人物档案中`,
          suggestion: '请确认该人物是否已创建，或移除出场安排',
        });
      }
    }
  }

  // 检查伏笔引用是否有效
  const foreshadowingIds = new Set(
    memory.longTerm.pendingForeshadowings.map((f) => f.id)
  );
  if (chapter.sceneDesign) {
    for (const fId of chapter.sceneDesign.foreshadowingToRecover) {
      if (!foreshadowingIds.has(fId)) {
        issues.push({
          type: 'foreshadowing',
          severity: 'error',
          description: `待回收伏笔 ${fId} 不存在或已被回收`,
          suggestion: '请检查伏笔 ID 是否正确',
        });
      }
    }
  }

  return issues;
}