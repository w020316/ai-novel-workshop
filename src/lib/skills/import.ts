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

// ---------------- SSRF 防护：URL 目标安全校验 ----------------
// 技能导入需要服务端 fetch 用户提交的任意 URL，属典型的 SSRF 向量。下列纯函数
// 用于判定目标是否指向内网/本地/云元数据保留地址，返回 true 表示应拒绝放行。
// 独立成纯函数便于单测，route 层再叠加 DNS 解析校验做纵深防御。

export const RESERVED_IPV4_RE =
  /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.0\.|192\.168\.|198\.18\.|198\.19\.|224\.|255\.)/;

/** 校验 IPv4 字面量是否落在内网/环回/链路本地/组播等保留段 */
export function isReservedIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((ip || '').trim());
  if (!m) return false;
  for (const oct of m.slice(1)) if (Number(oct) > 255) return false;
  return RESERVED_IPV4_RE.test((ip || '').trim());
}

/** 校验 IPv6 字面量是否为环回/链路本地/唯一本地/文档保留段。
 * 同时处理 IPv4-mapped IPv6（::ffff:0:0/96，含点分与 hex 两种形式）：
 * 例如 ::ffff:127.0.0.1 / ::ffff:7f00:1 实际指向 127.0.0.1，必须按 IPv4 保留段判定。 */
export function isReservedIpv6(ip: string): boolean {
  const low = (ip || '').trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/.exec(low);
  if (mapped) {
    const spec = mapped[1];
    if (spec.includes('.')) return isReservedIpv4(spec);
    // hex 形式 ::ffff:7f00:1 → 127.0.0.1
    const [hiStr, loStr] = spec.split(':');
    const hi = parseInt(hiStr, 16);
    const lo = parseInt(loStr, 16);
    return isReservedIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return low === '::1' || low === '::' || /^fe80:/i.test(low) || /^fc00:/i.test(low) ||
    /^fd/i.test(low) || /^2001:db8:/i.test(low) || /^ff/.test(low);
}

/** 主机名是否明显指向本机/内部网域（localhost、*.local、*.internal 等） */
export function isInternalHostname(host: string): boolean {
  const h = (host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h === 'localhost.localdomain' || h === '0.0.0.0') return true;
  return (
    h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') ||
    h.endsWith('.home.arpa') || h.endsWith('.localdomain')
  );
}

/** 解析 URL 的 hostname（剥离端口），非法 URL 返回 null */
export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** 判定 URL 目标是否命中 SSRF 保留地址（纯静态判定，不解析 DNS）。安全返回 null，危险返回原因。 */
export function checkUrlTarget(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '无效的 URL';
  }
  if (!/^https?:$/i.test(u.protocol)) return '仅支持 http(s) 链接';
  const host = u.hostname;
  if (isInternalHostname(host)) return `不允许访问内部主机：${host}`;
  // IPv6 字面量带方括号，先去掉再判定
  const bare = host.charAt(0) === '[' && host.endsWith(']') ? host.slice(1, -1) : host;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare) && isReservedIpv4(bare)) return `不允许访问内网/本地地址：${bare}`;
  // IPv4-mapped IPv6 含点分后缀，字符白名单需放行「.」再交 isReservedIpv6 判定
  if (/^[0-9a-f:.]+$/i.test(bare) && isReservedIpv6(bare)) return `不允许访问本地/链路本地地址：${bare}`;
  return null;
}

/**
 * 依据：docs eslint 不引第三方运行时解析，DNS 解析后的地址判定交由 route 层
 * 用 node:dns/promises 判断（`checkResolvedTarget`）。此处仅提供纯函数供单测。
 */

// ---------------- 技能分类 ----------------

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

  // 指令正文：取 frontmatter 后的正文（含 "## Usage" 等标题块，由使用者自行取舍）
  const instruction = body.trim();

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