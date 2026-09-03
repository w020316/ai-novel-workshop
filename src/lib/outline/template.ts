// ============================================================================
// 大纲「题材模板」起底
// 依据：UX 评估 N2 —— 用内置流派模板一键填充，降低冷启动门槛（无需 LLM、结果确定）。
// 说明：为常见题材提供主线骨架/分卷/结局，供「从题材模板起底」按钮一键套用；
//       未收录题材回退到通用四卷结构。
// ============================================================================
import type { Volume } from '@/types';

export interface OutlineTemplate {
  mainPlotline: string;
  ending: string;
  volumes: Volume[];
}

/** 各题材的主线一句话（用于 mainPlotline 起底）；未收录题材走通用兜底 */
const MAIN_PLOT: Record<string, string> = {
  玄幻: '一个出身卑微的少年，踏上修行之路，探寻自己血脉与身世的真相，最终直面天道与既定的宿命。',
  言情: '两个出身悬殊的灵魂在一次次误会与和解中靠近，跨越阶层与心结，最终走到一起的过程。',
  悬疑: '围绕一桩尘封旧案，主角在层层反转中逼近真相，却发现真相背后是更深的局。',
  科幻: '人类在技术奇点后的抉择：当 AI/意识上传/星际扩张成为现实，个体与文明如何共存并寻找意义。',
  都市: '隐藏身份的主角在都市中一步步亮出底牌，逆袭打脸，最终站上行业或势力的顶端。',
  历史: '一个身处王朝转折点的人物，以权谋与智略在朝堂与天下间博弈，试图改变大势。',
  末世: '末日前夜的重生者，带领身边人求生、建立基地，在人性与资源的博弈中重建文明。',
  游戏: '普通玩家在游戏世界里意外获得隐藏身份/天命，一路揭开世界背后的真相。',
  宫斗: '一个低位入宫的宫人，以心机与靠山步步高升，在波诡云谲的后宫与前朝之间求生并清算旧账。',
};

/** 各题材结局一句话；未收录题材走通用兜底 */
const ENDING: Record<string, string> = {
  玄幻: '主角证道登临绝巅，却也背负起守护三界的责任。',
  言情: '跨越一切阻碍后，两人终成眷属，HE 圆满收场。',
  悬疑: '真相大白，幕后之人付出代价，旧案尘封。',
  科幻: '人类在崩坏边缘找到共存之道，文明迎来新生。',
  都市: '主角登顶封神，昔年轻视他之人尽数低头。',
  历史: '大势仍不可逆，但主角守住了想守护的人与道。',
  末世: '基地重建、秩序回归，黑暗之后是新的黎明。',
  游戏: '主角通关并揭穿世界真相，成为打破规则的传奇。',
  宫斗: '清算旧账后归隐或上位，恩怨有了结局。',
};

/** 分卷四段骨架（各题材通用，标题按题材风味微调） */
function buildVolumes(genre: string): Volume[] {
  const hookTitle = `${genre}开局 · 身份与危机的引入`;
  const middleTitle = `中期推进 · 升级与四方角力`;
  const turningTitle = `转折爆发 · 真相 / 巨大危机`;
  const climaxTitle = `终局清算 · 走向结局`;
  return [
    { volumeNo: 1, title: hookTitle, summary: '交代背景与主角处境，抛出核心冲突与第一重悬念。', chapterRange: [1, 30], coreConflict: '生存/身份危机浮现' },
    { volumeNo: 2, title: middleTitle, summary: '主角获得成长（修行/事业/实力），与各方势力建立或激化关系。', chapterRange: [31, 80], coreConflict: '阵营冲突与实力升级' },
    { volumeNo: 3, title: turningTitle, summary: '爆发巨大转折：真相揭露或强敌逼近，主角面临抉择。', chapterRange: [81, 120], coreConflict: '真相/背水一战' },
    { volumeNo: 4, title: climaxTitle, summary: '最终对峙与清算，主线落定，呼应开头伏笔。', chapterRange: [121, 150], coreConflict: '终局对决与收束' },
  ];
}

/**
 * 生成某个题材的大纲「起底模板」。
 * 字段内容可作为起点，用户可继续编辑；不覆盖已有人工内容（由调用方决定如何合并）。
 */
export function generateOutlineTemplate(genre: string): OutlineTemplate {
  const mainPlotline = MAIN_PLOT[genre] ?? MAIN_PLOT['玄幻'];
  const ending = ENDING[genre] ?? ENDING['玄幻'];
  return { mainPlotline, ending, volumes: buildVolumes(genre) };
}