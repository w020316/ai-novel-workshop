// ============================================================================
// AI 痕迹检测器（Humanizer · 检测端）
// 依据：调研结论——网文商业化获客的关键在于「去AI味/提高过审概率」。
//       v2 吸收 InkOS 确定性写后验证规则（禁「不是…而是…」/破折号/
//       连续「了」字/转折词密度/长段上限）与 oh-story「三遍去AI法」的
//       排比堆砌思路，并新增命中位置信息以支撑「定点修复 spot-fix」。
// 职责：以确定性规则扫描正文，找出常见的「机器感/AI味」模式与示例，
//       为 LLM 去AI味改写提供可量化的依据。本文件不依赖 LLM，稳定可测。
// ============================================================================

export interface AiTraceMatch {
  /** 命中文本 */
  text: string;
  /** 在原文中的起始索引（含） */
  start: number;
  /** 在原文中的结束索引（不含） */
  end: number;
}

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
  /** 命中位置（用于定点修复，最多保留 MAX_MATCHES_PER_CATEGORY 条） */
  matches: AiTraceMatch[];
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

/** 自定义分析器：段落级/句子级规则（正则无法表达） */
type Analyzer = (content: string) => AiTraceMatch[];

interface Rule {
  id: string;
  label: string;
  /** 正则（全局、不区分大小写） */
  pattern?: RegExp;
  /** 自定义分析器（与 pattern 二选一） */
  analyze?: Analyzer;
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
    hint: '对话后连着堆「X 说道……」标签过多，可用动作或独白替代。',
  },
  {
    id: 'not_but_cliche',
    label: '「不是…而是…」句式',
    pattern: /不是[^，。！？\n]{1,16}，?而是/g,
    hint: '「不是A而是B」是高频 AI 句式，直接写 B，或用动作与结果呈现对比。',
  },
  {
    id: 'dash_abuse',
    label: '破折号滥用',
    pattern: /——+/g,
    hint: '网文几乎不用破折号，改用逗号、省略号或直接短句衔接。',
  },
  {
    id: 'consecutive_le',
    label: '连续「了」字堆叠',
    analyze: (content) =>
      splitSentences(content)
        .filter((s) => (s.text.match(/了/g)?.length ?? 0) >= 4)
        .map((s) => s),
    hint: '一句话里「了」太多是典型机器味，删掉多余的「了」，用动作节奏替代。',
  },
  {
    id: 'long_paragraph',
    label: '超长段落',
    analyze: (content) =>
      splitParagraphs(content)
        .filter((p) => p.text.length > LONG_PARAGRAPH_LIMIT)
        .map((p) => p),
    hint: '超长段落压迫感强且难读，按镜头切分为 2-4 个自然段。',
  },
  {
    id: 'parallelism_density',
    label: '排比堆砌',
    pattern: /(有的|像|仿佛|似乎|一会儿|时而|一次次|一遍遍|那是)[^，。！？\n]{0,14}，\1[^，。！？\n]{0,14}，\1/g,
    hint: '三连排比是 AI 高频套路，留一个最具画面感的，其余改为动作与细节。',
  },
];

/** 每个类别最多保留的示例条数 */
const MAX_EXAMPLES = 3;
/** 每个类别最多保留的位置信息条数（供定点修复使用） */
const MAX_MATCHES_PER_CATEGORY = 20;
/** 超过该命中次数即判为「明显 AI 味」 */
const FLAG_THRESHOLD = 6;
/** 单段超过该字数判为「超长段落」 */
const LONG_PARAGRAPH_LIMIT = 350;

/**
 * 检测正文中的 AI 痕迹模式。
 * @param content 章节正文
 */
export function detectAITraces(content: string): AiTraceReport {
  const categories: AiTraceCategory[] = [];
  let totalCount = 0;

  for (const rule of RULES) {
    const matches = collectMatches(content, rule);
    if (matches.length === 0) continue;

    // 去重示例，便于展示与 LLM 定位
    const seen = new Set<string>();
    const examples: string[] = [];
    for (const m of matches) {
      const trimmed = m.text.trim();
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
      matches: matches.slice(0, MAX_MATCHES_PER_CATEGORY),
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

/** 依据规则收集全部命中（含位置） */
function collectMatches(content: string, rule: Rule): AiTraceMatch[] {
  if (rule.analyze) {
    return dedupeMatches(rule.analyze(content));
  }
  if (!rule.pattern) return [];
  rule.pattern.lastIndex = 0;
  const out: AiTraceMatch[] = [];
  for (const m of content.matchAll(rule.pattern)) {
    if (m[0].trim()) {
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
  }
  return dedupeMatches(out);
}

/** 位置去重（同 start 同 end 视为重复） */
function dedupeMatches(matches: AiTraceMatch[]): AiTraceMatch[] {
  const seen = new Set<string>();
  const out: AiTraceMatch[] = [];
  for (const m of matches) {
    const key = `${m.start}:${m.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

/** 将正文切分为句子（保留标点，含位置） */
export function splitSentences(content: string): AiTraceMatch[] {
  const out: AiTraceMatch[] = [];
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '。' || ch === '！' || ch === '？' || ch === '\n' || ch === '…') {
      pushRange(out, content, start, i + 1);
      start = i + 1;
    }
  }
  pushRange(out, content, start, content.length);
  return out;
}

/** 将正文切分为自然段（按换行，含位置） */
export function splitParagraphs(content: string): AiTraceMatch[] {
  const out: AiTraceMatch[] = [];
  let start = 0;
  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content[i] === '\n') {
      pushRange(out, content, start, i);
      start = i + 1;
    }
  }
  return out;
}

/** 将命中位置扩展为完整句子（供定点修复以句子为粒度改写） */
export function expandToSentence(content: string, start: number, end: number): AiTraceMatch {
  let s = 0;
  for (let i = Math.min(start, content.length - 1); i >= 0; i--) {
    const ch = content[i];
    if (ch === '。' || ch === '！' || ch === '？' || ch === '\n' || ch === '…') {
      s = i + 1;
      break;
    }
  }
  let e = content.length;
  for (let i = end; i < content.length; i++) {
    const ch = content[i];
    if (ch === '。' || ch === '！' || ch === '？' || ch === '\n' || ch === '…') {
      e = i + 1;
      break;
    }
  }
  return { text: content.slice(s, e), start: s, end: e };
}

function pushRange(out: AiTraceMatch[], content: string, start: number, end: number): void {
  const text = content.slice(start, end);
  if (text.trim()) out.push({ text, start, end });
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
