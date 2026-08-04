// ============================================================================
// 人物档案生成器（本地模板）
// 依据：spec 4.3 节 · 设定工坊
// 说明：P3 LLM 适配层完成后，将由 src/lib/llm/generators/character.ts 接管真实 AI 生成。
//       本模块提供基于关键词的本地模板生成能力，作为离线 fallback 与开发期占位。
// ============================================================================
import type { Character, CharacterRole, CharacterRelation, Genre } from '@/types';
import { generateId } from '@/lib/utils';

export interface CharacterGenerationInput {
  projectId: string;
  keywords: string; // 用户输入的关键词（如"冷酷剑修""腹黑皇子"）
  name: string; // 用户提供的姓名（可选，可由生成器命名）
  role: CharacterRole;
  genre?: Genre;
}

interface RoleTemplate {
  appearance: (keywords: string[]) => string;
  personality: (keywords: string[]) => string;
  catchphrase: (keywords: string[]) => string;
  background: (keywords: string[]) => string;
  motivation: (keywords: string[]) => string;
  weakness: (keywords: string[]) => string;
  growthArc: (keywords: string[]) => string;
  speechStyle: (keywords: string[]) => string;
  behaviorPattern: (keywords: string[]) => string;
}

const joinKeywords = (keywords: string[], fallback: string): string => {
  if (keywords.length === 0) return fallback;
  return keywords.slice(0, 3).join('、');
};

const ROLE_TEMPLATES: Record<CharacterRole, RoleTemplate> = {
  protagonist: {
    appearance: (k) =>
      `身形挺拔，眼神锐利。${joinKeywords(k, '气质沉稳')}的气息让人难以忽视。常着素色长衫，腰间悬一柄古朴之物。`,
    personality: (k) =>
      `坚韧、果决、心思缜密。表面平和，内心却藏着不为人知的执念。${joinKeywords(k, '外冷内热')}的特质使其在关键时刻爆发出惊人潜力。`,
    catchphrase: () => '我意已决，无需多言。',
    background: (k) =>
      `出身寒微，幼年经历变故，被卷入更大格局。${joinKeywords(k, '孤独成长')}的过程中练就一身本领与隐忍。`,
    motivation: (k) => `守护所珍视之人，探寻${joinKeywords(k, '当年真相')}。`,
    weakness: () => '过于执着旧事，容易在涉及过往时判断失准。',
    growthArc: (k) =>
      `从孤身一人到信任伙伴，从被动承受到主动出击。${joinKeywords(k, '突破自我')}的过程贯穿全书。`,
    speechStyle: () => '简短有力，少用虚词，关键处一字一顿。',
    behaviorPattern: () => '行动先于言辞，遇到危机先观察后出手。',
  },
  supporting: {
    appearance: (k) =>
      `面容清秀，气质温润。${joinKeywords(k, '举止从容')}的姿态令人如沐春风。穿着考究但不张扬。`,
    personality: (k) =>
      `聪慧、体贴、八面玲珑。${joinKeywords(k, '善解人意')}的特质使其成为主角最信赖的伙伴。`,
    catchphrase: () => '别急，咱们慢慢来。',
    background: (k) =>
      `出身良好，受过完整教育。${joinKeywords(k, '世家子弟')}的身份带来资源也带来束缚。`,
    motivation: (k) => `协助主角达成目标，同时寻找${joinKeywords(k, '自己的归宿')}。`,
    weakness: () => '过于在意他人感受，关键时刻难以做出冷酷决断。',
    growthArc: () => '从依附他人到独立担当，找到属于自己的位置。',
    speechStyle: () => '语气温和，多用劝慰与协商之词。',
    behaviorPattern: () => '善用资源与人脉，能不动手就不动手。',
  },
  antagonist: {
    appearance: (k) =>
      `五官深邃，目光阴鸷。${joinKeywords(k, '气场压抑')}的存在感令人不寒而栗。衣着华贵但暗色为主。`,
    personality: (k) =>
      `城府极深，心思缜密。表面优雅，内心却燃烧着${joinKeywords(k, '执念与仇恨')}。`,
    catchphrase: () => '棋局已开，无人能退。',
    background: (k) =>
      `曾是天之骄子，因一场变故性情大变。${joinKeywords(k, '曾经的光环')}化作今日的阴影。`,
    motivation: (k) => `证明自己的选择才是正确的，不惜以${joinKeywords(k, '一切为代价')}。`,
    weakness: () => '执念过深，对涉及旧事的人事物判断失准。',
    growthArc: () => '从纯粹的反派到逐渐揭示动机，最终在结局迎来救赎或陨落。',
    speechStyle: () => '言辞优雅但暗藏机锋，多用比喻与暗示。',
    behaviorPattern: () => '运筹帷幄，喜借刀杀人，绝少亲自动手。',
  },
  minor: {
    appearance: (k) =>
      `相貌普通，气质平凡。${joinKeywords(k, '邻家气质')}让人容易忽略。衣着朴素。`,
    personality: (k) =>
      `普通人的普通心性，胆小、爱计较但也有温情。${joinKeywords(k, '市井气')}的特质鲜明。`,
    catchphrase: () => '哎哟，这可咋办啊。',
    background: (k) =>
      `市井出身，生活困顿。${joinKeywords(k, '平凡生活')}因主角的出现而被打破。`,
    motivation: () => '活下去，照顾好家人。',
    weakness: () => '贪小便宜，关键时刻容易动摇。',
    growthArc: () => '从旁观者到被动卷入，最终在关键时刻做出选择。',
    speechStyle: () => '口语化，多用俗语与俚语。',
    behaviorPattern: () => '趋利避害，遇事先观望。',
  },
};

