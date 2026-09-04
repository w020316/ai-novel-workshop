// ============================================================================
// 跨书「宇宙设定」复用（UX 评估 N3）
// 用途：把已生成的世界观 + 人物库导出为一个便携 JSON「设定包」，可在新项目导入，
//       实现系列作 / 同世界观续写的设定迁移。均为纯函数 + 可注入 save，便于单测。
// ============================================================================
import { generateId } from '@/lib/utils';
import type { Character, Worldview } from '@/types';

export interface SettingsBundle {
  kind: 'novel-settings-bundle';
  version: 1;
  exportedAt: number;
  worldview?: Worldview;
  characters: Character[];
}

/** 打包：给定世界观与人物，返回可下载/传输的 JSON 字符串（不包含 projectId 语义） */
export function serializeSettingsBundle(
  worldview: Worldview | null | undefined,
  characters: Character[]
): string {
  const bundle: SettingsBundle = {
    kind: 'novel-settings-bundle',
    version: 1,
    exportedAt: Date.now(),
    worldview: worldview ?? undefined,
    characters,
  };
  return JSON.stringify(bundle, null, 2);
}

/** 解析并校验一个设定包 JSON（非法则抛错）。
 * 内容防御：外部构造的包可能缺字段/含 null 元素——worldview 缺关键字段剔除、
 * 人物缺 name 剔除，避免残缺数据入库后渲染崩溃。 */
export function parseSettingsBundle(json: string): SettingsBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('设定包不是合法 JSON');
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('设定包结构非法');
  }
  const b = raw as Partial<SettingsBundle>;
  if (b.kind !== 'novel-settings-bundle') {
    throw new Error('不是本应用生成的设定包');
  }
  if (!Array.isArray(b.characters)) {
    throw new Error('设定包缺少人物档案');
  }

  // worldview 必填字段白名单校验（worldStructure/powerSystem 至少其一非空）
  let worldview: Worldview | undefined;
  const wv = b.worldview as Partial<Worldview> | undefined;
  if (
    wv &&
    typeof wv === 'object' &&
    (typeof wv.worldStructure === 'string' || typeof wv.powerSystem === 'string')
  ) {
    worldview = {
      ...(wv as Worldview),
      rules: Array.isArray(wv.rules) ? wv.rules : [],
    };
  }

  // 人物元素：name 必须为非空字符串，否则剔除
  const characters = (b.characters as unknown[]).filter(
    (c): c is Character =>
      !!c &&
      typeof c === 'object' &&
      typeof (c as Partial<Character>).name === 'string' &&
      (c as Partial<Character>).name!.trim().length > 0
  );

  return {
    kind: 'novel-settings-bundle',
    version: 1,
    exportedAt: b.exportedAt ?? Date.now(),
    worldview,
    characters,
  };
}

/** 迁移到目标项目：重建 projectId 与 id，解锁已锁定内容，保持其余字段。返回 [worldview, characters] 上限可见数据。 */
export function rebindBundleToProject(
  bundle: SettingsBundle,
  targetProjectId: string
): { worldview: Worldview | null; characters: Character[] } {
  const now = Date.now();

  let worldview: Worldview | null = null;
  if (bundle.worldview) {
    worldview = {
      ...bundle.worldview,
      id: generateId('wv'),
      projectId: targetProjectId,
      locked: false,
      updatedAt: now,
    };
  }

  const characters: Character[] = bundle.characters.map((c) => ({
    ...c,
    id: generateId('char'),
    projectId: targetProjectId,
    locked: false,
    updatedAt: now,
  }));

  return { worldview, characters };
}

/**
 * 把设定包导入目标项目（覆盖目标既有的世界观/人物？否——仅当目标无该项时才写入，避免误覆盖）；
 * 通过注入的写入函数执行，便于在组件/测试中注入 IndexedDB 持久化。
 */
export async function importSettingsBundle(
  bundle: SettingsBundle,
  targetProjectId: string,
  writers: {
    saveWorldview: (wv: Worldview) => Promise<unknown>;
    saveCharacter: (c: Character) => Promise<unknown>;
    resolveWorldview: (projectId: string) => Promise<Worldview | undefined>;
  }
): Promise<{ importedWorldview: boolean; importedCharacters: number }> {
  const { worldview, characters } = rebindBundleToProject(bundle, targetProjectId);

  let importedWorldview = false;
  if (worldview) {
    const existing = await writers.resolveWorldview(targetProjectId);
    // 旧数据可能缺 rules 字段：先归一为数组再判空，避免 TypeError 中断导入
    const existingRules = Array.isArray(existing?.rules) ? existing!.rules : [];
    if (!existing || existingRules.length === 0) {
      await writers.saveWorldview(worldview);
      importedWorldview = true;
    }
  }

  let importedCharacters = 0;
  for (const c of characters) {
    await writers.saveCharacter(c);
    importedCharacters++;
  }

  return { importedWorldview, importedCharacters };
}