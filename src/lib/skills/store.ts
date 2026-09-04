// ============================================================================
// 写作技能库（Skills）存储与注入
// 依据：友商对标（oh-story-claudecode / human-writing 等 skill 形态）+ 用户需求
//      「将 skills 运用于写作」。技能=自包含指令包：库内可索引/启停，启用者
//      在生成章节/审稿/修改时注入 prompt。
// 说明：纯 Dexie 操作 + 确定性 prompt 块构建；无 LLM、无网络，稳定可测。
// ============================================================================
import { db } from '@/lib/db/schema';
import type { WritingSkill } from '@/types';

/** 内置示例技能（默认禁用，避免改变既有生成行为；用户按需启用） */
const BUILTIN_SKILLS: Omit<WritingSkill, 'id' | 'enabled' | 'createdAt' | 'updatedAt' | 'builtin'>[] = [
  {
    name: '去AI味·像人说话',
    category: 'style',
    source: 'builtin',
    sourceName: '参考 human-writing 思路',
    description: '让成文读起来像一个具体的人在讲述，而非 AI 模板腔。',
    instruction:
      '【写法要求·去AI味】\n避免滥用"不禁/不由/仿佛/一时间/仿佛隔着时空"等AI高频词；少用对称排比与抽象总结。让叙事带叙述者的具体性格与语气：用明确的动作、物件、停顿与口语细节，让文字"长在一个人身上"。宁可留白，不要堆砌四字成语与华丽修饰。',
  },
  {
    name: '开篇三秒钩子',
    category: 'hook',
    source: 'builtin',
    sourceName: '网文开篇惯例',
    description: '每章开头 3 段内立刻接住上一章悬念或抛出新危机，抓住读者。',
    instruction:
      '【开篇要求】\n本章前三段必须做到其一：接住上一章末的断章悬念并即刻推进；或抛出一个反常/危机/冲突画面开场。避免用环境描写与心理独白慢慢铺陈。把最有冲击力的一句话放在段首。',
  },
  {
    name: '网文断章悬念',
    category: 'hook',
    source: 'builtin',
    sourceName: '网文追读惯例',
    description: '章末停在危机爆发瞬间或反转揭晓前，逼读者追更下一章。',
    instruction:
      '【断章要求】\n本章结尾必须停在"险/转/半遮"处：危险逼近的临界点、大反转揭晓前一瞬、或关键信息的只言片语。严禁把冲突彻底解决再收尾。用一句话收束，制造必须看下一章的冲动。',
  },
  {
    name: '对话潜台词化',
    category: 'style',
    source: 'builtin',
    sourceName: '写作技法通识',
    description: '对话不直白说破，用言外之意与反应侧写张力。',
    instruction:
      '【对话要求】\n角色不直接说出心里话：想表达"愤怒"时，让人物用更短、更冷、更错位的话回应；让旁观反应（动作/沉默/物件）替角色表达情绪。删掉"说出了问题所在"式的直白道白，让潜台词浮在水面下。',
  },
  {
    name: '爽文节奏·高频反馈',
    category: 'plot',
    source: 'builtin',
    sourceName: '爽文读者心理',
    description: '冲突/打脸/反转尽快给出可见回报，防止拖沓憋屈。',
    instruction:
      '【节奏要求】\n每个"憋屈=铺垫"之后，尽快给出可见的扬眉吐气或反转反馈，避免连续多章压抑无回报。爽点要具体可感（当众打脸、识破阴谋、实力进境、名声大噪），并让主角的行动而非旁白带来爽感。',
  },
];

function now(): number {
  return Date.now();
}

/** 首次初始化：向空库写入内置技能（幂等） */
export async function ensureSeedSkills(): Promise<void> {
  const count = await db.skills.count();
  if (count > 0) return;
  const t = now();
  const rows: WritingSkill[] = BUILTIN_SKILLS.map((b, i) => ({
    ...b,
    id: `builtin-skill-${i + 1}`,
    builtin: true,
    enabled: false,
    createdAt: t,
    updatedAt: t,
  }));
  await db.skills.bulkAdd(rows);
}

/** 列出全部技能 */
export async function listSkills(): Promise<WritingSkill[]> {
  return db.skills.orderBy('name').toArray();
}

/** 读取单个技能 */
export async function getSkill(id: string): Promise<WritingSkill | undefined> {
  return db.skills.get(id);
}

/** 新增/覆盖技能（自定义或导入） */
export async function saveSkill(skill: Partial<WritingSkill> & { name: string; instruction: string }): Promise<string> {
  const id = skill.id ?? `skill-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const existing = await db.skills.get(id);
  const t = now();
  await db.skills.put({
    id,
    name: skill.name,
    category: skill.category ?? 'other',
    source: skill.source ?? 'custom',
    sourceName: skill.sourceName,
    sourceUrl: skill.sourceUrl,
    author: skill.author,
    version: skill.version,
    description: skill.description ?? '',
    instruction: skill.instruction,
    builtin: skill.builtin ?? false,
    enabled: existing?.enabled ?? skill.enabled ?? false,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  } satisfies WritingSkill);
  return id;
}

/** 启停一个技能 */
export async function toggleSkillEnabled(id: string, enabled: boolean): Promise<void> {
  const s = await db.skills.get(id);
  if (!s) return;
  await db.skills.update(id, { enabled, updatedAt: now() });
}

/** 删除技能 */
export async function deleteSkill(id: string): Promise<void> {
  await db.skills.delete(id);
}

/** 当前已启用的技能 */
export async function getEnabledSkills(): Promise<WritingSkill[]> {
  const all = await db.skills.toArray();
  return all.filter((s) => s.enabled);
}

/** 把已启用技能拼成注入 prompt 的块；无启用返回空串（不影响既有行为） */
export function buildSkillsPromptBlock(skills: WritingSkill[]): string {
  const enabled = skills.filter((s) => s.enabled && s.instruction.trim());
  if (enabled.length === 0) return '';
  const parts = enabled.map((s) => `${s.name}\n${s.instruction.trim()}`);
  return `【已启用写作技能 · 请遵守以下额外要求】\n${parts.join('\n\n')}`;
}