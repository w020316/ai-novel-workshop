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
  {
    name: '网文爽点工程 · 30/40/30 三段式',
    category: 'plot',
    source: 'builtin',
    sourceName: '提取自 webnovel-plan 爽点方法论',
    description: '把每处爽点按"铺垫30%→兑付40%→微反转30%"结构化编排，读着不憋屈不注水。',
    instruction:
      '【爽点工程】\n每处爽点按下述结构编排：\n一、铺垫(约30%篇幅)：建立读者预期、制造反差（当前VS即将展现）、设置信息差（读者知道主角底牌而反派不知道）。\n二、兑付(约40%)：给出触发时机，用动作/对话/结果而非旁白展现，把情绪推到高点。\n三、微反转(约30%)：搞一个"假结束——其实还有更厉害的"，如"你以为这就是我的全力？""说是普通玉佩其实是上古神器还认主了"。\n密度标准：每章≥1个小爽点，每5章≥1个组合爽点，每10-15章≥1个改变主角地位的里程碑爽点。',
  },
  {
    name: '断章钩子 · 章末200字强悬念',
    category: 'hook',
    source: 'builtin',
    sourceName: '番茄爆款 + webnovel-plan',
    description: '章末200字停在强悬念/反转/危机，逼读者追更下一章。',
    instruction:
      '【断章钩子】\n本章结尾必须写进最强的钩子：\n一、话只说一半——关键信息说出一半，另一半留给下一章开头。\n二、突发变故——在读者以为尘埃落定时砸下意外转折。\n三、危机迫近——致命危险的临界点。\n严禁用"睡去/吃饭/总结"平淡收尾（无效断章）。\n焦虑感留在页外：读者合上页面时必须带着明确的"然后呢"的冲动。',
  },
  {
    name: '黄金三章 · 开篇留人',
    category: 'hook',
    source: 'builtin',
    sourceName: '网文黄金三章惯例',
    description: '前三章各完成一个核心任务，让算法与读者都留得住。',
    instruction:
      '【黄金三章】\n第一章：开头300字内必须出现核心冲突/困境 + 金手指首次露面或暗示；钩子出现在最后20-30行内。\n第二章：紧接上章钩子，主角应对，给出一个"小赢或小输"的结果。\n第三章：确立短期目标，明确下一步行动，章末抛新钩子。\n每章有且仅有一个核心任务，避免塞满世界观与身世背景交代（读者不知道主角要干什么=流失）。',
  },
];

function now(): number {
  return Date.now();
}

/** 技能分类白名单：非法值（外部 JSON/导入源）统一回退 other，防止入库后永久不可见 */
const CATEGORY_WHITELIST = new Set<string>(['style', 'plot', 'hook', 'outline', 'rewrite', 'review', 'other']);

function safeCategory(value: unknown): WritingSkill['category'] {
  return typeof value === 'string' && CATEGORY_WHITELIST.has(value)
    ? (value as WritingSkill['category'])
    : 'other';
}

