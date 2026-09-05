// ============================================================================
// 叙述者人格库（P1-4 人设化文风，对标 human-writing「像具体的人」思路）
// 设计：纯静态内置库 + 确定性函数，零 LLM/零网络；
//       人格只约束「谁在叙述」（句式腔调/台词习惯/情绪演法/禁忌），
//       与统计指纹（量化）、StyleGuide（笔法）互不替代。
// 注入点：章节生成（writing.ts）与去AI味润色（humanize/index.ts）。
// ============================================================================

import type { Genre, NarratorPersona } from '@/types';

/** 内置叙述者人格（6 款，覆盖主流网文腔调） */
export const BUILTIN_PERSONAS: NarratorPersona[] = [
  {
    id: 'persona-poison',
    name: '毒舌编辑',
    summary: '嘴上不饶人、心里有杆秤的犀利叙述者，讽刺里藏着判断力。',
    narration:
      '叙述带刺但精准：用短促的判断句收尾（如「他配不上。」）；比喻往狠里打、往日常里打（拿体面事儿类比菜市场）；反讽优先于直陈。',
    dialogue:
      '台词短、快、带钩子，人物说话像过招；允许刻薄但不脏，损人落在具体缺点上。',
    emotion:
      '情绪靠反差演：越在乎越嘴硬，写「逞强」不写「感动」；愤怒用冷笑和停顿，不摔桌子。',
    avoid: '抒情排比、书面腔、温吞的「他感到一阵温暖」式直陈；绝不替读者总结道理。',
  },
  {
    id: 'persona-cold',
    name: '冷峻观察者',
    summary: '镜头感极强的克制叙述者，只记录可观察的细节，情绪交给读者。',
    narration:
      '白描为主：多动词与名词，少形容词；句子干净利落，段落短；视角贴着人物但保持半步距离，像纪录片镜头。',
    dialogue:
      '台词克制、信息密度高，话说三分；人物常用沉默、动作代替回答（「他没接话，把烟摁灭了。」）。',
    emotion:
      '情绪只写生理与动作信号（手抖、喉结滚动、目光移开），严禁直接命名情绪。',
    avoid: '感叹号堆砌、心理独白灌水、「仿佛」「似乎」式的模糊修辞；不做道德评判。',
  },
  {
    id: 'persona-smoke',
    name: '烟火气说书人',
    summary: '热气腾腾的市井叙述者，家长里短里见人心，像楼下的老邻居在讲事。',
    narration:
      '叙述口语化、带生活颗粒感（物价、饭菜、天气、家长里短）；常用「要说」「你猜怎么着」式的半讲述口吻；长短句随聊天节奏走。',
    dialogue:
      '台词生活化、有方言味儿但不难懂；人物爱唠嗑、爱打岔，重要信息藏在闲话里递出来。',
    emotion:
      '情绪写在吃穿用度的细节里（多添的一碗饭、没舍得扔的旧外套），温暖不点破。',
    avoid: '翻译腔、文言腔、宏大叙事词汇；角色说话不像活人会说的「漂亮话」。',
  },
  {
    id: 'persona-snark',
    name: '幽默吐槽手',
    summary: '内心弹幕不停的欢脱叙述者，正经事也能讲出喜剧感。',
    narration:
      '叙述自带吐槽：正经推进剧情，闲笔负责好笑；善用夸张、预期违背和自嘲；节奏靠短句抖包袱。',
    dialogue:
      '台词像相声捧逗，一来一回有节奏；允许人物一本正经地胡说八道，但信息不失真。',
    emotion:
      '情绪先扬后抑式反转：用搞笑铺垫，落点忽然真诚，一秒戳心，随即收回。',
    avoid: '苦大仇深的长段独白、华丽辞藻堆砌；玩笑不能建立在角色真实痛苦之上。',
  },
  {
    id: 'persona-tender',
    name: '温柔细腻者',
    summary: '体察入微的暖调叙述者，擅长写关系里的暗流与和解。',
    narration:
      '叙述细腻但不黏腻：多感官细节（光、气味、触感），善用通感；句子偏长但呼吸均匀，段落有留白。',
    dialogue:
      '台词含蓄、留白多，人物用关心代替质问（「饭吃了没」而不是「你怎么了」）。',
    emotion:
      '情绪层层递进：先写微小的在意，再写克制的心疼，爆发只给一次且轻轻收住。',
    avoid: '狗血冲突写法、刻薄台词、直白的心理分析（「她其实很自卑」式）。',
  },
  {
    id: 'persona-hard',
    name: '硬朗凌厉者',
    summary: '刀刀见血的强冲突叙述者，节奏快、信息猛，适合男频爽文与悬疑。',
    narration:
      '短句主导、一段一事；动词凌厉（砸、掐、掀），少铺垫直接进冲突；场面转换快，绝不拖镜。',
    dialogue:
      '台词即武器：威胁、试探、交易，句句带目的；反派说话不留余地，主角接话不落下风。',
    emotion:
      '情绪靠压迫感演：写肾上腺素（耳鸣、视野发红、心跳砸胸口），不写「他很紧张」。',
    avoid: '慢节奏抒情、景致长描、绕圈子的文雅措辞；爽点前不许注水。',
  },
];

/** 按 id 查内置人格；未命中返回 undefined */
export function getBuiltinPersona(id: string): NarratorPersona | undefined {
  return BUILTIN_PERSONAS.find((p) => p.id === id);
}

/** 内置人格是否合法（人格绑定校验用） */
export function isBuiltinPersonaId(id: string): boolean {
  return BUILTIN_PERSONAS.some((p) => p.id === id);
}

/** 题材 → 推荐人格（确定性映射，覆盖全部 Genre；「其他」默认冷峻观察者） */
export function recommendPersonaForGenre(genre: Genre): NarratorPersona {
  const map: Record<Genre, string> = {
    玄幻: 'persona-hard',
    言情: 'persona-tender',
    悬疑: 'persona-cold',
    科幻: 'persona-cold',
    都市: 'persona-smoke',
    历史: 'persona-cold',
    末世: 'persona-hard',
    游戏: 'persona-snark',
    宫斗: 'persona-poison',
    其他: 'persona-cold',
  };
  return getBuiltinPersona(map[genre] ?? 'persona-cold') ?? BUILTIN_PERSONAS[0];
}

/**
 * 将人格转为可直接插入写作/润色 Prompt 的文本块。
 */
export function personaToPrompt(persona: NarratorPersona): string {
  return (
    `【叙述者人格（全书统一，必须扮演）】\n` +
    `人格：${persona.name} —— ${persona.summary}\n` +
    `叙述习惯：${persona.narration}\n` +
    `台词习惯：${persona.dialogue}\n` +
    `情绪演法：${persona.emotion}\n` +
    `绝对避免：${persona.avoid}`
  );
}
