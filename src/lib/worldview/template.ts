// ============================================================================
// 世界观生成器（本地模板）
// 依据：spec 4.3 节 · 设定工坊
// 说明：P3 LLM 适配层完成后，将由 src/lib/llm/generators/worldview.ts 接管真实 AI 生成。
//       本模块提供基于题材与简介的本地模板生成能力，作为离线 fallback 与开发期占位。
// ============================================================================
import type { Genre, Worldview } from '@/types';
import { generateId } from '@/lib/utils';

export interface WorldviewGenerationInput {
  projectId: string;
  genre: Genre;
  title: string;
  summary: string;
}

interface GenreTemplate {
  worldStructure: string;
  powerSystem: string;
  geography: string;
  era: string;
  factions: string;
  rules: string[];
}

// ============ 题材 → 世界观模板映射 ============
const GENRE_TEMPLATES: Record<Genre, GenreTemplate> = {
  玄幻: {
    worldStructure:
      '九重天渊、三千大道并存的修真世界。凡、灵、仙三界分层，每个界面都有独立的天道法则与生存规则。',
    powerSystem:
      '修炼体系：炼气 → 筑基 → 金丹 → 元婴 → 化神 → 渡劫 → 大乘。每个大境界分前/中/后期三阶。',
    geography: '东荒大陆、南明离火域、西漠佛国、北极玄冰海、中州祖地五大区域并存。',
    era: '末法时代终结、灵气复苏的太初创世纪元。',
    factions: '正道六宗、魔门四派、妖族三窟、散修联盟四方势力制衡。',
    rules: [
      '修为不可越阶挑战（金丹以下不可破元婴）',
      '天道反噬：夺舍、杀亲、逆伦等行为必降雷劫',
      '灵根决定起点，但悟性决定上限',
      '凡人寿命百年，筑基后寿元暴涨',
    ],
  },
  言情: {
    worldStructure:
      '现代都市背景下的情感世界，表层是职场与社交，里层是阶级与家族博弈。',
    powerSystem: '无超自然力量体系，主要靠家世、人脉、颜值与情商作为资本。',
    geography: '一线城市金融区、海岛度假地、老宅家族庄园三组主要场景。',
    era: '当代都市，物欲与情感交织的快节奏时代。',
    factions: '豪门家族、新兴资本、白领精英、艺术圈层四类人物生态。',
    rules: [
      '情感发展遵循"相遇—误会—升温—危机—和解"五段式',
      '阶级差距必须实质性存在（不可仅靠颜值翻盘）',
      '第三者介入仅作为催化剂，不构成主线',
      '结局必须 HE（Happy Ending）',
    ],
  },
  悬疑: {
    worldStructure:
      '表面平静的封闭空间或小镇，掩藏着十几年前的旧案与盘根错节的人际关系。',
    powerSystem: '无超自然元素，依靠刑侦技术、心理画像与逻辑推理。',
    geography: '雾都老城、湖畔孤岛、废弃山寺等具有氛围感的封闭场景。',
    era: '近现代，通讯尚不发达、监控尚不密集的年代。',
    factions: '警方专案组、地方利益集团、受害者家属、神秘旁观者四方角力。',
    rules: [
      '所有线索必须公平呈现给读者（不可藏关键证据）',
      '凶手必须在登场人物范围内（不可中途引入新人）',
      '至少存在一次反转',
      '动机必须合理且可追溯',
    ],
  },
  科幻: {
    worldStructure:
      '近未来或星际文明时代，人类扩展至太阳系/恒星系，AI 与基因改造普及。',
    powerSystem: '科技分级：纳米改造、意识上传、曲速引擎、戴森球能源等。',
    geography: '地球母星、火星殖民地、近地轨道空间站、外星遗迹四类场景。',
    era: '公元 22-30 世纪的人类文明扩张期。',
    factions: '地球联邦、火星独立军、AI 议会、改造人教会四方文明势力。',
    rules: [
      '科技必须基于现有物理学合理推演（不可等同于魔法）',
      'AI 行为受阿西莫夫三定律或其修订版约束',
      '改造人存在伦理代价（不可免费升级）',
      '文明等级差异决定冲突走向',
    ],
  },
  都市: {
    worldStructure:
      '当代都市背景，主线围绕职场、商战或特殊身份展开，主角往往具备隐藏金手指。',
    powerSystem: '系统流/重生流/神医流/赘婿流，每类对应一种"开挂"机制。',
    geography: '都市写字楼、城中村、豪门别墅、夜场酒吧等贴近现实场景。',
    era: '当下，互联网与资本高度发达的当代中国。',
    factions: '豪门家族、互联网新贵、传统行业巨头、白领打工族四方势力。',
    rules: [
      '爽点节奏：每章必有小爽点，每 10 章一个大爽点',
      '反派智商必须在线（不可纯靠运气获胜）',
      '主角能力必须可解释（系统/重生/秘籍）',
      '不涉及真实政治与敏感事件',
    ],
  },
  历史: {
    worldStructure:
      '虚构朝代背景，参考中国某朝代制度（唐/宋/明/清），但允许艺术加工。',
    powerSystem: '权谋、军功、科举、联姻四条上升通道。',
    geography: '京畿、边疆、江南、塞北四类主要地理舞台。',
    era: '虚构王朝的中后期，内忧外患的转折点。',
    factions: '皇室宗亲、世家大族、寒门新贵、外戚宦官四股政治势力。',
    rules: [
      '大历史脉络不可改（朝代终将如何走向大势所趋）',
      '细节可虚构（具体人物、事件、对话可创造）',
      '礼制、官制、服饰必须符合时代特征',
      '权谋必须有逻辑链，不可纯靠运气',
    ],
  },
  末世: {
    worldStructure:
      '末日降临后的废土世界，丧尸/异变/天灾/资源枯竭之一作为主要威胁。',
    powerSystem: '异能觉醒流（火/冰/电/精神等系）或丧尸病毒变异流。',
    geography: '废弃都市、地下避难所、辐射荒野、最后基地四类场景。',
    era: '末日后 3-5 年，幸存者组织化的初期。',
    factions: '官方军方残余、民间基地、流浪商队、变异者族群四方势力。',
    rules: [
      '资源必须稀缺（不可随手获得物资）',
      '异能必须有副作用（不可无限使用）',
      '人性是主要冲突来源（而非丧尸本身）',
      '死亡必须有代价（重要角色可死）',
    ],
  },
  游戏: {
    worldStructure:
      '高度游戏化的世界，存在系统面板、数值等级、副本与奖励机制。',
    powerSystem: '等级 + 职业 + 技能 + 装备四维体系，每项有明确数值。',
    geography: '主城、新手村、副本、野外地图四类游戏化场景。',
    era: '游戏内纪元，或玩家穿越进游戏世界的时间点。',
    factions: '玩家公会、NPC 王国、隐藏 BOSS、神秘 NPC 四类势力。',
    rules: [
      '数值变化必须可量化（每章有数据更新）',
      '副本必须有规则（不可乱开金手指）',
      'PK 与死亡必须有惩罚机制',
      '隐藏任务必须可追溯（埋伏笔）',
    ],
  },
  宫斗: {
    worldStructure:
      '虚构王朝的后宫舞台，三宫六院、前朝后宫联动，权力斗争细腻。',
    powerSystem: '圣宠、子嗣、母家势力、心机手腕四项后宫资本。',
    geography: '东西六宫、御花园、太后寝宫、冷宫四类主要场景。',
    era: '虚构盛世王朝的中期，皇权稳定但暗流涌动。',
    factions: '皇后党、贵妃党、太后党、新晋嫔妃四方后宫势力。',
    rules: [
      '后宫位份晋升必须有明确路径（不可越级）',
      '圣宠起伏必须有具体原因（不可纯靠运气）',
      '前朝动向必须影响后宫',
      '女主智商必须在线（不可傻白甜）',
    ],
  },
  其他: {
    worldStructure: '依据题材特性定制的开放世界架构，留待创作者细化。',
    powerSystem: '依据题材特性设计的能力体系。',
    geography: '依据题材特性设定的主要场景。',
    era: '依据题材特性选择的时代背景。',
    factions: '依据题材特性划分的利益集团。',
    rules: [
      '设定与正文保持一致',
      '核心规则需在前期明确',
      '修改后需同步全量记忆库',
    ],
  },
};