/** 生成不碰撞的技能 id（时间戳+随机数在同毫秒批量导入时有生日碰撞，randomUUID 彻底避免） */
function newSkillId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `skill-${crypto.randomUUID()}`
    : `skill-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** 首次初始化：向空库写入内置技能（幂等）；并增量补齐新增/缺失的内置技能（不覆盖既有的用户启停状态） */
export async function ensureSeedSkills(): Promise<void> {
  const existing = await db.skills.toArray();
  const existingById = new Map(existing.map((s) => [s.id, s]));
  const t = now();
  const rows: WritingSkill[] = BUILTIN_SKILLS.map((b, i) => {
    const id = `builtin-skill-${i + 1}`;
    return {
      ...b,
      id,
      builtin: true,
      enabled: false,
      createdAt: t,
      updatedAt: t,
    } satisfies WritingSkill;
  });
  // 只写入「库中缺失的内置技能」（按确定性 id 匹配），补齐升级增量
  const missing = rows.filter((r) => !existingById.has(r.id));
  if (missing.length > 0) {
    await db.skills.bulkAdd(missing);
  }
}

/** 列出全部技能 */
export async function listSkills(): Promise<WritingSkill[]> {
  return db.skills.orderBy('name').toArray();
}

/** 导出全部技能为可迁移 JSON 字符串（含信息字段，便于换设备/朋友间共享收藏） */
export async function exportSkillsJson(): Promise<string> {
  const all = await db.skills.toArray();
  const payload = all.map((s) => ({
    name: s.name,
    category: s.category,
    source: s.source,
    sourceName: s.sourceName,
    sourceUrl: s.sourceUrl,
    author: s.author,
    version: s.version,
    description: s.description,
    instruction: s.instruction,
  }));
  return JSON.stringify(payload, null, 2);
}

/** 从 JSON 批量导入技能（兼容导出格式；跳过内置同名技能避免覆盖种子）。
 *  @returns 实际导入条数 */
export async function importSkillsJson(text: string): Promise<number> {
  const payload = JSON.parse(text.trim()) as Array<Partial<WritingSkill> & { name?: string; instruction?: string }>;
  if (!Array.isArray(payload)) throw new Error('JSON 需为技能数组');
  const existing = await db.skills.toArray();
  const existingNames = new Set(existing.map((s) => s.name));
  let imported = 0;
  const t = Date.now();
  for (const item of payload) {
    if (!item.name || !item.instruction) continue;
    if (existingNames.has(item.name)) continue; // 跳过同名（防重复堆积与种子覆盖）
    await db.skills.put({
      id: newSkillId(),
      name: item.name,
      category: safeCategory(item.category),
      source: item.source ?? 'custom',
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      author: item.author,
      version: item.version,
      description: item.description ?? '',
      instruction: item.instruction,
      builtin: false,
      enabled: false,
      createdAt: t,
      updatedAt: t,
    } as WritingSkill);
    existingNames.add(item.name);
    imported++;
  }
  return imported;
}

/** 读取单个技能 */
export async function getSkill(id: string): Promise<WritingSkill | undefined> {
  return db.skills.get(id);
}

/** 新增/覆盖技能（自定义或导入） */
export async function saveSkill(skill: Partial<WritingSkill> & { name: string; instruction: string }): Promise<string> {
  const id = skill.id ?? newSkillId();
  const existing = await db.skills.get(id);
  const t = now();
  await db.skills.put({
    id,
    name: skill.name,
    category: safeCategory(skill.category),
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

/** 写作技能应用环节 */
export type SkillStage = 'write' | 'plot' | 'rewrite' | 'review' | 'outline';

/** 各环节默认生效的技能分类：
 *  - write   章节生成：风格/情节/钩子等写作指令全量生效（保留既有行为）
 *  - plot    剧情设计：情节与钩子类生效
 *  - rewrite 一致性修正重写：修改类 + 文风类生效
 *  - review  多平台审稿：审稿类生效
 *  - outline 大纲/分卷规划：大纲类生效 */
const STAGE_CATEGORIES: Record<SkillStage, WritingSkill['category'][]> = {
  write: ['style', 'plot', 'hook', 'outline', 'rewrite', 'review', 'other'],
  plot: ['plot', 'hook', 'other'],
  rewrite: ['rewrite', 'style', 'other'],
  review: ['review', 'other'],
  outline: ['outline', 'other'],
};

/** 当前已启用的技能 */
export async function getEnabledSkills(): Promise<WritingSkill[]> {
  const all = await db.skills.toArray();
  return all.filter((s) => s.enabled);
}

/** 按应用环节筛选已启用技能并拼成注入块。
 *  @param skillIds 可选：仅取指定 ID（用于"本轮生成自由选择技能"）；为空则用全部启用技能 */
export async function buildSkillsPromptForStage(
  stage: SkillStage,
  skillIds?: string[]
): Promise<string> {
  const enabled = await getEnabledSkills();
  const cats = STAGE_CATEGORIES[stage];
  const filtered = enabled.filter(
    (s) => cats.includes(s.category) && (!skillIds || skillIds.includes(s.id))
  );
  return buildSkillsPromptBlock(filtered);
}

/** 列出可被某环节注入的技能（已启用 + 分类匹配），供「本轮选择」UI 使用 */
export async function listStageSkills(stage: SkillStage): Promise<WritingSkill[]> {
  const enabled = await getEnabledSkills();
  const cats = STAGE_CATEGORIES[stage];
  return enabled.filter((s) => cats.includes(s.category));
}

/** 把已启用技能拼成注入 prompt 的块；无启用返回空串（不影响既有行为） */
export function buildSkillsPromptBlock(skills: WritingSkill[]): string {
  const enabled = skills.filter((s) => s.enabled && s.instruction.trim());
  if (enabled.length === 0) return '';
  const parts = enabled.map((s) => `${s.name}\n${s.instruction.trim()}`);
  return `【已启用写作技能 · 请遵守以下额外要求】\n${parts.join('\n\n')}`;
}