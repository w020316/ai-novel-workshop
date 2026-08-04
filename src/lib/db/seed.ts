// ============================================================================
// 种子数据：题材模板 + 文风预设
// 依据：spec P0.4
// ============================================================================
import { db } from './schema';
import type { GenreTemplate, StylePreset, Genre } from '@/types';

// ============ 题材模板（30+ 个，每个 Genre 提供 3 个流派变体） ============
interface GenreTemplateSeed extends Omit<GenreTemplate, 'id'> {
  variant: string; // 流派名
}

const GENRE_TEMPLATES: GenreTemplateSeed[] = [
  // ---------- 玄幻 ----------
  {
    genre: '玄幻',
    variant: '传统修真',
    pacingRule: '前30章慢热铺世界观，30-100章升级流爽点密集，100章后宏大叙事',
    highlightDesign: '境界突破、宝物获得、强者臣服、复仇打脸',
    readerPreference: '爽感优先，世界观厚重，主角成长曲线明确',
    typicalArcs: ['废柴逆袭', '天才陨落重生', '异界降临', '血脉觉醒'],
  },
  {
    genre: '玄幻',
    variant: '洪荒封神',
    pacingRule: '洪荒背景设定先行，量劫节奏明确，每个大劫前后形成卷',
    highlightDesign: '证道成功、立教传道、量劫度过、圣人降临',
    readerPreference: '历史厚重感，神话色彩，主角慢热但稳',
    typicalArcs: ['量劫求生', '紫霄宫听道', '斩三尸证道', '封神量劫'],
  },
  {
    genre: '玄幻',
    variant: '异界降临',
    pacingRule: '现代与异界双线，前期现代为主后期异界为主，节奏由慢到快',
    highlightDesign: '位面融合、文明碰撞、神祇显现、规则改写',
    readerPreference: '双世界观对比，文化冲突，代入感强',
    typicalArcs: ['位面入侵', '反向穿越', '灵气复苏', '神明陨落'],
  },

  // ---------- 言情 ----------
  {
    genre: '言情',
    variant: '霸总甜宠',
    pacingRule: '情感线为主轴，每10章一个小高潮，误会-和解-升温循环',
    highlightDesign: '初次心动、意外相遇、吃醋占有、表白/求婚',
    readerPreference: '情感细腻，糖与刀交替，HE 结局',
    typicalArcs: ['霸总娇妻', '契约婚姻', '隐婚曝光', '失忆找回'],
  },
  {
    genre: '言情',
    variant: '古风言情',
    pacingRule: '慢节奏铺陈氛围，权谋与情感双线推进',
    highlightDesign: '青梅竹马重逢、家国情怀、生死相许、执手白头',
    readerPreference: '文笔细腻，历史厚重感，虐恋情深',
    typicalArcs: ['青梅竹马', '乱世鸳鸯', '和亲远嫁', '青楼奇女子'],
  },
  {
    genre: '言情',
    variant: '校园青春',
    pacingRule: '校园生活流，按学期推进，小事积累成大转折',
    highlightDesign: '初遇、心动、考试、毕业告白',
    readerPreference: '纯真青涩，甜而不腻，治愈向',
    typicalArcs: ['同桌情缘', '学霸学渣', '暗恋成真', '毕业重逢'],
  },

  // ---------- 悬疑 ----------
  {
    genre: '悬疑',
    variant: '本格推理',
    pacingRule: '谜题前置，线索密集铺设，每章留钩子，结尾大反转',
    highlightDesign: '新线索出现、嫌疑人反转、危机逼近、真相揭露',
    readerPreference: '逻辑严密，氛围紧张，结局意外又合理',
    typicalArcs: ['连环案件', '密室杀人', '暴风雪山庄', '诡计叙述'],
  },
  {
    genre: '悬疑',
    variant: '社会派',
    pacingRule: '案件背后挖掘人性，多视角推进，慢节奏深挖',
    highlightDesign: '动机揭露、人性剖析、社会批判、宿命感',
    readerPreference: '人性深度，社会意义，悲剧美学',
    typicalArcs: ['少年犯罪', '家庭悲剧', '复仇正义', '历史悬案'],
  },
  {
    genre: '悬疑',
    variant: '心理惊悚',
    pacingRule: '心理博弈为主，叙述者不可靠，反转在中后段密集',
    highlightDesign: '认知颠覆、记忆错乱、人格揭示、视角反转',
    readerPreference: '心理压迫感，叙述诡计，结局颠覆',
    typicalArcs: ['不可靠叙述者', '人格分裂', '记忆迷宫', ' Gaslighting'],
  },

  // ---------- 科幻 ----------
  {
    genre: '科幻',
    variant: '硬科幻',
    pacingRule: '设定先行，慢热铺陈科技体系，关键节点引发事件',
    highlightDesign: '科技突破、文明接触、危机爆发、认知颠覆',
    readerPreference: '设定严谨，想象力丰富，人文思考',
    typicalArcs: ['星际探索', '末日生存', 'AI觉醒', '时空悖论'],
  },
  {
    genre: '科幻',
    variant: '赛博朋克',
    pacingRule: '高科技低生活，多势力博弈，主角在夹缝中崛起',
    highlightDesign: '黑客入侵、义体改造、巨型企业阴谋、网络空间决战',
    readerPreference: '反乌托邦，霓虹美学，赛博哲学',
    typicalArcs: ['黑客崛起', '义体改造', 'AI反叛', '巨企陨落'],
  },
  {
    genre: '科幻',
    variant: '太空歌剧',
    pacingRule: '星际帝国博弈，多文明多势力，宏大叙事',
    highlightDesign: '星际战争、文明接触、皇权更迭、宇宙级威胁',
    readerPreference: '宏大叙事，史诗感，文明多元',
    typicalArcs: ['帝国兴衰', '星际远征', '文明接触', '宇宙威胁'],
  },

  // ---------- 都市 ----------
  {
    genre: '都市',
    variant: '都市异能',
    pacingRule: '贴近现实节奏，职场/商战/生活流，爽点来自打脸与逆袭',
    highlightDesign: '事业突破、打脸反派、感情升温、身份反转',
    readerPreference: '代入感强，节奏明快，主角开挂但合理',
    typicalArcs: ['赘婿逆袭', '神医归来', '重生暴富', '明星养成'],
  },
  {
    genre: '都市',
    variant: '都市商战',
    pacingRule: '商战博弈为主线，资本运作与人际博弈交织',
    highlightDesign: '商业谈判、并购反转、人脉运作、舆论战',
    readerPreference: '商战智斗，现实主义，主角智商在线',
    typicalArcs: ['草根崛起', '商业帝国', '资本博弈', '商战逆袭'],
  },
  {
    genre: '都市',
    variant: '生活流',
    pacingRule: '慢节奏日常，平凡生活中的小确幸与小波折',
    highlightDesign: '日常小爽点、人际关系、生活转折、治愈瞬间',
    readerPreference: '治愈向，代入感，平凡中见温情',
    typicalArcs: ['都市日常', '职场升迁', '邻里温情', '人生转折'],
  },

  // ---------- 历史 ----------
  {
    genre: '历史',
    variant: '穿越改史',
    pacingRule: '尊重史实大脉络，细节虚构，权谋线慢热铺陈',
    highlightDesign: '朝堂博弈、战场决胜、身世揭秘、改革变法',
    readerPreference: '历史厚重感，权谋精彩，人物立体',
    typicalArcs: ['穿越改史', '草根崛起', '帝王心术', '将门风云'],
  },
  {
    genre: '历史',
    variant: '架空历史',
    pacingRule: '虚构王朝背景，自由度高，权谋与战争并重',
    highlightDesign: '王朝更迭、权臣崛起、乱世群雄、千古一帝',
    readerPreference: '架空自由，史诗感，群像刻画',
    typicalArcs: ['架空王朝', '乱世群雄', '权臣之路', '开国功业'],
  },
  {
    genre: '历史',
    variant: '历史演义',
    pacingRule: '贴近正史，以真实人物为主角，细节虚构',
    highlightDesign: '历史事件亲历、人物命运转折、朝代兴衰',
    readerPreference: '历史厚重，人物真实，命运感强',
    typicalArcs: ['将相本纪', '后妃列传', '枭雄风云', '名臣之路'],
  },

  // ---------- 末世 ----------
  {
    genre: '末世',
    variant: '丧尸末世',
    pacingRule: '危机开场，生存线为主，每卷一个大型威胁',
    highlightDesign: '物资获得、同伴加入、丧尸/变异体、基地建设',
    readerPreference: '紧张刺激，人性刻画，主角冷静理智',
    typicalArcs: ['丧尸围城', '异变降临', '基地流', '重生末世前'],
  },
  {
    genre: '末世',
    variant: '天灾末世',
    pacingRule: '自然灾害为主，资源稀缺，人性考验',
    highlightDesign: '极端天气、物资争夺、基地建设、文明重建',
    readerPreference: '生存压力，人性深度，重建希望',
    typicalArcs: ['极寒末世', '洪灾求生', '干旱纪元', '虫灾肆虐'],
  },
  {
    genre: '末世',
    variant: '异变末世',
    pacingRule: '生物异变为主，修炼元素融入末世',
    highlightDesign: '异能觉醒、变异兽、基因进化、文明新生',
    readerPreference: '末世+修炼，爽感与生存并重',
    typicalArcs: ['异能觉醒', '基因进化', '变异兽潮', '文明新生'],
  },

  // ---------- 游戏 ----------
  {
    genre: '游戏',
    variant: '网游巅峰',
    pacingRule: '游戏化设定清晰，升级爽点密集，每章都有数值变化',
    highlightDesign: '技能获得、副本通关、PK 胜利、隐藏成就',
    readerPreference: '设定新颖，爽点密集，数据清晰',
    typicalArcs: ['网游巅峰', '全息沉浸', '无限流', '系统流'],
  },
  {
    genre: '游戏',
    variant: '无限流',
    pacingRule: '副本世界切换，每个副本独立剧情与升级',
    highlightDesign: '副本通关、规则破解、隐藏奖励、跨副本伏笔',
    readerPreference: '多世界观，副本爽点，主线伏笔',
    typicalArcs: ['无限流', '主神空间', '副本流', '规则怪谈'],
  },
  {
    genre: '游戏',
    variant: '全息沉浸',
    pacingRule: '全息游戏世界，生活与战斗并重',
    highlightDesign: '生活技能、隐藏职业、世界事件、玩家与NPC',
    readerPreference: '游戏沉浸感，生活流与战斗流结合',
    typicalArcs: ['生活玩家', '隐藏职业', '游戏与现实', '世界事件'],
  },

  // ---------- 宫斗 ----------
  {
    genre: '宫斗',
    variant: '庶女上位',
    pacingRule: '前期低位蛰伏，中期结盟上位，后期清算复仇',
    highlightDesign: '化险为夷、扳倒对手、圣宠加身、诞下皇嗣',
    readerPreference: '智商在线，步步为营，女主成长',
    typicalArcs: ['庶女上位', '废后重生', '替身入宫', '和亲公主'],
  },
  {
    genre: '宫斗',
    variant: '废后重生',
    pacingRule: '重生开局，复仇为主线，逐步清算前世仇敌',
    highlightDesign: '前世记忆、提前布局、仇敌落败、帝王真心',
    readerPreference: '复仇爽感，重生金手指，宫斗智斗',
    typicalArcs: ['废后重生', '嫡女归来', '重生侧妃', '重生公主'],
  },
  {
    genre: '宫斗',
    variant: '权谋宫斗',
    pacingRule: '前朝后宫联动，权谋与情感双线，慢热铺陈',
    highlightDesign: '前朝动向、后宫布局、党争博弈、皇权更迭',
    readerPreference: '权谋深度，前后宫联动，群像刻画',
    typicalArcs: ['权臣之女', '太后之路', '皇权更迭', '盛世后宫'],
  },

  // ---------- 其他 ----------
  {
    genre: '其他',
    variant: '跨题材融合',
    pacingRule: '自由节奏，依据题材特性调整',
    highlightDesign: '依据题材设计',
    readerPreference: '创新性与可读性并重',
    typicalArcs: ['跨题材融合'],
  },
  {
    genre: '其他',
    variant: '轻小说',
    pacingRule: '轻松快节奏，每章一个独立小爽点',
    highlightDesign: '日常萌点、小反转、人物互动、温情瞬间',
    readerPreference: '轻松治愈，人物萌系，日常向',
    typicalArcs: ['校园日常', '异世界生活', '萌系日常', '治愈系'],
  },
  {
    genre: '其他',
    variant: '同人衍生',
    pacingRule: '原作设定尊重，剧情自由发挥，慢热铺陈到爆发',
    highlightDesign: '原作人物登场、原著事件改写、新增原创人物',
    readerPreference: '原作情怀，剧情创新，人物还原',
    typicalArcs: ['原作改写', 'OC 主角', '原作续写', '平行世界'],
  },
];

