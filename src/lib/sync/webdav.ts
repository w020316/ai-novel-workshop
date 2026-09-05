// ============================================================================
// WebDAV 云同步（备份上传 / 远端列表 / 恢复 / 删除）
// 设计：
//   - 不引入第三方依赖，WebDAV 即 HTTP 动词（PUT / PROPFIND / GET / DELETE）
//   - 浏览器直连 WebDAV 服务（坚果云等）普遍被 CORS 拦截，
//     统一走服务端代理 /api/webdav/proxy（同源无 CORS，且代理层做 SSRF 校验）
//   - 配置（含应用密码）仅存本机 localStorage，不落库不上传
//   - parsePropfind / buildWebdavPath / backupFilename 为纯函数，确定性可测
// ============================================================================
import type { ProjectBackup } from '@/lib/export/backup';

export interface WebDAVConfig {
  /** 服务器根地址，如 https://dav.jianguoyun.com/dav/ */
  serverUrl: string;
  username: string;
  /** 多数服务要求使用「应用密码」而非登录密码（如坚果云） */
  password: string;
  /** 远端目录（相对 serverUrl），如 ai-novel-workshop；留空=根目录 */
  remoteDir: string;
}

export interface RemoteBackup {
  /** 远端完整路径（相对 serverUrl，已解码），供恢复/删除回传 */
  path: string;
  filename: string;
  modifiedAt: number | null;
  size: number | null;
}

const STORAGE_KEY = 'webdav_sync_config';

export function loadWebdavConfig(): WebDAVConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as WebDAVConfig;
    if (!cfg?.serverUrl) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveWebdavConfig(cfg: WebDAVConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearWebdavConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 拼接远端完整路径：规范化目录两端斜杠，避免 `dir//file` 或缺分隔符。
 * 纯函数。
 */
export function buildWebdavPath(remoteDir: string, filename: string): string {
  const dir = remoteDir.trim().replace(/^\/+|\/+$/g, '');
  const file = filename.trim().replace(/^\/+/g, '');
  return dir ? `${dir}/${file}` : file;
}

/** 备份文件名（与本地下载命名一致），纯函数 */
export function backupFilename(title: string, exportedAt: number): string {
  const safeTitle = title.replace(/[\\/:*?"<>|\s]+/g, '_');
  const date = new Date(exportedAt).toISOString().slice(0, 10);
  return `backup_${safeTitle}_${date}.json`;
}

/**
 * 解析 PROPFIND multistatus XML → 文件列表（跳过目录）。
 * 用正则而非 DOMParser：命名空间前缀（D:/d:/无前缀）各异，
 * 正则按「可选前缀 + 固定标签名」匹配，且环境无关、确定性可测。纯函数。
 */
export function parsePropfind(xml: string): RemoteBackup[] {
  const out: RemoteBackup[] = [];
  const blockRe = /<(?:[A-Za-z0-9]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?response>/gi;
  for (const m of xml.matchAll(blockRe)) {
    const block = m[1];
    // 目录（collection）跳过，只保留文件
    if (/<(?:[A-Za-z0-9]+:)?collection\b\s*\/?>/i.test(block)) continue;
    const href = tag(block, 'href');
    if (!href) continue;
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch {
      // 个别服务 href 编码异常：保留原值
    }
    const modifiedRaw = tag(block, 'getlastmodified');
    const modifiedAt = modifiedRaw ? Date.parse(modifiedRaw) : NaN;
    const sizeRaw = tag(block, 'getcontentlength');
    out.push({
      path: path.replace(/^\/+/g, ''),
      filename: path.split('/').pop() ?? path,
      modifiedAt: Number.isNaN(modifiedAt) ? null : modifiedAt,
      size: sizeRaw != null && !Number.isNaN(Number(sizeRaw)) ? Number(sizeRaw) : null,
    });
  }
  // 新备份在前
  out.sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
  return out;
}

/** 提取单个标签文本（容忍命名空间前缀），纯函数内部工具 */
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<(?:[A-Za-z0-9]+:)?${name}\\b[^>]*>([\\s\\S]*?)<`, 'i').exec(block);
  return m ? m[1].trim() : null;
}

/** 解析备份 JSON 并做形状校验（复用导入恢复的解析，含 Float32Array 复原） */
export async function parseRemoteBackup(json: string): Promise<ProjectBackup> {
  const { parseBackup } = await import('@/lib/import/restore');
  return parseBackup(json);
}

// ---------------- 代理调用（POST /api/webdav/proxy） ----------------

interface ProxyRequest {
  action: 'put' | 'get' | 'list' | 'delete';
  url: string;
  username: string;
  password: string;
  payload?: string;
}

async function callProxy(req: ProxyRequest): Promise<string> {
  const res = await fetch('/api/webdav/proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; text?: string } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `代理请求失败（HTTP ${res.status}）`);
  }
  return data.text ?? '';
}

function absoluteUrl(config: WebDAVConfig, path: string): string {
  const base = config.serverUrl.trim().replace(/\/+$/g, '');
  const p = path.replace(/^\/+/g, '');
  return `${base}/${p}`;
}

/** 上传备份 JSON（PUT）。返回远端完整路径 */
export async function uploadBackup(config: WebDAVConfig, backup: ProjectBackup): Promise<string> {
  const json = JSON.stringify(backup, (_key, value) => {
    if (value instanceof Float32Array) {
      return { __type: 'Float32Array', data: Array.from(value) };
    }
    return value;
  });
  const path = buildWebdavPath(
    config.remoteDir,
    backupFilename(backup.project.title, backup.exportedAt)
  );
  await callProxy({
    action: 'put',
    url: absoluteUrl(config, path),
    username: config.username,
    password: config.password,
    payload: json,
  });
  return path;
}

/** 列出远端目录下已上传的备份（PROPFIND Depth:1） */
export async function listBackups(config: WebDAVConfig): Promise<RemoteBackup[]> {
  const dirPath = buildWebdavPath(config.remoteDir, '');
  const xml = await callProxy({
    action: 'list',
    url: absoluteUrl(config, dirPath),
    username: config.username,
    password: config.password,
  });
  return parsePropfind(xml).filter((b) => b.filename.endsWith('.json'));
}

/** 拉取远端备份 JSON 原文（GET） */
export async function fetchBackupJson(config: WebDAVConfig, path: string): Promise<string> {
  return callProxy({
    action: 'get',
    url: absoluteUrl(config, path),
    username: config.username,
    password: config.password,
  });
}

/** 删除远端备份（DELETE） */
export async function deleteRemoteBackup(config: WebDAVConfig, path: string): Promise<void> {
  await callProxy({
    action: 'delete',
    url: absoluteUrl(config, path),
    username: config.username,
    password: config.password,
  });
}
