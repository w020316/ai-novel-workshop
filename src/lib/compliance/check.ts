// ============================================================================
// 投稿合规体检（Pre-Submission Compliance Check）
// 依据：网文平台（番茄/起点/七猫/晋江等）与写作软件在收录、签约、上架前
//       通常会对内容做「敏感/违规扫描 + AI 痕迹评估 + 格式规范性检查」。
//       本模块在**导出/投递前**对章节做一次确定性离线体检，把所有可能挡稿
//       的因素一次性列出，供作者自查修缮。
// 约束：
//   - 全程确定性规则，无 LLM 依赖，稳定可测、零成本。
//   - 体检只是“自查提示”，**不代表承诺通过任何平台审核**；最终是否符合
//     各平台条款，由作者自行核对平台规则并对此负责。
//   - 命中“高危内容”仅提示“请按平台条款自行删改/软处理”，不代做内容
//     规避判断，避免引导规避平台审核。
// 组成：
//   - checkContentCompliance  对文本一次性体检，返回“过审友好度”评分、
//                             各维度结果与处理建议。
// ============================================================================
import { detectAITraces } from '@/lib/humanize/detect';
import { checkOriginality } from '@/lib/originality/check';

export type ComplianceSeverity = 'danger' | 'warn';

export interface ComplianceCategory {
  /** 维度标识 */
  id: string;
  /** 展示名（中文） */
  label: string;
  /** pass=通过 warn=需处理 danger=高危必改 */
  status: 'pass' | 'warn' | 'danger';
  /** 命中条数 */
  count: number;
  /** 命中示例（截取片段） */
  examples: string[];
  /** 处理建议 */
  hint: string;
}

export interface ComplianceReport {
  /** 0-100 过审友好度（越高越省心，仅自检参考） */
  score: number;
  /** 是否“建议可提交自检（仍有剩余 warn 也可先人工复核）” */
  passed: boolean;
  /** 各维度体检结果 */
  categories: ComplianceCategory[];
  /** 需优先处理的项目汇总（按严重度排序） */
  priorities: string[];
}

/** 规则：按维度扫描命中片段 */
interface Rule {
  category: ComplianceCategory['id'];
  severity: ComplianceSeverity;
  label: string;
  pattern: RegExp;
  hint: string;
}

const MAX_EXAMPLES = 3;

/**
 * 规则池。按严重度控制：
 * - banned_content  danger：高风险内容，提示“按平台条款自行删改/软处理”。
 * - ad_spam  warn：广告/引流内容，投稿达标前通常需移除。
 * - format_residue warn：格式/调试/占位残留，编辑器与排版会识别为脏数据。
 */