// ============ 文风预设（5 个核心风格） ============
const STYLE_PRESETS: Omit<StylePreset, 'id'>[] = [
  {
    name: '细腻言情',
    narrativePerspective: 'third-limited',
    pacing: 'slow',
    descriptionDensity: 'detailed',
    dialogueRatio: 0.4,
    vocabularyProfile: {
      avgSentenceLength: 18,
      commonPhrases: ['眸光微动', '心尖一颤', '嗓音微哑', '指尖发颤'],
    },
  },
  {
    name: '硬核爽文',
    narrativePerspective: 'third-limited',
    pacing: 'fast',
    descriptionDensity: 'sparse',
    dialogueRatio: 0.3,
    vocabularyProfile: {
      avgSentenceLength: 12,
      commonPhrases: ['冷笑', '嗤笑', '杀意凛然', '势如破竹'],
    },
  },
  {
    name: '悬疑冷峻',
    narrativePerspective: 'third-limited',
    pacing: 'medium',
    descriptionDensity: 'medium',
    dialogueRatio: 0.35,
    vocabularyProfile: {
      avgSentenceLength: 15,
      commonPhrases: ['夜色沉沉', '寒意爬上脊背', '死寂', '瞳孔骤缩'],
    },
  },
  {
    name: '史诗厚重',
    narrativePerspective: 'third-omniscient',
    pacing: 'slow',
    descriptionDensity: 'detailed',
    dialogueRatio: 0.25,
    vocabularyProfile: {
      avgSentenceLength: 22,
      commonPhrases: ['苍穹', '烽烟', '山河', '万古'],
    },
  },
  {
    name: '轻松幽默',
    narrativePerspective: 'first',
    pacing: 'fast',
    descriptionDensity: 'sparse',
    dialogueRatio: 0.5,
    vocabularyProfile: {
      avgSentenceLength: 14,
      commonPhrases: ['翻了个白眼', '嘴角抽搐', '欲哭无泪', '心中一万匹草泥马'],
    },
  },
];

