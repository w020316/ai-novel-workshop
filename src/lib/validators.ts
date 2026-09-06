// ============================================================================
// 表单校验 Schema
// ============================================================================
import { z } from 'zod';

/**
 * 题材选项（对齐主流平台分类：起点男频/晋江女频/番茄脑洞等）。
 * 单一事实来源：表单、趋势灵感、选题起点、题材模板库均从此派生。
 */
export const GENRE_OPTIONS = [
  // —— 男频向（起点/纵横/飞卢）——
  { value: '玄幻', label: '玄幻' },
  { value: '仙侠', label: '仙侠' },
  { value: '武侠', label: '武侠' },
  { value: '奇幻', label: '奇幻' },
  { value: '都市', label: '都市' },
  { value: '历史', label: '历史' },
  { value: '军事', label: '军事' },
  { value: '游戏', label: '游戏' },
  { value: '科幻', label: '科幻' },
  { value: '末世', label: '末世' },
  { value: '脑洞', label: '脑洞' },
  { value: '体育', label: '体育' },
  // —— 中性（全平台通用）——
  { value: '轻小说', label: '轻小说' },
  { value: '悬疑', label: '悬疑' },
  { value: '灵异', label: '灵异' },
  { value: '同人衍生', label: '同人衍生' },
  { value: '现实', label: '现实' },
  // —— 女频向（晋江/红袖/潇湘）——
  { value: '言情', label: '言情' },
  { value: '甜宠', label: '甜宠' },
  { value: '快穿', label: '快穿' },
  { value: '种田', label: '种田' },
  { value: '宫斗', label: '宫斗' },
  { value: '玄幻言情', label: '玄幻言情' },
  { value: '纯爱', label: '纯爱' },
  // —— 兜底 ——
  { value: '其他', label: '其他' },
] as const;

export type GenreOptionValue = (typeof GENRE_OPTIONS)[number]['value'];

/** 全部合法题材值（供白名单/类型收窄使用） */
export const GENRE_VALUES = GENRE_OPTIONS.map((g) => g.value) as [GenreOptionValue, ...GenreOptionValue[]];

export const PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'zhipu', label: '智谱 GLM' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义 Qwen' },
  { value: 'ollama', label: 'Ollama 本地' },
] as const;

export const projectFormSchema = z.object({
  title: z
    .string()
    .min(1, '请输入小说标题')
    .max(50, '标题不超过 50 字'),
  genre: z.enum(GENRE_VALUES),
  summary: z
    .string()
    .max(200, '简介不超过 200 字'),
  targetWords: z
    .number()
    .int('字数必须为整数')
    .min(10000, '目标字数不少于 1 万')
    .max(5000000, '目标字数不超过 500 万'),
  chapterWords: z
    .number()
    .int('每章字数必须为整数')
    .min(1000, '每章字数不少于 1000')
    .max(10000, '每章字数不超过 1 万'),
  /** 目标卷数（可选）：留空 undefined 表示按字数自动推算；z.coerce 兼容表单字符串数字输入 */
  volumeCount: z.coerce
    .number()
    .int('卷数必须为整数')
    .min(1, '目标卷数不少于 1')
    .max(20, '目标卷数不超过 20')
    .optional(),
  stylePresetId: z.string().min(1, '请选择文风预设'),
  llmProvider: z.enum(['gemini', 'zhipu', 'deepseek', 'qwen', 'ollama']),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const worldviewFormSchema = z.object({
  worldStructure: z.string().min(10, '世界架构至少 10 字'),
  powerSystem: z.string().optional().default(''),
  geography: z.string().optional().default(''),
  era: z.string().optional().default(''),
  factions: z.string().optional().default(''),
  rules: z.array(z.string()).default([]),
});

export type WorldviewFormValues = z.infer<typeof worldviewFormSchema>;

export const characterFormSchema = z.object({
  name: z.string().min(1, '请输入人物姓名').max(20, '姓名不超过 20 字'),
  role: z.enum(['protagonist', 'supporting', 'antagonist', 'minor']),
  appearance: z.string().optional().default(''),
  personality: z.string().min(10, '性格描述至少 10 字'),
  catchphrase: z.string().optional().default(''),
  background: z.string().optional().default(''),
  motivation: z.string().optional().default(''),
  weakness: z.string().optional().default(''),
  growthArc: z.string().optional().default(''),
  speechStyle: z.string().optional().default(''),
  behaviorPattern: z.string().optional().default(''),
});

export type CharacterFormValues = z.infer<typeof characterFormSchema>;
