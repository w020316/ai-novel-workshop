// ============================================================================
// 剧情设计 Agent
// 依据：spec 6.3 节 / 计划 P5.1
// 职责：根据剧情要点和记忆，生成 SceneDesign（场景/冲突/爽点/伏笔）
// 输入：GenerationContext + AssembledMemory
// 输出：SceneDesign JSON
// ============================================================================
import type { SceneDesign, AssembledMemory, GenerationContext } from '@/types';
import { chat } from '@/lib/llm/client';
import { memoryToPrompt } from '@/lib/memory/assembler';
import { safeParseJSON } from '@/lib/utils';

/**
 * 剧情设计 Agent 的默认 Prompt 模板
 */
const SYSTEM_PROMPT = `你是一位专业的网络小说剧情设计专家。你的任务是根据给定的世界观、人物档案、剧情要点和记忆信息，设计一个章节的详细剧情方案。

请严格按以下 JSON 格式输出，不要包含任何其他内容：

{
  "setting": "场景描述（50-100字）",
  "conflict": "核心冲突（30-80字）",
  "highlight": "爽点/反转（30-80字）",
  "foreshadowingToPlant": ["伏笔ID列表，需要铺设的新伏笔"],
  "foreshadowingToRecover": ["伏笔ID列表，需要回收的已有伏笔"],
  "characterAppearances": ["出场人物ID列表"]
}

要求：
1. setting 应具体且符合世界观设定
2. conflict 应明确且有张力
3. highlight 应是本章最精彩的看点
4. 伏笔铺设和回收要合理，保持剧情连贯性
5. 出场人物要符合场景逻辑
6. 始终服务并推进【主线锚点】中的主线程与结局归宿，严禁偏离主线、写跑题支线
7. 本卷核心冲突必须是本章叙事的第一驱动力

剧情设计三原则（与写作黄金法则配套）：
一、【冲突驱动】conflict 必须落实为具体对抗（谁与谁 / 与环境 / 内心挣扎），写出对抗双方与各自筹码，杜绝无冲突的过场章
二、【钩子衔接】highlight 应先接住最近章节遗留的悬念，再抛出本章新钩子，形成连续的追读链
三、【爽点具象】highlight 写成可演的画面（打脸的瞬间 / 反转的揭晓 / 实力的亮相），不要写抽象的"气氛"或"情绪"`;

/**
 * 执行剧情设计
 * 调用 LLM 生成 SceneDesign
 *
 * @param context - 生成上下文（项目ID/章节号/剧情要点等）
 * @param memory - 装配好的三级记忆
 * @returns SceneDesign 对象
 */
export async function designPlot(
  context: GenerationContext,
  memory: AssembledMemory
): Promise<SceneDesign> {
  // 1. 构建用户 Prompt
  const userPrompt = buildPlotDesignPrompt(context, memory);

  // 2. 调用 LLM
  const response = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    {
      temperature: 0.8,
      topP: 0.9,
      responseFormat: 'json',
    }
  );

  // 3. 解析 JSON 响应
  const sceneDesign = parseSceneDesign(response.content);

  // 4. 校验并补充默认值
  return validateSceneDesign(sceneDesign, context.projectId);
}

/**
 * 构建剧情设计 Prompt
 */
function buildPlotDesignPrompt(
  context: GenerationContext,
  memory: AssembledMemory
): string {
  const parts: string[] = [];

  // 记忆信息（带当前章号，注入主线锚点与当前卷定位）
  parts.push('【当前项目记忆】');
  parts.push(memoryToPrompt(memory, { chapterNo: context.chapterNo }));
  parts.push('');

  // 剧情要点
  parts.push('【本章剧情要点】');
  for (const point of context.plotPoints) {
    parts.push(`- ${point}`);
  }
  parts.push('');

  // 用户干预
  if (context.userIntervention) {
    const ui = context.userIntervention;
    if (ui.modifiedPlotPoints?.length) {
      parts.push('【用户修改的剧情要点】');
      for (const p of ui.modifiedPlotPoints) {
        parts.push(`- ${p}`);
      }
      parts.push('');
    }
    if (ui.forcedCharacters?.length) {
      parts.push('【强制出场人物】');
      parts.push(ui.forcedCharacters.join('、'));
      parts.push('');
    }
    if (ui.disabledForeshadowings?.length) {
      parts.push('【禁用伏笔（请勿使用）】');
      parts.push(ui.disabledForeshadowings.join('、'));
      parts.push('');
    }
  }

  parts.push('请根据以上信息，生成第 ' + context.chapterNo + ' 章的剧情设计方案。');

  return parts.join('\n');
}

/**
 * 解析 SceneDesign JSON
 */
function parseSceneDesign(content: string): SceneDesign {
  const defaultDesign: SceneDesign = {
    setting: '',
    conflict: '',
    highlight: '',
    foreshadowingToPlant: [],
    foreshadowingToRecover: [],
    characterAppearances: [],
  };

  return safeParseJSON<SceneDesign>(content, defaultDesign);
}

/**
 * 校验并补充 SceneDesign 默认值
 */
function validateSceneDesign(
  design: SceneDesign,
  _projectId: string
): SceneDesign {
  return {
    setting: design.setting || '默认场景',
    conflict: design.conflict || '默认冲突',
    highlight: design.highlight || '默认爽点',
    foreshadowingToPlant: Array.isArray(design.foreshadowingToPlant)
      ? design.foreshadowingToPlant
      : [],
    foreshadowingToRecover: Array.isArray(design.foreshadowingToRecover)
      ? design.foreshadowingToRecover
      : [],
    characterAppearances: Array.isArray(design.characterAppearances)
      ? design.characterAppearances
      : [],
  };
}