// ============ 种子初始化 ============
// 采用"按需覆盖"策略：
// - 若已有题材模板数与种子不一致（< 期望数），则用 bulkPut 覆盖更新
// - 文风预设同理
// 这样升级种子数据时无需手动清库，刷新即可生效
export async function seedDatabase(): Promise<void> {
  const existingGenres = await db.genreTemplates.count();
  const existingStyles = await db.stylePresets.count();

  const genreRecords: GenreTemplate[] = GENRE_TEMPLATES.map((g, i) => ({
    genre: g.genre,
    pacingRule: g.pacingRule,
    highlightDesign: g.highlightDesign,
    readerPreference: g.readerPreference,
    typicalArcs: g.typicalArcs,
    id: `genre-template-${i + 1}`,
  }));

  const styleRecords: StylePreset[] = STYLE_PRESETS.map((s, i) => ({
    ...s,
    id: `style-preset-${i + 1}`,
  }));

  // 题材：若数量不匹配（少于期望或种子已升级），重新写入
  if (existingGenres !== genreRecords.length) {
    // 先清空旧的全局题材模板（保留 id 不在 genre-template-N 模式的记录以防误删）
    const oldIds = (await db.genreTemplates.toArray())
      .filter((g) => /^genre-template-\d+$/.test(g.id))
      .map((g) => g.id);
    if (oldIds.length > 0) {
      await db.genreTemplates.bulkDelete(oldIds);
    }
    await db.genreTemplates.bulkAdd(genreRecords);
  }

  // 文风：仅当数量为 0 时初始化（文风预设一般不变更）
  if (existingStyles === 0) {
    await db.stylePresets.bulkAdd(styleRecords);
  }
}

// 暴露种子数据用于 UI 测试与类型推导（不写入数据库）
export const GENRE_TEMPLATE_SEEDS: ReadonlyArray<Readonly<GenreTemplateSeed>> = GENRE_TEMPLATES;

// 兼容旧导出：按 genre 分组的流派列表
export function getVariantsByGenre(genre: Genre): GenreTemplateSeed[] {
  return GENRE_TEMPLATES.filter((g) => g.genre === genre);
}
