// ============================================================================
// 写作技能导入解析器
// 职责：把「任意平台/网站的 skill 原文」（SKILL.md / README / 教程正文等）解析
//       成可入库的 WritingSkill 草稿。纯函数、无 LLM、无网络，确定性可测。
// 支持来源形态：
//   1. GitHub 仓库 / blob 路径 → 归一化为 raw 直链
//   2. HuggingFace space → raw 直链
//   3. 其它任意含 frontmatter 或标题正文的网页文本
// ============================================================================
import type { WritingSkill, SkillSourceType } from '@/types';

/** 解析产出的技能草稿（不含 id/builtin/enabled/时间戳，由调用方补齐） */
export interface SkillImportDraft {
  name: string;
  category: WritingSkill['category'];
  source: SkillSourceType;
  sourceName?: string;
  sourceUrl?: string;
  author?: string;
  version?: string;
  description: string;
  instruction: string;
}

/** 从 SKILL 名推导适用环节 */
function classifyCategory(name: string, content: string): WritingSkill['category'] {
  const n = `${name}\n${content}`.toLowerCase();
  if (/(大纲|设定|世界观|outline|world)/.test(n)) return 'outline';
  if (/(审稿|点评|评审|校对|review|critique)/.test(n)) return 'review';
  if (/(修改|改写|润色|重写|rewrite|polish|edit)/.test(n)) return 'rewrite';
  if (/(开篇|开头|钩子|断章|悬念|标题|hook|catch)/.test(n)) return 'hook';
  if (/(情节|剧情|节奏|冲突|反转|爽点|plot|arc|pacing)/.test(n)) return 'plot';
  if (/(文风|文笔|语气|叙事|风格|叙述|style|tone|voice)/.test(n)) return 'style';
  return 'other';
}

/** 剖析 YAML frontmatter（--- 包裹的第一段），返回字段与正文 */
export function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!m) return { fields: {}, body: raw.trim() };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fields[key] = val;
  }
  return { fields, body: raw.slice(m[0].length).trim() };
}

/** 多条候选行里挑第一个非空值 */
function pick(...vals: (string | undefined)[]): string | undefined {
  return vals.find((v) => v && v.trim());
}

/**
 * 把技能原文解析为草稿。
 * @param raw 原文（Markdown / 文本）
 * @param name 兜底名称（如从 URL 文件名推断）
 * @param sourceUrl 来源链接
 * @param sourceType 来源类型
 */
export function parseSkillMarkdown(
  raw: string,
  name: string,
  sourceUrl?: string,
  sourceType: SkillSourceType = 'web',
  sourceName?: string
): SkillImportDraft {
  const trimmed = (raw || '').trim();
  const { fields, body } = parseFrontmatter(trimmed);
  const fName = pick(fields.name, fields.title);
  const fDesc = pick(fields.description, fields.summary);
  const fAuthor = pick(fields.author, fields.creator);
  const fVersion = pick(fields.version);

  const finalName = (fName || name).trim() || '未命名技能';
  const description = (fDesc || '').trim().slice(0, 120);
  const category = classifyCategory(finalName, `${fields.category ?? ''} ${body}`);

  // 指令正文：优先取 frontmatter 后的正文；正文过短时兜底整段原文
  let instruction = body;
  if (instruction.length < 20 || instruction.includes('usage') || instruction.includes('when to use')) {
    // 某些 skill 站点正文以"## Usage / 何时使用"开头，正文在后续标题块，直接保留正文即可
  }
  instruction = instruction.trim();

  return {
    name: finalName,
    category,
    source: sourceType,
    sourceName: sourceName || (sourceType === 'github' ? 'GitHub' : sourceType === 'huggingface' ? 'HuggingFace' : '网站'),
    sourceUrl: sourceUrl && sourceUrl.trim() ? sourceUrl.trim() : undefined,
    author: fAuthor ? fAuthor.trim() : undefined,
    version: fVersion ? fVersion.trim() : undefined,
    description,
    instruction,
  };
}

/**
 * 把 GitHub / HuggingFace 等页面 URL 归一化为可直接 fetch 的 raw 直链。
 * 返回 null 表示无法识别（将视为普通网页直链）。
 */
export function normalizeRawUrl(url: string): string | null {
  const u = url.trim();
  // GitHub blob / blob/ 页 → raw.githubusercontent.com
  let m = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/(.+)$/i.exec(u);
  if (m) {
    const [, owner, repo, rest] = m;
    const [branch, ...pathParts] = rest.split('/');
    if (branch && pathParts.length) {
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join('/')}`;
    }
  }
  // GitHub 仓库首页（无 blob）→ 尝试 SKILL.md => 需要分支推断，交由 API 层处理，直接返回 null 由悬空策略兜底
  m = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/?$/i.exec(u);
  if (m) {
    return null; // 仓库地址由 API 层尝试常见路径
  }
  // HuggingFace space 文件 → hf-proxy raw
  m = /^https:\/\/huggingface\.co\/spaces\/([\w.-]+)\/([\w.-]+)\/blob\/(.+)$/i.exec(u);
  if (m) {
    const [, owner, space, rest] = m;
    const [revision, ...pathParts] = rest.split('/');
    if (revision && pathParts.length) {
      return `https://huggingface.co/spaces/${owner}/${space}/raw/${revision}/${pathParts.join('/')}`;
    }
  }
  // raw 直链（已经是可直接 fetch 的 md 文本）
  if (/\.(md|markdown|txt)$/i.test(u) && /^(https?:\/\/)/.test(u)) {
    return u;
  }
  return u; // 其余当作可直接 fetch 的 URL
}