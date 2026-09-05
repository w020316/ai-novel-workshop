// ============================================================================
// 文笔创作 Agent
// 依据：spec 6.3 节 / 计划 P5.2
// 职责：
// 1. 根据 SceneDesign 和记忆，流式生成章节正文
// 2. 应用文风预设（Few-shot 样本）
// 3. 支持重写指定段落
// ============================================================================
import type { SceneDesign, AssembledMemory, GenerationContext, StylePreset } from '@/types';
import { memoryToPrompt } from '@/lib/memory/assembler';
import { streamChapter } from '@/lib/llm/client-stream';
import { styleGuideToPrompt } from '@/lib/style/clone';
import { personaToPrompt } from '@/lib/style/persona';
import { buildAvoidance } from '@/lib/originality/check';
import { buildSkillsPromptForStage } from '@/lib/skills/store';

/**
 * 文笔创作 Agent 的默认 System Prompt
 */
const SYSTEM_PROMPT = `你是一位专业的网络小说作家。你的任务是根据剧情设计方案和项目记忆，创作精彩的小说章节。

要求：
1. 遵循世界观设定，不出现矛盾
2. 人物性格一致，对话符合人设
3. 情节紧凑，有悬念和吸引力
4. 文风要符合项目的风格预设
5. 按用户提示中【字数要求】控制本章篇幅；未给出时约 2000-3000 字
6. 合理分段，提升可读性
7. 本章必须推进【主线锚点】中的主线与结局归宿，严禁偏离主线、填充注水
8. 遵循【当前创作进度定位】的本卷核心冲突，做人设与力量体系的上限约束（禁止无限战力膨胀）

写作三大黄金法则（每章必须遵守）：
一、【展示而非讲述】不要直接告诉读者结论（如"他很愤怒""气氛紧张"），用动作、对话、神态与细节把情绪和信息演出来
二、【冲突驱动】每章至少一组具体对抗（人与人 / 人与环境 / 内心挣扎），冲突必须推动剧情或人物发生变化，禁止无冲突的过场章
三、【悬念承上启下】开头 3 段内接住上一章的钩子或抛出新悬念抓住读者；结尾必须停在断章处（危机爆发的瞬间 / 反转揭晓前 / 关键信息半遮半掩），逼读者追读下一章

人设落地法则（每章必须遵守）：
一、【对话立人设】出场角色的对话必须贴合【人物档案】中该角色的说话风格与口头禅，让读者遮住名字也能认出是谁在说话；禁止所有角色腔调雷同
二、【行为显内核】角色的选择与行动要体现其执念与弱点（渴望什么、害怕什么），行为必须有内在动机，禁止工具人式的随叫随到
三、【插曲塑人设】在主线允许的范围内，可设计不影响主线推进的小插曲或细节（如一个习惯动作、一句口癖的由来）来凸显角色设定，但严禁偏离主线锚点或注水拖节奏`;

/**
 * 构建写作 Prompt
 */
function buildWritingPrompt(
  sceneDesign: SceneDesign,
  memory: AssembledMemory,
  chapterNo: number,
  title: string,
  stylePreset?: StylePreset | null,
  genre?: string,
  chapterWords?: number
): string {
  const parts: string[] = [];

  // 记忆信息（带当前章号，注入主线锚点与当前卷定位）
  parts.push('【项目记忆】');
  parts.push(memoryToPrompt(memory, { chapterNo }));
  parts.push('');

  // 字数要求（项目「每章字数」设置，控制本章篇幅）
  if (chapterWords && chapterWords > 0) {
    parts.push(`【字数要求】本章正文约 ${chapterWords} 字（允许 ±10%），不得明显注水或截断。`);
    parts.push('');
  }

  // 章节信息
  parts.push(`【第 ${chapterNo} 章 - ${title}】`);
  parts.push('');

  // 剧情设计方案
  parts.push('【场景设定】');
  parts.push(sceneDesign.setting);
  parts.push('');

  parts.push('【核心冲突】');
  parts.push(sceneDesign.conflict);
  parts.push('');

  parts.push('【爽点/反转】');
  parts.push(sceneDesign.highlight);
  parts.push('');

  if (sceneDesign.characterAppearances.length > 0) {
    parts.push('【出场人物】');
    parts.push(sceneDesign.characterAppearances.join('、'));
    parts.push('');
  }

  // 文风指南（LLM 定性，优先于样本展示，直接给出可执行规则）
  if (stylePreset?.styleGuide) {
    parts.push(styleGuideToPrompt(stylePreset.styleGuide));
    parts.push('');
  }

  // 叙述者人格（P1-4 人设化文风）：约束「谁在叙述」，与笔法指南互补
  if (stylePreset?.persona) {
    parts.push(personaToPrompt(stylePreset.persona));
    parts.push('');
  }

  // 文风示例
  if (stylePreset?.sampleText) {
    parts.push('【文风参考（请模仿以下风格）】');
    parts.push(stylePreset.sampleText);
    parts.push('');
  }

  // 原创性规避负例：引导在同题材热梗方向下差异化，避免整体复刻平台代表作
  if (genre) {
    parts.push('【原创性要求·请务必遵守】');
    parts.push(buildAvoidance({ genre }).prompt);
    parts.push('');
  }

  parts.push('请根据以上方案，创作第 ' + chapterNo + ' 章的正文。');

  return parts.join('\n');
}

