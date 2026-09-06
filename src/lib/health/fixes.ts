// ============================================================================
// 健康体检 · AI 完善方案（需求 12）
// 依据：计划「卷级健康体检」问题清单 → LLM 生成可落地的修复方案
// 职责：对体检发现的问题，以资深网文主编口吻调用 LLM，给出每个问题
//       具体可执行的修复步骤（2-4 步，写到能直接照做的程度）；
//       LLM 失败/返回非法时，确定性降级为每个问题的 suggestion 单步方案。
// 复用：llm/client（chat）、utils（safeParseJSON），模式对齐 trend/trends.ts。
// ============================================================================
import { chat } from '@/lib/llm/client';
import { safeParseJSON } from '@/lib/utils';
import type { HealthIssue } from './health-check';

/** 单个体检问题的修复方案 */
export interface HealthFix {
  /** 对应体检问题的标题 */
  title: string;
  /** 具体可执行的修复步骤（2-4 步） */
  steps: string[];
}

export interface HealthFixesResult {
  fixes: HealthFix[];
  /** 是否来自 LLM（false = LLM 不可用，降级为基础建议方案） */
  fromLLM: boolean;
}

const SYSTEM_PROMPT = `你是一位资深网文主编，审稿经验丰富，最擅长诊断长篇连载的"烂文"前兆并给出止血方案。用户会给出一份小说健康体检的问题清单，请你针对每个问题给出具体可执行的修复步骤。严格只输出 JSON（不要解释/前后缀/markdown），格式如下：
{"fixes":[{"title":"对应问题标题","steps":["步骤1","步骤2"]}]}
要求：
1. fixes 数量与问题数量一一对应，title 必须原样使用对应问题的标题；
2. 每个问题给出 2-4 步，写到能直接照做的程度（如"在第 N 章插入一段 XX 对话回收伏笔"）；
3. 步骤必须结合项目上下文落到具体章节、人物、情节上，不要空话套话。`;

interface RawResult {
  fixes?: Array<{ title?: string; steps?: unknown }>;
}

/**
 * 生成健康体检问题的 AI 完善方案。
 * LLM 失败/返回非法时降级：每个问题用其 suggestion 字段包装成单步修复方案。
 *
 * @param input.genre - 项目题材
 * @param input.issues - 体检问题清单
 * @param input.contextSummary - 项目上下文简述（标题+简介+大纲主线）
 */
export async function generateHealthFixes(input: {
  genre: string;
  issues: HealthIssue[];
  contextSummary: string;
}): Promise<HealthFixesResult> {
  const { genre, issues, contextSummary } = input;

  // 无问题时不调用 LLM，直接返回空方案
  if (issues.length === 0) {
    return { fixes: [], fromLLM: false };
  }

  const issueLines = issues.map((iss, i) => {
    return [
      `${i + 1}.【${iss.dimension}·${iss.severity}】${iss.title}`,
      `   详情：${iss.detail}`,
      iss.suggestion ? `   初步建议：${iss.suggestion}` : '',
      iss.relatedChapters?.length
        ? `   相关章节：第 ${iss.relatedChapters.join('、')} 章`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const userPrompt = [
    `【题材】${genre}`,
    `【项目上下文】${contextSummary}`,
    '',
    '【体检问题清单】',
    ...issueLines,
    '',
    `请针对以上 ${issues.length} 个问题，给出每个问题的具体修复方案（严格 JSON，fixes 数量为 ${issues.length}）。`,
  ].join('\n');

  try {
    const result = await chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', temperature: 0.5, maxTokens: 1500 }
    ).catch(() => null);

    if (result) {
      const parsed = safeParseJSON<RawResult>(result.content ?? '', {});
      const raw = Array.isArray(parsed.fixes) ? parsed.fixes : [];
      const fixes = raw
        .map((f) => ({
          title: (f.title ?? '').trim(),
          steps: (Array.isArray(f.steps) ? f.steps : [])
            .map((s) => String(s).trim())
            .filter(Boolean),
        }))
        .filter((f) => f.title.length > 0 && f.steps.length > 0);
      if (fixes.length > 0) {
        return { fixes, fromLLM: true };
      }
    }
  } catch {
    // 静默降级
  }

  return { fixes: buildFallbackFixes(issues), fromLLM: false };
}

/** 确定性降级：每个问题用 suggestion 包装成单步修复方案（无 suggestion 时给通用兜底步骤） */
function buildFallbackFixes(issues: HealthIssue[]): HealthFix[] {
  return issues.map((iss) => ({
    title: iss.title,
    steps: [iss.suggestion?.trim() || '先在对应设定页补全信息，再于后续章节逐步修正该问题。'],
  }));
}