/**
 * 基于题材与简介生成本地世界观模板。
 * 输出已包含 project 关联与默认未锁定状态，可直接保存到数据库。
 */
export function generateWorldviewTemplate(input: WorldviewGenerationInput): Worldview {
  const template = GENRE_TEMPLATES[input.genre] ?? GENRE_TEMPLATES['其他'];
  const now = Date.now();

  // 若简介提供额外信息，附加到世界架构尾部（作为创作者补充提示）
  const extraHint = input.summary.trim()
    ? `\n\n（项目简介提示：${input.summary.trim()}）`
    : '';

  return {
    id: generateId('wv'),
    projectId: input.projectId,
    worldStructure: template.worldStructure + extraHint,
    powerSystem: template.powerSystem,
    geography: template.geography,
    era: template.era,
    factions: template.factions,
    rules: [...template.rules],
    locked: false,
    updatedAt: now,
  };
}

/**
 * 判断世界观是否已实质性填写（用于 UI 引导）
 */
export function isWorldviewEmpty(wv: Worldview | null | undefined): boolean {
  if (!wv) return true;
  return [wv.worldStructure, wv.powerSystem, wv.geography, wv.era, wv.factions].every(
    (v) => !v || v.trim().length === 0
  ) && wv.rules.length === 0;
}

/**
 * 验证规则数组（去重 + 去空）
 */
export function normalizeRules(rules: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const r of rules) {
    const trimmed = r.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * 解析一条可能含换行的规则输入为多条规则（支持一次粘贴多行，每行一条）。
 * 兼容中文/英文换行、前后空白与多余空行；顺带去重。
 */
export function parseRulesInput(input: string): string[] {
  const lines = input
    .split(/\r?\n+/) // 支持 \r\n 与 \n，压缩连续空行
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return normalizeRules(lines);
}
