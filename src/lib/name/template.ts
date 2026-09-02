// ============================================================================
// 起名工具 · 本地模板兜底
// 依据：spec 设定工坊 / 调研 Q2（OpenWrite 起名工具）
// 职责：在 LLM 不可用 / 无配额时，确定性合成一批贴合类别的名字，保证功能离线可用。
// ============================================================================
import { generateId } from '@/lib/utils';
import type { NameCategory, NameIdea, NameLLMInput } from '@/types';

export const NAME_CATEGORY_LABEL: Record<NameCategory, string> = {
  person: '人名',
  place: '地名',
  skill: '功法',
  sect: '门派',
  weapon: '兵器',
  treasure: '法宝',
};

interface Pool {
  first: string[];
  last: string[];
  meanings: string[];
}

// 各类别的字根池与含义词库（确定性，合成结果稳定）
const POOLS: Record<NameCategory, Pool> = {
  person: {
    first: ['苏', '沈', '林', '陆', '顾', '萧', '楚', '洛', '江', '秦', '云', '白', '叶', '夜', '慕', '卿'],
    last: ['尘', '渊', '澈', '霜', '烬', '临', '昭', '澜', '晏', '既', '白', '舟', '影', '辞', '墨', '晞'],
    meanings: ['清冷孤傲，深藏不露', '温润如玉，重情重义', '锋芒内敛，杀伐果断', '灵动通透，机敏过人'],
  },
  place: {
    first: ['玄', '青', '沧', '幽', '玉', '天', '凤', '龙', '云', '雪', '星', '月', '墨', '禅', '丹', '剑'],
    last: ['山', '谷', '洲', '城', '台', '关', '岭', '海', '林', '泽', '阁', '府', '渊', '墟', '川', '巅'],
    meanings: ['险要奇绝，灵气充沛', '祥和安宁，人杰地灵', '神秘莫测，暗流涌动', '萧瑟苍茫，见证沧桑'],
  },
  skill: {
    first: ['太虚', '九转', '无极', '阴阳', '万象', '玄天', '北斗', '焚天', '裂地', '流光', '寂灭', '沧海', '生死', '雷音', '混元', '天罡'],
    last: ['神功', '功决', '经', '剑典', '掌法', '指法', '遁法', '真元诀', '神诀', '秘术', '造化', '天书'],
    meanings: ['刚猛霸道，以势压人', '绵延持久，厚积薄发', '神鬼莫测，诡异难防', '刚柔并济，攻守兼备'],
  },
  sect: {
    first: ['青云', '紫阳', '太一', '玄月', '赤霞', '雪域', '万剑', '七曜', '丹霞', '太衍', '碧落', '寒山', '无涯', '听雨', '沧澜', '赤霄'],
    last: ['门', '宗', '派', '阁', '宫', '谷', '殿', '教', '山门', '院'],
    meanings: ['名门正派，门下弟子众多', '隐世古宗，底蕴深厚', '旁门左道，亦正亦邪', '底蕴霸道，威震一方'],
  },
  weapon: {
    first: ['倚天', '斩星', '饮血', '破军', '裂天', '逐日', '秋水', '赤霄', '含光', '无影', '承影', '惊鸿', '落月', '龙渊', '紫电', '青冥'],
    last: ['剑', '刀', '枪', '戟', '弓', '鞭', '刃', '锤', '扇', '针'],
    meanings: ['寒光凛冽，削铁如泥', '通灵认主，威力无匹', '邪异嗜血，凶名赫赫', '素雅无双，名剑风流'],
  },
  treasure: {
    first: ['混元', '造化', '乾坤', '周天', '太一', '幽冥', '五行', '紫金', '玄黄', '混沌', '玲珑', '聚灵', '护道', '镇魂', '九幽', '万象'],
    last: ['珠', '鼎', '镜', '塔', '印', '幡', '石', '伞', '环', '图'],
    meanings: ['蕴含造化，可夺天地之机', '镇守一方，护道安宁', '诡异奇珍，妙用无穷', '温养心神，趋吉避凶'],
  },
};

/** 依据 seed 与偏移确定性组合一个名字（同一输入 + 偏移产出稳定） */
function composeName(category: NameCategory, topicSeed: number, offset: number): string {
  const pool = POOLS[category];
  const fl = pool.first.length;
  const ll = pool.last.length;
  return `${pool.first[(offset + topicSeed) % fl]}${pool.last[(offset * 3 + topicSeed) % ll]}`;
}

/** 生成的 name 若与主题关键词相关，则拼接展示，否则仅用类别语义 */
function buildMeaning(category: NameCategory, topic: string, base: string): string {
  const label = NAME_CATEGORY_LABEL[category];
  const ctx = topic.trim();
  return ctx
    ? `「${ctx}」风格 · ${label}，${base}`
    : `${label} · ${base}`;
}

/**
 * 本地模板兜底生成一组名字，保证 LLM 不可用时仍可产出。
 * 同一输入重复调用结果稳定，供测试断言与离线演示。
 */
export function generateNameTemplate(input: NameLLMInput): NameIdea[] {
  const count = Math.min(10, Math.max(1, Math.round(input.count) || 1));
  const topic = input.topic.trim();
  // 用主题/类别派生一个稳定种子，让不同主题产出不同组合
  let seed = 0;
  for (let ci = 0; ci < input.category.length; ci++) seed += input.category.charCodeAt(ci);
  for (let ti = 0; ti < topic.length; ti++) seed += topic.charCodeAt(ti);

  const pool = POOLS[input.category];
  const result: NameIdea[] = [];
  for (let i = 0; i < count; i++) {
    const name = composeName(input.category, seed, i);
    const meaning = buildMeaning(input.category, topic, pool.meanings[i % pool.meanings.length]);
    result.push({ id: generateId('name'), name, meaning });
  }
  return result;
}