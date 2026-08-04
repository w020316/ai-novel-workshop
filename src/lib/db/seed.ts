// ============================================================================
// 种子数据：题材模板 + 文风预设
// 依据：spec P0.4
// ============================================================================
import { db } from './schema';
import type { GenreTemplate, StylePreset } from '@/types';

// ============ 题材模板（10+ 个，覆盖主流网文题材） ============
const GENRE_TEMPLATES: Omit<GenreTemplate, 'id'>[] = [
  {
    genre: '玄幻',
    pacingRule: '前30章慢热铺世界观，30-100章升级流爽点密集，100章后宏大叙事',
    highlightDesign: '境界突破、宝物获得、强者臣服、复仇打脸',
    readerPreference: '爽感优先，世界观厚重，主角成长曲线明确',
    typicalArcs: ['废柴逆袭', '天才陨落重生', '异界降临', '血脉觉醒'],
  },
  {
    genre: '言情',
    pacingRule: '情感线为主轴，每10章一个小高潮，误会-和解-升温循环',
    highlightDesign: '初次心动、意外相遇、吃醋占有、表白/求婚',
    readerPreference: '情感细腻，糖与刀交替，HE 结局',
    typicalArcs: ['霸总娇妻', '青梅竹马', '破镜重圆', '暗恋成真'],
  },
  {
    genre: '悬疑',
    pacingRule: '谜题前置，线索密集铺设，每章留钩子，结尾大反转',
    highlightDesign: '新线索出现、嫌疑人反转、危机逼近、真相揭露',
    readerPreference: '逻辑严密，氛围紧张，结局意外又合理',
    typicalArcs: ['连环案件', '密室杀人', '历史悬案', '心理博弈'],
  },
  {
    genre: '科幻',
    pacingRule: '设定先行，硬科幻慢热，软科幻情节驱动',
    highlightDesign: '科技突破、文明接触、危机爆发、认知颠覆',
    readerPreference: '设定严谨，想象力丰富，人文思考',
    typicalArcs: ['星际探索', '末日生存', 'AI觉醒', '时空悖论'],
  },
  {
    genre: '都市',
    pacingRule: '贴近现实节奏，职场/商战/生活流，爽点来自打脸与逆袭',
    highlightDesign: '事业突破、打脸反派、感情升温、身份反转',
    readerPreference: '代入感强，节奏明快，主角开挂但合理',
    typicalArcs: ['赘婿逆袭', '神医归来', '重生暴富', '明星养成'],
  },
  {
    genre: '历史',
    pacingRule: '尊重史实大脉络，细节虚构，权谋线慢热铺陈',
    highlightDesign: '朝堂博弈、战场决胜、身世揭秘、改革变法',
    readerPreference: '历史厚重感，权谋精彩，人物立体',
    typicalArcs: ['穿越改史', '草根崛起', '帝王心术', '将门风云'],
  },
  {
    genre: '末世',
    pacingRule: '危机开场，生存线为主，每卷一个大型威胁',
    highlightDesign: '物资获得、同伴加入、丧尸/变异体、基地建设',
    readerPreference: '紧张刺激，人性刻画，主角冷静理智',
    typicalArcs: ['丧尸围城', '异变降临', '基地流', '重生末世前'],
  },
  {
    genre: '游戏',
    pacingRule: '游戏化设定清晰，升级爽点密集，每章都有数值变化',
    highlightDesign: '技能获得、副本通关、PK 胜利、隐藏成就',
    readerPreference: '设定新颖，爽点密集，数据清晰',
    typicalArcs: ['网游巅峰', '全息沉浸', '无限流', '系统流'],
  },
  {
    genre: '宫斗',
    pacingRule: '前期低位蛰伏，中期结盟上位，后期清算复仇',
    highlightDesign: '化险为夷、扳倒对手、圣宠加身、诞下皇嗣',
    readerPreference: '智商在线，步步为营，女主成长',
    typicalArcs: ['庶女上位', '废后重生', '替身入宫', '和亲公主'],
  },
  {
    genre: '其他',
    pacingRule: '自由节奏，依据题材特性调整',
    highlightDesign: '依据题材设计',
    readerPreference: '创新性与可读性并重',
    typicalArcs: ['跨题材融合'],
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
export async function seedDatabase(): Promise<void> {
  const existingGenres = await db.genreTemplates.count();
  if (existingGenres > 0) return;

  const genreRecords: GenreTemplate[] = GENRE_TEMPLATES.map((g, i) => ({
    ...g,
    id: `genre-template-${i + 1}`,
  }));

  const styleRecords: StylePreset[] = STYLE_PRESETS.map((s, i) => ({
    ...s,
    id: `style-preset-${i + 1}`,
  }));

  await db.genreTemplates.bulkAdd(genreRecords);
  await db.stylePresets.bulkAdd(styleRecords);
}
