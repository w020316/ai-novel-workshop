// ============================================================================
// AI 痕迹检测器（Humanizer · 检测端）
// 依据：调研结论——网文商业化获客的关键在于「去AI味/提高过审概率」。
// 职责：以确定性规则扫描正文，找出常见的「机器感/AI味」模式与示例，
//       为 LLM 去AI味重写提供可量化的依据。本文件不依赖 LLM，稳定可测。
// ============================================================================

export interface AiTraceCategory {
  /** 类别标识 */
  id: string;
  /** 展示名（中文） */
  label: string;
  /** 命中次数 */
  count: number;
  /** 命中示例（最多 N 条，截取原文片段） */
  examples: string[];
  /** 一句话解释，提示作者如何改 */
  hint: string;
}

export interface AiTraceReport {
  /** 是否发现明显 AI 味 */
  flagged: boolean;
  /** 命中类别数 */
  categoryCount: number;
  /** 总命中次数 */
  totalCount: number;
  /** 每类别明细 */
  categories: AiTraceCategory[];
}

interface Rule {
  id: string;
  label: string;
  /** 正则（全局、不区分大小写） */
  pattern: RegExp;
  hint: string;
}

/**
 * 常见「AI 味」模式规则池。
 * 说明：网文是口语化、镜头感强的文体，以下书面化堆砌/模板套话/无效空动作
 * 正是 AI 生成文本最易暴露的痕迹。
 */
const RULES: Rule[] = [
  {
    id: 'empty_action',
    label: '无效空动作（灌水）',
    pattern: /(笑了笑|点了点头|看了一眼|哼了一声|轻声(地)?说|缓缓(地)?|默默(地)?|淡淡(地)?|微微一笑|沉声道)/g,
    hint: '删掉「笑了笑 / 点了点头 / 缓缓」等无效动作，用推进剧情或对话取而代之。',
  },
  {
    id: 'summary_narrate',
    label: '总结式旁白',
    pattern: /(原来|仿佛|或许|大概|某种程度上|某种意义上|这一刻|也许这就是|一切|这一切|终究|终于明白)/g,
    hint: '避免用旁白替读者下结论，改为让情节与动作自然呈现。',
  },
  {
    id: 'overused_conjunction',
    label: '转折词密集',
    pattern: /(然而|但是|不过|因此|于是|甚至|毕竟|竟然|却得分外|毫无疑问)/g,
    hint: '一段内转折连词过多会显生硬，适当删减、用短句推进。',
  },
  {
    id: 'template_phrasing',
    label: '模板化套话',
    pattern: /(夜幕降临|风雨欲来|电光火石间|说时迟那时快|日月无光|天地失色|冷汗直冒|心中一动|暗自心惊|一股寒意|一阵恶寒)/g,
    hint: '「夜幕降临 / 说时迟那时快」等套话太出戏，换成具体、有镜头感的描写。',
  },
  {
    id: 'overly_formal',
    label: '过度书面化',
    pattern: /(倘若|遑论|使得|相较于|换言之|换言之|在此|诸位|此间|无异于|堪称)/g,
    hint: '网文偏口语化，书面套话会让读感生硬，改用短促白话。',
  },
  {
    id: 'dialogue_tag_bomb',
    label: '对话标签堆叠',
    pattern: /("[^"]{1,12}")[，,]?(他|她|我|你|王|李)[^。\n]{0,4}(说道|问道|答道|低声道|笑道)(，|。)/g,
    hint: '对话后连着堆「X 说道……」标签过多，可用动作或独白代替代替。',
  },
];

/** 每个类别最多保留的示例条数 */
const MAX_EXAMPLES = 3;
/** 超过该命中次数即判为「明显 AI 味」 */
const FLAG_THRESHOLD = 6;

/**
 * 检测正文中的 AI 痕迹模式。
 * @param content 章节正文
 */
export function detectAITraces(content: string): AiTraceReport {
  const categories: AiTraceCategory[] = [];
  let totalCount = 0;

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    const matches = content.match(rule.pattern) ?? [];
    if (matches.length === 0) continue;

    // 去重示例并取其前后文片段，便于展示与 LLM 定位
    const seen = new Set<string>();
    const examples: string[] = [];
    for (const m of matches) {
      const trimmed = m.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        examples.push(trimmed);
        if (examples.length >= MAX_EXAMPLES) break;
      }
    }

    categories.push({
      id: rule.id,
      label: rule.label,
      count: matches.length,
      examples,
      hint: rule.hint,
    });
    totalCount += matches.length;
  }

  categories.sort((a, b) => b.count - a.count);

  return {
    flagged: totalCount >= FLAG_THRESHOLD,
    categoryCount: categories.length,
    totalCount,
    categories,
  };
}

/**
 * 将检测结果汇总为一段简短的人工可读评语（用于 toast / 面板标题）。
 */
export function summarizeTraces(report: AiTraceReport): string {
  if (report.totalCount === 0) return '未发现明显的 AI 痕迹';
  const top = report.categories[0];
  const parts = [`检测到 ${report.totalCount} 处 AI 痕迹`];
  if (top) parts.push(`最突出：${top.label}（${top.count} 处）`);
  return parts.join('，') + '。';
}