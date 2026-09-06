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
  {
    name: '单章五件套 · 拆书自查',
    category: 'plot',
    source: 'builtin',
    sourceName: '网文拆书八步法 + 「我不是码神」专属数据库思路',
    description: '每章按拆书五件套编排与自查：核心目标、开篇钩子、核心冲突、爽点、章末悬念。',
    instruction:
      '【单章五件套】\n每章写作前先明确、写作后自查以下五件，缺哪件补哪件：\n一、本章核心目标——这一章只完成一个核心任务（推进主线/立人设/埋伏笔三选一为主），禁止多目标塞爆。\n二、开篇钩子——前300字用冲突、危机或反常画面抓住读者，不铺陈背景。\n三、核心冲突——本章的对抗具体可见，主角必须解决或恶化一个问题。\n四、爽点/情绪点——给读者明确的情绪回报（打脸/反转/进境/释疑），可感可验证。\n五、章末悬念——结尾留"然后呢"的钩子，逼读者追下一章。',
  },
  {
    name: '高级对白四件套',
    category: 'style',
    source: 'builtin',
    sourceName: '「网文资料菌」第144集：高级对白公式',
    description: '对白＝人物声音＋各自目的＋潜台词错位＋局面变化，拒绝假对话。',
    instruction:
      '【对白要求·四件套】\n一、人物声音：每个角色说话方式不同（用词/句式/语气贴合人设），遮住名字能认出是谁。\n二、各自目的：对话双方各有所图，台词为各自目的服务，不是为交代信息给读者。\n三、潜台词错位：嘴上说A心里想B，答非所问、避重就轻，让张力浮在水面下。\n四、局面变化：一段对话结束时，两人关系、信息差或力量对比必须与开始时不同；原地打转的寒暄直接删除。',
  },
  {
    name: '群像四件套 · 让配角活过来',
    category: 'style',
    source: 'builtin',
    sourceName: '「网文资料菌」第142集：群像公式',
    description: '群像＝记忆钩子＋私人人生＋关系反光＋共同目标，配角不再是工具人。',
    instruction:
      '【群像写法·四件套】\n一、记忆钩子：每个重要配角给一个独特记忆点（口头禅/怪癖/外形特征），一笔立住。\n二、私人人生：配角有自己的目标与生活轨迹，不是只在主角需要时才出现。\n三、关系反光：用配角的视角与反应侧写主角，让主角形象更立体。\n四、共同目标：群像行动时围绕同一目标分工，各有功能位，避免乌合之众式凑数。',
  },
  {
    name: '期待感三层引擎',
    category: 'plot',
    source: 'builtin',
    sourceName: '「猫神写作」第51集：期待感写法',
    description: '微观（矛盾将爆即断+信息不对称）/中观（阶段性大奖+压抑释放）/宏观（终极悬念+碎片揭秘）三层期待感。',
    instruction:
      '【期待感设计·三层】\n一、微观（章内）：矛盾即将爆发的瞬间戛然而止（高潮前断章）；善用信息不对称——让读者知道主角未知的危机，或知道主角藏着的反杀底牌而配角全在嘲讽，读者等着看好戏。\n二、中观（卷内）：给主角设定具象化的阶段性大奖（如「三年之约」式的明确目标）；通往目标的路上层层铺垫加码，让读者看到希望但不轻易满足，压抑与释放交替抬升爽感。\n三、宏观（全书）：埋一个足以颠覆世界观的终极悬念（天坑）；每隔几万字给出新线索碎片，像拼图一样让读者逐步接近真相，长期锁住注意力。',
  },
  {
    name: '顶级反派四维度',
    category: 'plot',
    source: 'builtin',
    sourceName: '「猫神写作」第52集：反派塑造',
    description: '宏大动机＋绝对压迫感＋反差魅力＋落幕仪式感——反派是主角的镜子。',
    instruction:
      '【反派塑造·四维度】\n一、宏大动机：反派认为自己是英雄，动机逻辑自洽，不是为坏而坏。\n二、绝对压迫感：让反派比主角更努力、更聪明、资源更强，胜负才有含金量；禁止为衬托主角而削弱反派。\n三、反差魅力：给反派一个弱点或坚持，展现反差魅力，让读者又恨又叹。\n四、落幕仪式感：反派退场要有仪式感，呼应并升华全书主题；反派是主角的镜子——他是主角可能成为的人。',
  },
  {
    name: '神级反转四招',
    category: 'plot',
    source: 'builtin',
    sourceName: '「猫神写作」第53集：反转技巧',
    description: '灯下黑/剥洋葱/期待反向对冲/偷梁换柱——伏笔要深且可见，反转要为情感服务。',
    instruction:
      '【反转设计·四招】\n一、灯下黑（逻辑层）：答案藏在所有人眼皮底下，回头重读处处是线索。\n二、剥洋葱（人设层）：角色真相分多层逐层揭开，每层推翻上一层认知。\n三、期待反向对冲：读者以为的走向全力铺垫，然后在情绪最高点反向兑现。\n四、偷梁换柱（因果层）：看似成立的因果链被替换关键一环，真相揭晓时所有不合理全变成合理。\n原则：伏笔要深且可见（二刷能找到）；反转要为人物情感服务而非为转而转；节奏要稳，一次讲透一层。',
  },
  {
    name: '逻辑三账自检',
    category: 'review',
    source: 'builtin',
    sourceName: '「网文资料菌」第143集：剧情逻辑优化',
    description: '读者契约＋五格因果链＋情绪/因果/主线三笔账，剧情告别漏洞。',
    instruction:
      '【逻辑自检·三招】\n一、读者契约优先：先确认本章兑现了题材承诺（读者契约），再校对现实常识——逻辑服务于故事，而非取代故事。\n二、五格因果链：每个重要结果都要能补齐「欲望→选择→行动→阻力→结果」，动机不空、结果有因、赢了有变。\n三、每单元还三笔账：情绪账（读者情绪是否有起伏回报）、因果账（事件间是否互为因果而非并列发生）、主线账（是否推进了主线锚点）——三账缺一即注水。',
  },
  {
    name: '情绪压制与前置期待',
    category: 'plot',
    source: 'builtin',
    sourceName: '甲鱼不是龟（千万稿费作者）：网文挣钱的底层逻辑',
    description: '开头=主线第一引爆点；冲突前铺垫主角底牌（前置期待），敌友群三方情绪塑造，爽点=情绪结果的兑现。',
    instruction:
      '【情绪压制与前置期待】\n一、开头=第一引爆点：开篇冲突不是氛围装饰，而是主线剧情的第一引爆点；读者真正追的是「压制解除后能兑现的情绪结果」，先想清楚兑现什么，再设计压制。\n二、前置期待：核心冲突爆发前，必须为主角铺垫破局、翻盘、逆袭的潜力与底牌（金手指、隐秘身份、贵人、契约等），让读者笃定「他能赢」，才敢放心代入当下的憋屈。\n三、敌友群三方塑造：敌方要压出恨意（作恶具体可感）；友方要撑起底气（关键时刻不缺位）；群众负责见证与反差（围观、震惊、传闻扩散），三方合力把剧情张力拉满。\n四、情绪结果兑现：爽点不是「发生了一件事」，而是读者被压制的情绪获得回报——打脸、翻盘、扬名、进境，前面压的每一分恨意都必须有明确出口。\n五、目标三层透明：在主线节点处写清主角「现状—中期目标—最终目标」，读者随时知道自己等的是什么。',
  },
  {
    name: '三线并行·剧情跌宕',
    category: 'plot',
    source: 'builtin',
    sourceName: '啊云云：写小说关键点④ 如何让剧情跌宕起伏',
    description: '主线50-60%/支线30-40%/暗线10-20%，六大并行技巧与新手五避坑，让剧情立体跌宕不注水。',
    instruction:
      '【三线并行·剧情跌宕】\n一、三线分工：主线=故事脊柱，驱动发展（占50-60%篇幅）；支线=枝叶，丰富世界观、塑造配角（30-40%）；暗线=暗流，埋真相、制造反转（10-20%）。\n二、六大并行技巧：①节奏交错——两线交替推进，A线紧张时切B线喘息再回拉；②伏笔分层埋——明伏笔当章可见，暗伏笔多章后回收；③信息差控制——让读者比角色多知道或少知道一点，制造悬念或优越感；④角色联动——支线人物后期反哺主线（救场/背叛/揭秘）；⑤三线合流——在卷末或大高潮让三线撞进同一事件引爆；⑥收束管理——每条线登记起点与回收点，严禁烂尾。\n三、新手五避坑：只有主线没支线（单调）/ 支线喧宾夺主（跑偏）/ 暗线突然出现（没铺垫就反转）/ 三线同时高潮（互相稀释）/ 伏笔不回收（失信读者）。',
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