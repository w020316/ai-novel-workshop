// ============================================================================
// 表单校验 Schema
// ============================================================================
import { z } from 'zod';

export const GENRE_OPTIONS = [
  { value: '玄幻', label: '玄幻' },
  { value: '言情', label: '言情' },
  { value: '悬疑', label: '悬疑' },
  { value: '科幻', label: '科幻' },
  { value: '都市', label: '都市' },
  { value: '历史', label: '历史' },
  { value: '末世', label: '末世' },
  { value: '游戏', label: '游戏' },
  { value: '宫斗', label: '宫斗' },
  { value: '其他', label: '其他' },
] as const;

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
  genre: z.enum([
    '玄幻', '言情', '悬疑', '科幻', '都市', '历史', '末世', '游戏', '宫斗', '其他'
  ]),
  summary: z
    .string()
    .max(200, '简介不超过 200 字'),
  targetWords: z
    .number()
    .int('字数必须为整数')
    .min(10000, '目标字数不少于 1 万')
    .max(5000000, '目标字数不超过 500 万'),
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
