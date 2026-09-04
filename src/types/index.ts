// ============================================================================
// AI 小说制作工坊 · 类型定义
// 依据：spec 5.5 节数据模型
// ============================================================================

// ============ 基础枚举 ============
export type Genre =
  | '玄幻'
  | '言情'
  | '悬疑'
  | '科幻'
  | '都市'
  | '历史'
  | '末世'
  | '游戏'
  | '宫斗'
  | '其他';

export type ProjectStatus = 'drafting' | 'ongoing' | 'completed' | 'archived';

export type LLMProvider = 'gemini' | 'zhipu' | 'deepseek' | 'qwen';

export type CharacterRole = 'protagonist' | 'supporting' | 'antagonist' | 'minor';

export type NarrativePerspective = 'first' | 'third-limited' | 'third-omniscient';

export type Pacing = 'fast' | 'medium' | 'slow';

export type DescriptionDensity = 'sparse' | 'medium' | 'detailed';

export type Importance = 'low' | 'medium' | 'high';

export type ForeshadowingStatus = 'planted' | 'pending' | 'recovered' | 'abandoned';

export type ChapterStatus =
  | 'pending'
  | 'designing'
  | 'drafting'
  | 'reviewing'
  | 'completed'
  | 'rewriting';

export type ConsistencyIssueType =
  | 'character'
  | 'worldview'
  | 'plot'
  | 'foreshadowing'
  | 'style';

export type IssueSeverity = 'warning' | 'error';

export type PlotThreadType = 'main' | 'subplot';

export type PlotThreadStatus = 'active' | 'resolved' | 'abandoned';

// ============ LLM 配置 ============
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  temperature: number; // 0-2，默认 0.8
  topP: number; // 0-1，默认 0.9
  maxTokens: number; // 单次生成上限
}

// ============ 项目 ============
export interface NovelProject {
  id: string;
  title: string;
  genre: Genre;
  summary: string;
  targetWords: number;
  stylePresetId: string;
  llmConfig: LLMConfig;
  status: ProjectStatus;
  currentVolume: number;
  currentChapter: number;
  createdAt: number;
  updatedAt: number;
}

// ============ 设定层（长期记忆） ============
export interface Worldview {
  id: string;
  projectId: string;
  worldStructure: string; // 世界架构
  powerSystem: string; // 力量体系
  geography: string; // 地理设定
  era: string; // 时代背景
  factions: string; // 势力划分
  rules: string[]; // 核心规则（强制约束）
  locked: boolean;
  updatedAt: number;
}

export interface CharacterRelation {
  targetId: string;
  targetName: string;
  relation: string; // 师徒/恋人/仇敌...
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: CharacterRole;
  appearance: string;
  personality: string;
  catchphrase: string; // 口头禅
  background: string;
  motivation: string; // 核心执念
  weakness: string; // 弱点
  growthArc: string; // 成长线
  relationships: CharacterRelation[];
  speechStyle: string; // 说话风格
  behaviorPattern: string; // 行为模式
  locked: boolean;
  updatedAt: number;
}

export interface Volume {
  volumeNo: number;
  title: string;
  summary: string;
  chapterRange: [number, number];
  coreConflict: string;
}

export interface Outline {
  id: string;
  projectId: string;
  volumes: Volume[];
  mainPlotline: string; // 主线
  climaxNodes: string[]; // 高潮节点
  ending: string;
  updatedAt: number;
}

export interface Foreshadowing {
  id: string;
  projectId: string;
  description: string; // 伏笔内容
  setupChapter: number; // 铺设章节
  importance: Importance;
  plannedRecoveryChapter?: number; // 计划回收章节
  actualRecoveryChapter?: number; // 实际回收章节
  status: ForeshadowingStatus;
  relatedCharacters: string[];
  relatedPlotThread?: string;
  createdAt: number;
}

// ============ 创作层 ============
export interface SceneDesign {
  setting: string; // 场景
  conflict: string; // 冲突
  highlight: string; // 爽点/反转
  foreshadowingToPlant: string[]; // 本章铺设的伏笔ID
  foreshadowingToRecover: string[]; // 本章回收的伏笔ID
  characterAppearances: string[]; // 出场人物ID
}

export interface ConsistencyIssue {
  type: ConsistencyIssueType;
  severity: IssueSeverity;
  description: string;
  suggestion: string;
  paragraphIndex?: number;
}

export interface ConsistencyReport {
  chapterId: string;
  passed: boolean;
  issues: ConsistencyIssue[];
  checkedAt: number;
}

