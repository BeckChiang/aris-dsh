// 流水线注册表与只读快照。
//
// 约定：
//   <工作区>/.dsh/aris-dashboard.json   面板设置（邮箱、模型、Kimi 间隔…）
//   <工作区>/.dsh/aris-projects.json    流水线注册表
//   <流水线根>/.aris-run/               本运行器的全部私有状态（Kimi 侧完全不读它）
//   <流水线根>/.aris/                   通用 ARIS 状态机
//   <流水线根>/pipeline/                Frrs 既有状态机（gate.py + state.json）
import fs from 'node:fs';
import path from 'node:path';

export const RUN_DIR = '.aris-run';

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readText(file, limit = 400_000) {
  try {
    return fs.readFileSync(file).subarray(0, limit).toString('utf8');
  } catch {
    return null;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 清掉同名 JSON 遗留的 .tmp-* 残片（rename 被占住时会留下）。只碰 5 分钟前的，避免误删正在写的。 */
function gcTmp(file) {
  const dir = path.dirname(file);
  const base = path.basename(file) + '.tmp-';
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const name of names) {
    if (!name.startsWith(base)) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch { /* 别人正在用就算了 */ }
  }
}

export function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  gcTmp(file);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body, 'utf8');
  // 同步盘/杀软会短暂占住目标文件，rename 可能 EPERM/EBUSY：退避重试，仍失败则原地写。
  for (let i = 0; i < 6; i += 1) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const code = err && err.code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES' && code !== 'EEXIST') {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        throw err;
      }
      const until = Date.now() + 20 * (i + 1);
      while (Date.now() < until) { /* 同步退避，避免与插件事件循环的异步写交错 */ }
    }
  }
  try {
    fs.writeFileSync(file, body, 'utf8');
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
}

