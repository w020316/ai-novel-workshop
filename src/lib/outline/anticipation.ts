// ============================================================================
// 期待感卷级规划（三层引擎 → 自适应分卷落地）
// 依据：内置技能「期待感三层引擎」（「猫神写作」第51集）——把宏观/中观两层
//       在卷规划层写死成设计文本，随卷摘要流入记忆层与正文生成：
//         宏观：第 1 卷埋「终极天坑」，中间各卷给一块碎片，末卷揭晓全貌
//         中观：每卷一个具象化「阶段性大奖」+ 一条「压抑→释放」节奏
//       微观（章内将爆即断/信息不对称）由写作法则与技能库在章级注入，不在卷级展开。
// 设计原则：零依赖、纯函数、确定性可测——与 volume-plan 同源同风格。
// ============================================================================

/** 单卷期待感设计（中观大奖 + 中观节奏 + 宏观天坑碎片） */
export interface VolumeAnticipation {
  /** 中观·阶段性大奖：本卷主角追逐的具象化大奖（读者为本卷追更的理由） */
  grandPrize: string;
  /** 中观·压抑→释放：本卷节奏设计（前段压抑蓄力，卷末释放兑现） */
  rhythm: string;
  /** 宏观·天坑碎片：本卷对终极悬念的埋设 / 揭秘动作 */
  pitFragment: string;
}

/**
 * 按卷序号生成期待感设计。
 * @param index - 卷下标（0 起）
 * @param count - 总卷数（≥ 4，由 planVolumes 钳制保证）
 */
export function anticipationDesign(index: number, count: number): VolumeAnticipation {
  const diff = count - index; // 1=末卷 2=倒数第二卷

  // 中观·阶段性大奖：随剧情阶段逐卷升级
  let grandPrize: string;
  if (index === 0) {
    grandPrize = '第一次立身之战的胜利（扬名/入局/拿到第一份话语权）';
  } else if (diff === 1) {
    grandPrize = '终极对决的胜利与最终立身之地（名望/道果/真相的最终兑现）';
  } else if (diff === 2) {
    grandPrize = '拿到与幕后黑手正面交锋的资格（实力/身份/证据的入场券）';
  } else if (diff === 3) {
    grandPrize = '晋入上一阶层（新地图/新圈子/新势力的门票）';
  } else {
    grandPrize = '更大棋盘上的关键赌局胜利（碾压同级、惊动上位者）';
  }

  // 中观·压抑→释放：前段压抑蓄力、卷末释放兑现
  let rhythm: string;
  if (index === 0) {
    rhythm = '开局即压抑（被轻视/被夺走/被逼入绝境）→ 卷末小爆发，让读者初尝甜头但不满足';
  } else if (diff === 1) {
    rhythm = '至暗时刻（几乎失去一切）→ 终极释放，把全书压抑一次性清偿';
  } else {
    rhythm = '前段层层加码受挫（看着要拿到又失手）→ 卷末压哨兑现，爽感抬升一档';
  }

  // 宏观·天坑：首卷埋坑、末卷揭晓、中间给碎片
  let pitFragment: string;
  if (index === 0) {
    pitFragment = '埋下终极天坑（一个足以颠覆世界观的悬念），并在卷末抛出第一块线索碎片';
  } else if (diff === 1) {
    pitFragment = '揭晓终极天坑全貌，前文所有碎片拼合成完整真相';
  } else {
    pitFragment = `给出第 ${index + 1} 块天坑碎片（新线索指向更大真相，同时翻转一块旧碎片）`;
  }

  return { grandPrize, rhythm, pitFragment };
}

/** 把期待感设计格式化为可拼进卷摘要的一句话块（记忆层/正文生成会原样读到） */
export function formatAnticipation(a: VolumeAnticipation): string {
  return `期待感设计：本卷大奖——${a.grandPrize}；节奏——${a.rhythm}；天坑线索——${a.pitFragment}。`;
}