export interface Chapter {
  id: string;
  projectId: string;
  volumeNo: number;
  chapterNo: number;
  title: string;
  plotPoints: string[]; // 剧情要点
  sceneDesign?: SceneDesign;
  content: string; // 正文
  wordCount: number;
  status: ChapterStatus;
  consistencyReport?: ConsistencyReport;
  needsRecheck?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============ 章节版本（阶段二·版本回滚） ============
/** 章节正文的历史快照：保存时若内容发生变化则将旧版快照入库，支持回滚找回 */
export interface ChapterVersion {
  id: string;
  chapterId: string;
  projectId: string;
  chapterNo: number;
  title: string;
  plotPoints: string[];
  content: string;
  wordCount: number;
  /** 快照产生时（即该版本对应的章节 updatedAt） */
  createdAt: number;
}

// ============ 中期记忆（向量索引） ============
export interface ChapterSummary {
  id: string;
  projectId: string;
  chapterId: string;
  chapterNo: number;
  volumeNo: number;
  summary: string; // 200字摘要
  keyEvents: string[]; // 关键事件
  characterStates: Record<string, string>; // 人物状态快照
  embedding: Float32Array; // 向量（384维）
  createdAt: number;
}

export interface PlotThread {
  id: string;
  projectId: string;
  name: string;
  type: PlotThreadType;
  description: string;
  status: PlotThreadStatus;
  relatedChapters: number[];
  embedding: Float32Array;
  updatedAt: number;
}

// ============ 文风与模板 ============
export interface VocabularyProfile {
  avgSentenceLength: number;
  commonPhrases: string[];
}

/**
 * 文风仿写集成（P3）：LLM 从样本文本凝练的定性风格指南。
 * 与统计指纹（VocabularyProfile）互补——指纹给量化约束，指南给可操作的写作规则。
 */
export interface StyleGuide {
  /** 一句话总括文风（如"冷峻克制的都市悬疑笔法，长句铺陈+短句收束"） */
  summary: string;
  /** 节奏与句式特征（具体的可执行规则） */
  rhythm: string;
  /** 语气与人物刻画方式 */
  tone: string;
  /** 高频用词/表达偏好（直接照搬的词与句式） */
  wordPreferences: string;
  /** 必须避免的表达（反 AI 味 + 样本中不出现的写法） */
  taboos: string;
}

export interface StylePreset {
  id: string;
  name: string; // 如"细腻言情"、"硬核爽文"
  narrativePerspective: NarrativePerspective;
  pacing: Pacing;
  descriptionDensity: DescriptionDensity;
  dialogueRatio: number; // 对话占比 0-1
  sampleText?: string; // Few-shot 样本（3-5章）
  vocabularyProfile?: VocabularyProfile;
  /** P3：LLM 定性文风仿写指南（缺省时回落纯统计指纹） */
  styleGuide?: StyleGuide;
}

export interface GenreTemplate {
  id: string;
  genre: Genre;
  pacingRule: string; // 节奏规律
  highlightDesign: string; // 爽点设计参考
  readerPreference: string;
  typicalArcs: string[];
}

// ============ 拆书工坊（P5' 粘贴拆文 + 灵感沉淀） ============
/** 拆文确定性指标：从参考文本中提取的量化特征 */
export interface DeconstructionMetrics {
  wordCount: number; // 中文字数
  sentenceCount: number;
  avgSentenceLength: number; // 中文字符/句
  dialogueRatio: number; // 0-1
  hookCount: number; // 开篇/转折钩子关键词数
  cliffhangerCount: number; // 断章悬念数
  coolPointHits: string[]; // 命中的爽点关键词
  coolPointDensity: number; // 爽点/千字
  hasOpeningHook: boolean;
  hasCliffhanger: boolean;
  rhythm: 'fast' | 'medium' | 'slow'; // 由句长推断的节奏
  topTrigrams: string[]; // 高频三字词组
}

/** 一条可收藏的拆书灵感 */
export interface InspirationCard {
  id: string;
  projectId: string;
  kind: 'golden-three' | 'hook' | 'coolpoint' | 'pacing' | 'character' | 'structure' | 'other';
  title: string;
  content: string;
  sourceDeconstructionId: string;
  createdAt: number;
}


// ============ 实时榜单 - 动态查重库 ============
export interface LiveRankedWork {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  author?: string;
  rank?: number;
  url?: string;
  fetchedAt: number;
}


/** 批量续写持久化任务（断点续写·暂停恢复） */
export interface BatchJob {
  id: string;
  projectId: string;
  /** 本批总章数 */
  total: number;
  /** 本批起始章号 */
  startChapterNo: number;
  /** 统一剧情模板 */
  plotTemplate: string;
  status: 'running' | 'paused';
  updatedAt: number;
}

// ============ 写作技能库（Skills） ============
/** 技能来源：内置 / GitHub / HuggingFace / 其它平台 / 自定义（手动粘贴） */
export type SkillSourceType = 'builtin' | 'github' | 'huggingface' | 'web' | 'custom';

export interface WritingSkill {
  id: string;
  name: string;
  /** 适用环节：风格 / 情节 / 开篇钩子 / 审稿 / 修改 / 大纲 / 其它 */
  category: 'style' | 'plot' | 'hook' | 'review' | 'rewrite' | 'outline' | 'other';
  /** 来源类型 */
  source: SkillSourceType;
  /** 来源描述（仓库 / 平台 / 网址名称） */
  sourceName?: string;
  /** 来源链接（可选） */
  sourceUrl?: string;
  author?: string;
  version?: string;
  /** 一句话说明（列表展示） */
  description: string;
  /** 注入到写作 prompt 的指令块（核心内容） */
  instruction: string;
  /** 是否内置示例技能 */
  builtin: boolean;
  /** 是否启用（启用后才注入到写作流程） */
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============ 起名工具 ============
export type NameCategory = 'person' | 'place' | 'skill' | 'sect' | 'weapon' | 'treasure';

export interface NameIdea {
  id: string;
  name: string;
  meaning: string;
}

export interface NameLLMInput {
  projectId: string;
  category: NameCategory;
  topic: string;
  genre?: Genre;
  count: number;
}

/** 一次拆文结果（样本 + 指标 + 灵感卡） */
export interface Deconstruction {
  id: string;
  projectId: string;
  sourceTitle: string; // 参考书/片段名（用户填）
  samplePreview: string; // 样本前 200 字预览
  metrics: DeconstructionMetrics;
  suggestions: string[]; // LLM 综合改进建议（可降级为指标衍生）
  fromLLM: boolean; // suggestions 是否来自 LLM
  createdAt: number;
}

// ============ LLM 适配层（spec 6.4 节） ============
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface StreamChatParams extends ChatParams {
  onToken: (token: string) => void;
  /** 中止信号，用于主动中断生成 */
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMAdapter {
  /** 当前使用的模型名 */
  readonly model: string;
  /** 当前使用的 Provider 标识 */
  readonly provider: LLMProvider;
  chat(params: ChatParams): Promise<ChatResponse>;
  streamChat(params: StreamChatParams): Promise<void>;
  embedding(text: string, model?: string): Promise<Float32Array>;
}

// ============ 记忆装配 ============
export interface LongTermMemory {
  worldview: Worldview | null;
  characters: Character[];
  outline: Outline | null;
  pendingForeshadowings: Foreshadowing[];
  stylePreset: StylePreset | null;
}

export interface MidTermMemory {
  relevantSummaries: ChapterSummary[];
  activePlotThreads: PlotThread[];
  foreshadowingsToRecover: Foreshadowing[];
  characterStates: Record<string, string>;
}

export interface ShortTermMemory {
  prevChapters: ChapterSummary[];
  currentPlotPoints: string[];
}

export interface AssembledMemory {
  longTerm: LongTermMemory;
  midTerm: MidTermMemory;
  shortTerm: ShortTermMemory;
  tokenEstimate: number;
}

// ============ 生成流程 ============
export type GenerationStage =
  | 'memory_assembling'
  | 'plot_designing'
  | 'writing'
  | 'consistency_checking'
  | 'rewriting_1'
  | 'rewriting_2'
  | 'memory_updating'
  | 'completed'
  | 'failed';

export interface UserIntervention {
  modifiedPlotPoints?: string[];
  forcedCharacters?: string[]; // 强制出场人物ID
  disabledForeshadowings?: string[]; // 禁用伏笔ID
  temperature?: number;
  topP?: number;
}

export interface GenerationContext {
  projectId: string;
  chapterNo: number;
  plotPoints: string[];
  userIntervention?: UserIntervention;
  /** Q3 抽卡模式：并行生成 N 个候选正文，按读者评分自动择优（默认 1，即不抽卡） */
  candidateCount?: number;
  /** 本轮生成自由选择的已启用技能 ID；为空表示沿用全部已启用技能 */
  skillIds?: string[];
  onStream: (chunk: string) => void;
  onProgress: (stage: GenerationStage) => void;
  /** 中止信号，用户点击「停止生成」时触发，贯通到写作 Agent 与上游请求 */
  signal?: AbortSignal;
}

export interface GenerationResult {
  content: string;
  sceneDesign: SceneDesign;
  consistencyReport: ConsistencyReport;
  wordCount: number;
  /** 生成被用户/信号中断（骨架/不完整稿）：上层不应将其落成 completed */
  interrupted?: boolean;
}