const RULES: Rule[] = [
  // ---- 高危内容（平台普遍禁止或需严审，提示作者自行处理，不代做规避）----
  {
    category: 'banned_content',
    severity: 'danger',
    label: '露骨的性行为描写',
    pattern: /(酥胸|双峰|丰乳肥臀|粗暴的(贯穿|侵入)|抵死缠绵|呻吟不止|一夜风流)/g,
    hint: '请按平台内容条款，对露骨性描写自行删除或做含蓄化处理（点到即止，不代做规避判断）。',
  },
  {
    category: 'banned_content',
    severity: 'danger',
    label: '毒品/违禁品',
    pattern: /(冰毒|海洛因|摇头丸|麻古|大麻|白粉|k粉|违禁|毒资|运毒|制毒)/g,
    hint: '毒品与违禁品叙述多数平台严禁，请移除或改成合规设定。',
  },
  {
    category: 'banned_content',
    severity: 'danger',
    label: '赌博/开箱下注部署',
    pattern: /(开盘口|下注|赌场|庄家通吃|拉人头|资金盘|洗钱)/g,
    hint: '赌博/资金盘相关内容容易触发风控，请避免详细描写。',
  },
  {
    category: 'banned_content',
    severity: 'warn',
    label: '极端血腥暴力',
    pattern: /(碎尸|挖眼|开膛|剥皮|凌迟|虐杀|分尸|抽筋剔骨)/g,
    hint: '过度的血腥暴力可能被平台下调分级或限制上架，请适度降格。',
  },
  // ---- 广告/引流（投稿前通常需移除）----
  {
    category: 'ad_spam',
    severity: 'warn',
    label: '站外链接 / 联系方式',
    pattern: /(https?:\/\/|www\.|加\s*微信|加V|公众号|QQ\s*群|企鹅群|淘宝|店铺直达|二维码|站外引流)/g,
    hint: '正文出现站外链接或联系方式会被判为营销/引流，请在投稿时清除。',
  },
  // ---- 格式/调试残留（软件识别与排版会判为脏数据）----
  {
    category: 'format_residue',
    severity: 'warn',
    label: 'Markdown 符号残留',
    pattern: /(```|`|!\[|\*\*|__|^#|\-\s|>\s)/g,
    hint: '残留的 Markdown 语法符号会破坏排版，请删除或转为纯文本。',
  },
  {
    category: 'format_residue',
    severity: 'warn',
    label: '占位符 / 待补充',
    pattern: /(此处|这里)+?(待|待补|待插入|占位)|待补充|占位符|TODO|FIXME|xxx|XXX1?|【待/g,
    hint: '占位符与待补充标记表示内容未完成，请在发布前补全或删除。',
  },
  {
    category: 'format_residue',
    severity: 'warn',
    label: 'AI 自报 / 模板结尾',
    pattern: /(作为一个|作为AI|我是语言模型|我无法|很抱歉，我|很抱歉我|抱歉，我作为|纯属虚构|以上内容均为虚构且不构成)/g,
    hint: '正文中自报“AI 身份”或模板化免责声明属于明显的机器残留，请删除。',
  },
];

/** 理想单章字数区间（网文常见） */
const IDEAL_SCALE: readonly [number, number] = [1500, 5000];
/** AI 痕迹 “明显” 的阈值（复用去AI味模块口径） */
const AI_FLAG_THRESHOLD = 6;

/**
 * 对章节正文做投稿前合规体检。
 * @param content 章节正文
 */
export function checkContentCompliance(content: string, liveTitles?: string[]): ComplianceReport {
  const text = content.trim();
  const categories: ComplianceCategory[] = [];
  const priorities: string[] = [];

  // ---- 1) 规则维度（高危内容 / 广告引流 / 格式残留）----
  const byCategory = new Map<
    ComplianceCategory['id'],
    { label: string; examples: string[]; count: number; status: ComplianceSeverity; hint: string }
  >();
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    const seen = new Set<string>();
    const examples: string[] = [];
    let count = 0;
    for (const m of text.matchAll(rule.pattern)) {
      if (m[0].trim()) {
        count++;
        const t = m[0].trim();
        if (!seen.has(t)) {
          seen.add(t);
          examples.push(t.slice(0, 20));
          if (examples.length >= MAX_EXAMPLES) break;
        }
      }
    }
    if (count === 0) continue;
    const prev = byCategory.get(rule.category);
    if (prev) {
      prev.count += count;
      const rest = examples.filter((e) => !prev.examples.includes(e));
      prev.examples = [...prev.examples, ...rest].slice(0, MAX_EXAMPLES);
    } else {
      byCategory.set(rule.category, {
        label: rule.label,
        examples,
        count,
        status: rule.category === 'banned_content' ? 'danger' : 'warn',
        hint: rule.hint,
      });
    }
  }
  for (const [id, { label, examples, count, status, hint }] of byCategory.entries()) {
    categories.push({ id, label, status, count, examples, hint });
    priorities.push(
      `${status === 'danger' ? '必改' : '需处理'}：${label} ×${count}`
    );
  }

  // ---- 2) AI 痕迹密度（复用去AI味模块）----
  const trace = detectAITraces(text);
  const aiFlagged = trace.flagged || trace.totalCount >= AI_FLAG_THRESHOLD;
  const aiDensity =
    trace.totalCount === 0
      ? 0
      : +Math.max(0, Math.min(1, trace.totalCount / (text.length / 200))).toFixed(2);
  if (trace.totalCount > 0) {
    categories.push({
      id: 'ai_trace',
      label: 'AI 痕迹密度',
      status: aiFlagged ? 'warn' : 'pass',
      count: trace.totalCount,
      examples: trace.categories.slice(0, MAX_EXAMPLES).map((c) => `${c.label}×${c.count}`),
      hint:
        aiFlagged
          ? `检测到 ${trace.totalCount} 处 AI 痕迹，建议先“扫描AI痕迹 → 一键去AI味”，再接人工润色。`
          : 'AI 痕迹较少，保持即可。',
    });
    if (aiFlagged) priorities.push(`需处理：AI 痕迹 ${trace.totalCount} 处（密度 ${aiDensity}）`);
  }

  // ---- 3) 章节尺度（字数 + 开篇/断章）----
  const han = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const scaleIssues: string[] = [];
  if (han > 0 && han < IDEAL_SCALE[0]) scaleIssues.push(`本章偏短（约 ${han} 字），展开不足`);
  if (han > IDEAL_SCALE[1]) scaleIssues.push(`本章偏长（约 ${han} 字），注意读者疲劳`);
  if (han === 0) scaleIssues.push('正文为空，无法体检');

  const head = text.slice(0, 80);
  const hasHook = /(突然|竟|却|杀|死|血|刀|危险|秘密|阴谋|契约|不可能|失踪|背叛|惊变)/.test(head);
  const tail = text.slice(-60);
  const hasCliff = /(…|\.\.\.|？|难道|却又|就在这时|随即|只见)/.test(tail);
  if (han > 0) {
    if (!hasHook) scaleIssues.push('开篇缺少钩子，建议开头抛出一个悬念/冲突');
    if (!hasCliff) scaleIssues.push('章末缺少断章悬念，建议留一个反转/待解伏笔');
  }
  categories.push({
    id: 'chapter_scale',
    label: '章节尺度与开篇断章',
    status: scaleIssues.length === 0 ? 'pass' : 'warn',
    count: scaleIssues.length,
    examples: scaleIssues.slice(0, MAX_EXAMPLES),
    hint:
      scaleIssues.length === 0
        ? '字数与开篇/断章均在合理区间。'
        : scaleIssues.join('；') + '。',
  });
  if (scaleIssues.length > 0) priorities.push(`建议优化：${scaleIssues.join('；')}`);


  // ---- 4) 原创性查重（复用作品库，命中即提示避免复刻平台代表作）----
  const orig = checkOriginality(text, { liveTitles });
  if (orig.hits.length > 0) {
    categories.push({
      id: 'originality',
      label: '原创性 / 平台代表作撞梗',
      status: 'warn',
      count: orig.hits.length,
      examples: orig.hits.slice(0, MAX_EXAMPLES).map((h) => '《' + h.workTitle + '》·' + h.matched),
      hint: orig.hints.join('；'),
    });
    priorities.push('需处理：可能与平台代表作撞梗 ' + orig.hits.length + ' 处（' + orig.hits.map((h) => h.workTitle).join('、') + '）');
  }

  // ---- 汇总评分（100 起扣，严重度加权）----
  let score = 100;
  const dangerCount = categories.reduce((s, c) => (c.status === 'danger' ? s + c.count : s), 0);
  const warnCount = categories.reduce((s, c) => (c.status === 'warn' ? s + c.count : s), 0);
  const hasDanger = dangerCount > 0;

  // 高危内容：一票强制拉低（单项扣足，但不为负）
  if (hasDanger) score -= 40 + Math.min(30, dangerCount * 5);
  // 一般需处理项：线性扣分
  score -= Math.min(35, warnCount * 3);
  // AI 痕迹额外扣分：越密越减分
  score -= Math.max(0, Math.min(15, trace.totalCount));

  // 内容为空直接判不通过防止得分虚高
  if (han === 0) score = 0;

  score = Math.max(0, Math.min(100, Math.round(score)));

  // 排序：danger 优先，其次需要处理，最后 pass
  const order = { danger: 0, warn: 1, pass: 2 } as const;
  categories.sort((a, b) => order[a.status] - order[b.status]);

  const passed = score >= 70 && !hasDanger;

  return { score, passed, categories, priorities };
}