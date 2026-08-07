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

/**
 * 文笔创作 Agent 的默认 System Prompt
 */
const SYSTEM_PROMPT = `你是一位专业的网络小说作家。你的任务是根据剧情设计方案和项目记忆，创作精彩的小说章节。

要求：
1. 遵循世界观设定，不出现矛盾
2. 人物性格一致，对话符合人设
3. 情节紧凑，有悬念和吸引力
4. 文风要符合项目的风格预设
5. 每章字数约 2000-3000 字
6. 合理分段，提升可读性`;

/**
 * 构建写作 Prompt
 */
function buildWritingPrompt(
  sceneDesign: SceneDesign,
  memory: AssembledMemory,
  chapterNo: number,
  title: string,
  stylePreset?: StylePreset | null
): string {
  const parts: string[] = [];

  // 记忆信息
  parts.push('【项目记忆】');
  parts.push(memoryToPrompt(memory));
  parts.push('');

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

  // 文风示例
  if (stylePreset?.sampleText) {
    parts.push('【文风参考（请模仿以下风格）】');
    parts.push(stylePreset.sampleText);
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
  stylePreset?: StylePreset | null
): Promise<string> {
  const userPrompt = buildWritingPrompt(
    sceneDesign,
    memory,
    context.chapterNo,
    `第${context.chapterNo}章`,
    stylePreset
  );

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];

  // 使用流式调用
  let fullContent = '';
  await context.onStream(''); // 触发开始信号

  // 通过服务端 API 流式生成
  const response = await fetch('/api/llm/generate-chapter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, chapterNo: context.chapterNo }),
  });

  if (!response.ok) {
    throw new Error(`写作生成失败：HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('响应体不可读');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.token) {
            fullContent += parsed.token;
            context.onStream(parsed.token);
          }
        } catch {
          // 非 JSON 数据行，忽略
        }
      }
    }
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
  return result.content;
}