/**
 * 生成章节正文（流式）
 * 通过 GenerationContext.onStream 回调推送 token
 *
 * @param sceneDesign - 剧情设计方案
 * @param memory - 装配好的三级记忆
 * @param context - 生成上下文
 * @param stylePreset - 文风预设（可选）
 * @returns 完整的章节正文
 */
export async function writeChapter(
  sceneDesign: SceneDesign,
  memory: AssembledMemory,
  context: GenerationContext,
  stylePreset?: StylePreset | null,
  title?: string,
  genre?: string,
  chapterWords?: number
): Promise<string> {
  const userPrompt = buildWritingPrompt(
    sceneDesign,
    memory,
    context.chapterNo,
    title ?? `第${context.chapterNo}章`,
    stylePreset,
    genre,
    chapterWords
  );

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];
  // 注入已启用的写作技能指令（无启用时为空，不影响既有行为）
  const skillsBlock = await buildSkillsPromptForStage('write', context.skillIds);
  if (skillsBlock) {
    messages[0] = { role: 'system' as const, content: `${SYSTEM_PROMPT}\n\n${skillsBlock}` };
  }

  // 使用流式调用
  let fullContent = '';
  await context.onStream(''); // 触发开始信号

  // 通过服务端 API 流式生成（复用统一 SSE 解析，支持 signal 中断）
  let streamError: string | null = null;
  await streamChapter(
    { messages, signal: context.signal },
    {
      onToken: (token: string) => {
        fullContent += token;
        context.onStream(token);
      },
      onError: (err: string) => {
        streamError = err;
      },
    }
  );

  // 用户主动中断：返回已生成部分，交由上层决定
  if (context.signal?.aborted) {
    return fullContent;
  }

  if (streamError) {
    throw new Error(streamError);
  }

  return fullContent;
}

/**
 * 重写指定段落
 * 用于用户干预场景
 *
 * @param originalContent - 原始章节正文
 * @param paragraphIndex - 要重写的段落索引
 * @param instruction - 用户的重写指令
 * @param memory - 项目记忆
 * @returns 重写后的段落
 */
export async function rewriteParagraph(
  originalContent: string,
  paragraphIndex: number,
  instruction: string,
  memory: AssembledMemory
): Promise<string> {
  const paragraphs = originalContent.split('\n\n');
  const targetParagraph = paragraphs[paragraphIndex];

  if (!targetParagraph) {
    throw new Error(`段落索引 ${paragraphIndex} 超出范围（共 ${paragraphs.length} 段）`);
  }

  const prompt = `【项目设定】\n${memoryToPrompt(memory)}\n\n【原文段落】\n${targetParagraph}\n\n【修改要求】\n${instruction}\n\n请根据以上要求重写该段落，保持文风一致。`;

  const response = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: '你是一位专业的网络小说作家，请根据要求重写指定段落。' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`重写失败：HTTP ${response.status}`);
  }

  const result = await response.json();
  // 响应防御：API 异常时可能返回无 content 的 JSON，原样返回 undefined 会静默污染正文
  if (typeof result.content !== 'string' || result.content.trim().length === 0) {
    throw new Error('重写失败：模型返回内容为空');
  }
  return result.content;
}