const ROLE_LABEL: Record<CharacterRole, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '次要',
};

/**
 * 从关键词字符串中提取标签数组
 */
export function parseKeywords(keywords: string): string[] {
  return keywords
    .split(/[\s,，、；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
}

/**
 * 基于关键词生成本地人物档案模板
 */
export function generateCharacterTemplate(input: CharacterGenerationInput): Character {
  const template = ROLE_TEMPLATES[input.role];
  const keywords = parseKeywords(input.keywords);
  const now = Date.now();

  const name = input.name.trim() || generateDefaultName(input.role);

  return {
    id: generateId('char'),
    projectId: input.projectId,
    name,
    role: input.role,
    appearance: template.appearance(keywords),
    personality: template.personality(keywords),
    catchphrase: template.catchphrase(keywords),
    background: template.background(keywords),
    motivation: template.motivation(keywords),
    weakness: template.weakness(keywords),
    growthArc: template.growthArc(keywords),
    relationships: [],
    speechStyle: template.speechStyle(keywords),
    behaviorPattern: template.behaviorPattern(keywords),
    locked: false,
    updatedAt: now,
  };
}

const SURNAMES = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
const NAME_CHARS = ['云', '霜', '寒', '渊', '岚', '澈', '瑜', '瑾', '珩', '璟', '璃', '玦', '尘', '澈', '枫', '澜', '羲', '辰', '晏', '辞'];

function generateDefaultName(role: CharacterRole): string {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  const char1 = NAME_CHARS[Math.floor(Math.random() * NAME_CHARS.length)];
  const char2 = NAME_CHARS[Math.floor(Math.random() * NAME_CHARS.length)];
  // 主角与反派用双字名，配角与次要角色随机
  if (role === 'protagonist' || role === 'antagonist' || Math.random() > 0.5) {
    return surname + char1 + char2;
  }
  return surname + char1;
}

/**
 * 角色标签
 */
export function getRoleLabel(role: CharacterRole): string {
  return ROLE_LABEL[role];
}

/**
 * 角色标签样式
 */
export function getRoleBadgeClass(role: CharacterRole): string {
  switch (role) {
    case 'protagonist':
      return 'bg-brand-100 text-brand-700';
    case 'supporting':
      return 'bg-sky-100 text-sky-700';
    case 'antagonist':
      return 'bg-accent-100 text-accent-700';
    case 'minor':
      return 'bg-stone-100 text-stone-600';
  }
}

/**
 * 根据现有人物列表生成关系建议
 */
export function suggestRelations(
  characters: Character[],
  currentId: string
): CharacterRelation[] {
  // 简单规则：主角与其他主角/配角 → 同伴；反派与主角 → 仇敌
  const current = characters.find((c) => c.id === currentId);
  if (!current) return [];

  return characters
    .filter((c) => c.id !== currentId)
    .map((c) => {
      let relation = '认识';
      if (current.role === 'protagonist' && c.role === 'antagonist') {
        relation = '宿敌';
      } else if (current.role === 'antagonist' && c.role === 'protagonist') {
        relation = '宿敌';
      } else if (
        (current.role === 'protagonist' && c.role === 'supporting') ||
        (current.role === 'supporting' && c.role === 'protagonist')
      ) {
        relation = '伙伴';
      } else if (current.role === 'supporting' && c.role === 'supporting') {
        relation = '同伴';
      }
      return {
        targetId: c.id,
        targetName: c.name,
        relation,
      };
    });
}