export function appendLine(file, line) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${line}\n`, 'utf8');
}

export function tailLines(file, count = 60) {
  const text = readText(file);
  if (text == null) return [];
  return text.split(/\r?\n/).filter((l) => l.trim()).slice(-count);
}

export function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 设置

export const DEFAULT_SETTINGS = {
  mailbox: '',
  nodePath: '',
  dshPath: '',
  pollMs: 5000,
  model: 'deepseek-flash',
  permissionMode: 'danger-full-access',
  maxConcurrent: 2,
  maxMinutes: 45,
  kimi: { intervalMinutes: 30, reviewMinutes: 15, autoCollect: true, startTime: '' },
  eventsPerCard: 6,
  collectTask: { enabled: false, intervalMinutes: 10, name: 'ARIS Mailbox Collect' },
  prices: null,
  holidays: [],
  projectRoots: [],
};

function mergeSettings(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const out = { ...base, ...(raw || {}) };
  out.kimi = { ...base.kimi, ...(raw && raw.kimi) };
  out.eventsPerCard = Math.max(0, Number(out.eventsPerCard) || 0);
  out.collectTask = { ...base.collectTask, ...(raw && raw.collectTask) };
  return out;
}

export function settingsFile(workspace) {
  return path.join(workspace, '.dsh', 'aris-dashboard.json');
}

export function readSettings(workspace) {
  const file = settingsFile(workspace);
  const raw = readJson(file, null);
  return { ...mergeSettings(raw), file, present: Boolean(raw) };
}

export function saveSettings(workspace, patch) {
  const file = settingsFile(workspace);
  const current = readJson(file, {}) || {};
  const next = { ...current, ...(patch || {}) };
  if (patch && patch.kimi) next.kimi = { ...(current.kimi || {}), ...patch.kimi };
  if (patch && patch.collectTask) next.collectTask = { ...(current.collectTask || {}), ...patch.collectTask };
  writeJsonAtomic(file, next);
  return readSettings(workspace);
}

// ---------------------------------------------------------------------------
// 注册表

export function registryFile(workspace) {
  return path.join(workspace, '.dsh', 'aris-projects.json');
}

/** 兼容三种历史写法：数组 / {projects:[]} / {projects:{id:entry}}。 */
export function readRegistry(workspace) {
  const raw = readJson(registryFile(workspace), null);
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.projects)) list = raw.projects;
  else if (raw && raw.projects && typeof raw.projects === 'object') list = Object.entries(raw.projects).map(([id, v]) => ({ id, ...v }));
  return list
    .filter((item) => item && (item.root || item.project || item.stateDir))
    .map((item) => normalizeEntry(item));
}

/** 把历史遗留的 driver 值收拢成 frrs|aris|auto。 */
function pickDriverValue(item) {
  const raw =
    (item.driver && typeof item.driver === 'object' ? item.driver.driver : item.driver) ||
    (item.kind && typeof item.kind === 'object' ? item.kind.driver : item.kind) ||
    '';
  const text = String(raw).trim();
  return text === 'frrs' || text === 'aris' ? text : 'auto';
}

export function normalizeEntry(item) {
  const root = path.resolve(String(item.root || item.project || path.dirname(String(item.stateDir || ''))));
  const id = String(item.id || slug(path.basename(root)) || 'pipeline');
  return {
    id,
    name: String(item.name || path.basename(root) || id),
    root,
    driver: pickDriverValue(item),
    addedAt: item.addedAt || item.createdAt || null,
  };
}

export function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function writeRegistry(workspace, entries) {
  const projects = entries.map((e) => ({
    id: e.id,
    name: e.name,
    root: e.root,
    driver: e.driver || 'auto',
    addedAt: e.addedAt || new Date().toISOString(),
  }));
  writeJsonAtomic(registryFile(workspace), { version: 2, projects });
  return projects;
}

export function upsertProject(workspace, entry) {
  const list = readRegistry(workspace);
  const norm = normalizeEntry(entry);
  const idx = list.findIndex((x) => path.resolve(x.root).toLowerCase() === norm.root.toLowerCase());
  let saved;
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...norm, addedAt: list[idx].addedAt };
    saved = list[idx];
  } else {
    saved = { ...norm, addedAt: new Date().toISOString() };
    list.push(saved);
  }
  writeRegistry(workspace, list);
  return saved;
}

export function removeProject(workspace, root) {
  const target = path.resolve(root).toLowerCase();
  const list = readRegistry(workspace).filter((x) => path.resolve(x.root).toLowerCase() !== target);
  writeRegistry(workspace, list);
  return list;
}

// ---------------------------------------------------------------------------
// 流水线目录布局

export function runDir(root) {
  return path.join(root, RUN_DIR);
}

export function configFile(root) {
  return path.join(runDir(root), 'config.json');
}

export function runtimeFile(root) {
  return path.join(runDir(root), 'runtime.json');
}

export function costsFile(root) {
  return path.join(runDir(root), 'costs.jsonl');
}

export const DEFAULT_CONFIG = {
  driver: 'auto',
  enabled: false,
  model: '',
  maxMinutes: 0,
  intervalMinutes: 0,
  autoCollect: true,
  promptFile: 'prompt.md',
  limits: { dailyRuns: 0, dailyCny: 0 },
  frrs: { half: 'A', gate: 'pipeline/gate.py', state: 'pipeline/state.json' },
  aris: { stateDir: '.aris' },
};

export function readConfig(root) {
  const raw = readJson(configFile(root), null) || {};
  const merged = { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), ...raw };
  merged.frrs = { ...DEFAULT_CONFIG.frrs, ...(raw.frrs || {}) };
  merged.aris = { ...DEFAULT_CONFIG.aris, ...(raw.aris || {}) };
  merged.limits = { ...DEFAULT_CONFIG.limits, ...(raw.limits || {}) };
  return { ...merged, file: configFile(root), present: Boolean(raw) };
}

export function saveConfig(root, patch) {
  const current = readJson(configFile(root), {}) || {};
  const next = { ...current, ...(patch || {}) };
  if (patch && patch.frrs) next.frrs = { ...(current.frrs || {}), ...patch.frrs };
  if (patch && patch.aris) next.aris = { ...(current.aris || {}), ...patch.aris };
  if (patch && patch.limits) next.limits = { ...(current.limits || {}), ...patch.limits };
  writeJsonAtomic(configFile(root), next);
  return readConfig(root);
}

export function readRuntime(root) {
  const raw = readJson(runtimeFile(root), null) || {};
  const usage = raw.totals && raw.totals.usage ? raw.totals.usage : { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 };
  return {
    // 保留写进去的扩展字段（reviewGap / sessionId / waiting / gateReason / blockedUntil / pendingWarnAt …），
    // 只对已知字段做归一化；否则 readRuntime → saveRuntime 的往返会把它们悄悄丢掉。
    ...raw,
    status: raw.status || 'idle',
    pid: raw.pid || null,
    startedAt: raw.startedAt || null,
    finishedAt: raw.finishedAt || null,
    lastError: raw.lastError || null,
    runId: raw.runId || null,
    lastRun: raw.lastRun || null,
    totals: { runs: raw.totals?.runs || 0, usage, cny: raw.totals?.cny || 0 },
    nextAt: raw.nextAt || null,
    consecutiveErrors: raw.consecutiveErrors || 0,
  };
}

export function saveRuntime(root, patch) {
  const current = readJson(runtimeFile(root), {}) || {};
  const next = { ...current, ...(patch || {}) };
  if (patch && patch.totals) next.totals = { ...(current.totals || {}), ...patch.totals };
  writeJsonAtomic(runtimeFile(root), next);
  return readRuntime(root);
}

export function readCosts(root, limit = 300) {
  const text = readText(costsFile(root));
  if (!text) return [];
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* 坏行跳过 */
    }
  }
  return rows.slice(-limit);
}

// ---------------------------------------------------------------------------
// 驱动探测

/** 判断流水线类型；只看文件，不执行任何东西。 */
export function detectDriver(root) {
  const frrsState = path.join(root, 'pipeline', 'state.json');
  const frrsGate = path.join(root, 'pipeline', 'gate.py');
  if (isFile(frrsState) && isFile(frrsGate)) {
    return { driver: 'frrs', stateFile: frrsState, gateFile: frrsGate, confidence: 'high' };
  }
  const arisState = path.join(root, '.aris', 'state.json');
  if (isFile(arisState)) {
    return { driver: 'aris', stateFile: arisState, gateFile: '', confidence: 'high' };
  }
  const custom = readConfig(root);
  if (custom.driver && custom.driver !== 'auto') return { driver: custom.driver, stateFile: '', gateFile: '', confidence: 'config' };
  return { driver: 'unknown', stateFile: '', gateFile: '', confidence: 'none' };
}
