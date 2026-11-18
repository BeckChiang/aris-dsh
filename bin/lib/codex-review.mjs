// GPT 外审通道：直接调用本机 Codex CLI（方案 B），不经邮箱。
// 关键点：
//  1) 额度闸门（滑动小时窗）在真正 spawn 之前执行，UI 上的数字只是显示；
//  2) 每次调用都落审计日志，DSH 重启后仍能查到「这一轮是谁审的、用的什么模型」；
//  3) 模型清单从 codex 自己的缓存读，不写死枚举，钉死的型号消失时报错而不是静默回退。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { acquireReviewLock, inspectReviewLock, releaseReviewLock, reviewLockFile } from './review-lock.mjs';
import { readReviewRoute, routeBlocks } from './review-route.mjs';

export const CODEX_HOME = path.join(os.homedir(), '.codex');
const WINDOW_MS = 60 * 60 * 1000;

/** 任务分类：按「这一单要审什么」分档，不对应流水线阶段。
 *  流水线阶段会变（S1…S6 是某篇论文的分法），任务类型是稳定的。 */
export const CODEX_TASKS = [
  { key: 'format_check', label: '格式/数据核对', model: 'gpt-6-luna', effort: 'low', hint: '规则明确的机械活：章节齐全、数字前后一致、表格字段对得上' },
  { key: 'routine_review', label: '常规审查', model: 'gpt-6.2-sol', effort: 'medium', hint: '日常文档与改动审查，最常用的一档' },
  { key: 'deep_attack', label: '深度论证攻击', model: 'gpt-6.2-astra', effort: 'high', hint: '找致命反驳、跨材料综合、大改方案审读' },
  { key: 'claim_audit', label: '论点—证据核对', model: 'gpt-6.1-terra', effort: 'medium', hint: '逐条结论回原文找证据，常要读图与版面' },
  { key: 'citation_audit', label: '引用与元数据', model: 'gpt-6-luna', effort: 'low', hint: 'bib / DOI / 页码 / 作者顺序比对' },
  { key: 'layout_check', label: '版面与图表', model: 'gpt-6.1-terra', effort: 'medium', hint: '排版、图注、图内文字可读性' },
  { key: 'writing_review', label: '写作与结构审读', model: 'gpt-6.2-sol', effort: 'medium', hint: '行文、章节结构、读者可理解性' },
];

/** 旧配置键（流水线阶段）→ 任务分类，读配置时自动迁移。 */
const LEGACY_STAGE_MAP = {
  S1_formal: 'format_check',
  S2_data: 'format_check',
  S3_baseline: 'routine_review',
  S4_core: 'routine_review',
  S5_experiments: 'deep_attack',
  S6_writing: 'writing_review',
  kill_argument: 'deep_attack',
  claim_audit: 'claim_audit',
  citation_audit: 'citation_audit',
  layout_check: 'layout_check',
};

/** @deprecated 旧名，保留给还按「环节」引用的调用方。 */
export const CODEX_STAGES = CODEX_TASKS;

export const CODEX_DEFAULTS = {
  enabled: false,
  hourlyLimit: 4,
  dailyLimit: 0, // 0 = 不限制
  timeoutMinutes: 8,
  proxy: 'http://127.0.0.1:7897',
  maxChars: 250000, // 单稿上限（Astra 只有 272k 上下文，这里取保守值）
  sandboxMode: 'read-only', // read-only=只读正文（安全）| danger-full-access=允许它自己翻仓库
  tasks: Object.fromEntries(CODEX_TASKS.map((s) => [s.key, { model: s.model, effort: s.effort, enabled: true }])),
};

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function settingsFile(workspace) {
  return path.join(workspace, '.dsh', 'aris-dashboard.json');
}

export function budgetFile(workspace) {
  return path.join(workspace, '.dsh', 'codex-budget.json');
}

export function runsLogFile(workspace) {
  return path.join(workspace, '.dsh', 'codex-runs.jsonl');
}

/** 合并后的 GPT 外审配置（工作区设置为准，缺项用默认值）。 */
export function readCodexConfig(workspace) {
  const raw = readJsonSafe(settingsFile(workspace), {}) || {};
  const ext = (raw.external && raw.external.codex) || {};
  // 新键是 ext.tasks（任务分类），旧键是 ext.stages（流水线阶段）：都读，旧键按表迁移，
  // 同一分类下新键优先（先铺旧的，再被新的覆盖）。
  const normalized = {};
  for (const [k, v] of Object.entries(ext.stages || {})) {
    const key = LEGACY_STAGE_MAP[k] || k;
    if (!CODEX_TASKS.some((t) => t.key === key)) continue;
    normalized[key] = { ...(normalized[key] || {}), ...(v || {}) };
  }
  for (const [k, v] of Object.entries(ext.tasks || {})) {
    const key = LEGACY_STAGE_MAP[k] || k;
    if (!CODEX_TASKS.some((t) => t.key === key)) continue;
    normalized[key] = { ...(normalized[key] || {}), ...(v || {}) };
  }
  const tasks = {};
  for (const t of CODEX_TASKS) {
    const saved = normalized[t.key] || {};
    tasks[t.key] = {
      model: String(saved.model || t.model),
      effort: String(saved.effort || t.effort),
      enabled: saved.enabled !== false,
    };
  }
  return {
    ...CODEX_DEFAULTS,
    ...ext,
    tasks,
    hourlyLimit: Math.max(1, Math.min(60, Number(ext.hourlyLimit ?? CODEX_DEFAULTS.hourlyLimit) || 1)),
    dailyLimit: Math.max(0, Number(ext.dailyLimit || 0)),
    timeoutMinutes: Math.max(1, Math.min(30, Number(ext.timeoutMinutes || CODEX_DEFAULTS.timeoutMinutes))),
    enabled: Boolean(ext.enabled),
  };
}

export function saveCodexConfig(workspace, patch = {}) {
  const raw = readJsonSafe(settingsFile(workspace), {}) || {};
  const ext = { ...((raw.external && raw.external.codex) || {}) };
  for (const key of ['enabled', 'hourlyLimit', 'dailyLimit', 'timeoutMinutes', 'proxy', 'maxChars', 'sandboxMode']) {
    if (patch[key] != null) ext[key] = patch[key];
  }
  const incoming = patch.tasks || patch.stages;
  if (incoming && typeof incoming === 'object') {
    // 先按任务分类把旧键迁过来，避免新旧两套并存导致读的时候谁覆盖谁说不清
    const next = {};
    for (const [k, v] of Object.entries(ext.stages || {})) {
      const key = LEGACY_STAGE_MAP[k] || k;
      if (CODEX_TASKS.some((t) => t.key === key)) next[key] = { ...(next[key] || {}), ...(v || {}) };
    }
    for (const [k, v] of Object.entries(ext.tasks || {})) {
      const key = LEGACY_STAGE_MAP[k] || k;
      if (CODEX_TASKS.some((t) => t.key === key)) next[key] = { ...(next[key] || {}), ...(v || {}) };
    }
    for (const [k, v] of Object.entries(incoming)) {
      const key = LEGACY_STAGE_MAP[k] || k;
      if (!CODEX_TASKS.some((t) => t.key === key)) continue;
      next[key] = { ...(next[key] || {}), ...(v || {}) };
    }
    ext.tasks = next;
    delete ext.stages;
  }
  raw.external = { ...(raw.external || {}), codex: ext };
  writeJsonAtomic(settingsFile(workspace), raw);
  return readCodexConfig(workspace);
}

// ---------------------------------------------------------------------------
// 解析 codex.exe：WindowsApps 目录带版本号，只能通配取最新

function versionRank(name) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)/.exec(name);
  if (!m) return -1;
  return Number(m[1]) * 1e9 + Number(m[2]) * 1e6 + Number(m[3]) * 1e3 + Number(m[4]);
}

let exeCache = null;

/** 通过 appx 包信息问安装位置（WindowsApps 目录本身不可枚举：EPERM） */
function appxInstallLocation() {
  const probes = [
    ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation']],
    ['pwsh', ['-NoProfile', '-NonInteractive', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation']],
  ];
  for (const [cmd, args] of probes) {
    try {
      const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 8000 });
      const out = String(r.stdout || '').trim().split(/\r?\n/).pop().trim();
      if (r.status === 0 && /^[A-Za-z]:\\/.test(out)) return out;
    } catch {
      /* 换下一个 */
    }
  }
  return '';
}

export function resolveCodexExe() {
  if (exeCache) return exeCache;
  const candidates = [];
  const install = appxInstallLocation();
  if (install) candidates.push(path.join(install, 'app', 'resources', 'codex.exe'));
  try {
    const base = 'C:\\Program Files\\WindowsApps';
    const dirs = fs
      .readdirSync(base)
      .map((name) => ({ name, rank: versionRank((/^OpenAI\.Codex_([^_]+)_x64__/.exec(name) || [])[1] || '') }))
      .filter((d) => d.rank >= 0)
      .sort((a, b) => b.rank - a.rank);
    for (const d of dirs) candidates.push(path.join(base, d.name, 'app', 'resources', 'codex.exe'));
  } catch {
    /* WindowsApps 不可枚举（EPERM）时靠 appx 查询 */
  }
  candidates.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'codex.exe'));
  for (const file of candidates) {
    try {
      if (file && fs.statSync(file).isFile()) {
        exeCache = file;
        return file;
      }
    } catch {
      /* 下一个候选 */
    }
  }
  exeCache = 'codex'; // PATH 里的命令（可能不存在，spawn 时会报 ENOENT）
  return exeCache;
}

// ---------------------------------------------------------------------------
// 模型清单

export function listModels() {
  const cache = readJsonSafe(path.join(CODEX_HOME, 'models_cache.json'), null);
  const models = (cache && Array.isArray(cache.models) ? cache.models : [])
    .filter((m) => m && m.slug && !String(m.slug).startsWith('codex-auto'))
    .map((m) => ({
      slug: m.slug,
      name: m.display_name || m.slug,
      contextWindow: Number(m.context_window || 0),
      defaultEffort: m.default_reasoning_level || 'medium',
      efforts: (m.supported_reasoning_levels || []).map((x) => x.effort),
    }));
  return { fetchedAt: (cache && cache.fetched_at) || null, models };
}

export function modelInfo(slug) {
  return listModels().models.find((m) => m.slug === slug) || null;
}

// ---------------------------------------------------------------------------
// 额度闸门

export function readBudget(workspace) {
  const now = Date.now();
  const raw = readJsonSafe(budgetFile(workspace), {}) || {};
  const calls = (Array.isArray(raw.calls) ? raw.calls : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && now - v < WINDOW_MS);
  const day = raw.day && typeof raw.day === 'object' ? raw.day : {};
  const today = new Date().toISOString().slice(0, 10);
  return {
    calls,
    day: { date: day.date === today ? today : today, count: day.date === today ? Number(day.count) || 0 : 0 },
    consecutiveFailures: Number(raw.consecutiveFailures) || 0,
    last: raw.last || null,
  };
}

function writeBudget(workspace, budget) {
  writeJsonAtomic(budgetFile(workspace), budget);
}

/** 只在真正 spawn 前调用；拒绝时给出还要等多久。 */
export function checkBudget(workspace, cfg = readCodexConfig(workspace)) {
  const budget = readBudget(workspace);
  const used = budget.calls.length;
  const remaining = Math.max(0, cfg.hourlyLimit - used);
  if (remaining <= 0) {
    const oldest = Math.min(...budget.calls);
    const waitMinutes = Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - oldest)) / 60000));
    return { ok: false, reason: `本小时额度已用完（${cfg.hourlyLimit} 次/小时），约 ${waitMinutes} 分钟后恢复`, remaining: 0, waitMinutes, used, budget };
  }
  if (cfg.dailyLimit > 0 && budget.day.count >= cfg.dailyLimit) {
    return { ok: false, reason: `今日额度已用完（${cfg.dailyLimit} 次/天）`, remaining, waitMinutes: 0, used, budget };
  }
  if (budget.consecutiveFailures >= 3) {
    return { ok: false, reason: '连续 3 次失败，GPT 外审已自动停摆，请在面板恢复', remaining, waitMinutes: 0, used, budget };
  }
  return { ok: true, remaining, used, budget, hourlyLimit: cfg.hourlyLimit, waitMinutes: 0 };
}

function recordCall(workspace, { ok, entry }) {
  const budget = readBudget(workspace);
  if (ok) {
    budget.calls.push(Date.now());
    budget.consecutiveFailures = 0;
  } else {
    budget.consecutiveFailures += 1;
  }
  budget.day.count += 1;
  budget.last = entry;
  writeBudget(workspace, budget);
  try {
    fs.mkdirSync(path.dirname(runsLogFile(workspace)), { recursive: true });
    fs.appendFileSync(runsLogFile(workspace), JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    /* 审计写失败不影响主流程 */
  }
  return budget;
}

// ---------------------------------------------------------------------------
// 执行

function runDir(root) {
  return path.join(root, '.aris-run', 'codex');
}

function freshLock(workspace, ttlMs, taskKey) {
  // 与 Kimi 邮箱共用同一把审核锁：两条通道任意时刻只能有一条在跑
  const got = acquireReviewLock(workspace, { channel: 'gpt', task: taskKey, ttlMs });
  if (!got.ok) return { ok: false, holder: got.holder };
  return { ok: true, file: reviewLockFile(workspace) };
}

function releaseLock(workspace) {
  releaseReviewLock(workspace, 'gpt');
}

function parseTokens(text) {
  const m = /tokens used[^0-9]*([\d,]+)/i.exec(String(text || ''));
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/**
 * 跑一次 GPT 外审。
 * @param {{workspace:string, root:string, taskKey:string, task:string, model?:string, effort?:string, stamp?:string}} input
 *   taskKey = 任务分类（format_check / routine_review / …）；旧调用方传 gate= 也认。
 */
export async function runCodexReview(input) {
  const { workspace, root } = input;
  const taskKey = String(input.taskKey || input.gate || 'routine_review');
  const cfg = readCodexConfig(workspace);
  if (!cfg.enabled) return { ok: false, skipped: true, error: 'GPT 外审未启用（面板「审核」开关）' };
  const blocked = routeBlocks(workspace, 'gpt');
  if (blocked) return { ok: false, blocked: true, error: blocked };
  const pick = cfg.tasks[taskKey] || { model: 'gpt-6.2-sol', effort: 'medium', enabled: true };
  if (pick.enabled === false) return { ok: false, skipped: true, error: `任务分类 ${taskKey} 未启用 GPT 外审` };
  const model = String(input.model || pick.model);
  const effort = String(input.effort || pick.effort);
  const info = modelInfo(model);
  if (!info) {
    return { ok: false, error: `模型 ${model} 不在本机 codex 清单里（钉死的型号可能已下线），请重新选择` };
  }
  if (info.efforts.length && !info.efforts.includes(effort)) {
    return { ok: false, error: `模型 ${model} 不支持思考强度 ${effort}（可选 ${info.efforts.join('/')}）` };
  }
  const task = String(input.task || '');
  if (!task.trim()) return { ok: false, error: '审查任务为空' };
  if (task.length > cfg.maxChars) {
    return { ok: false, error: `稿件过大（${task.length} 字符 > 上限 ${cfg.maxChars}），请分节送审` };
  }

  // 先看锁再扣额度：并发撞车时给出「谁在跑」，比「额度用完」有用得多
  const current = inspectReviewLock(workspace);
  if (current.locked && !current.expired) {
    return {
      ok: false,
      busy: true,
      error: `已有审核在跑（${current.channel} · ${current.task || '-'} · ${current.target || '-'}，${Math.round((current.ageMs || 0) / 60000)} 分钟前开始），等它结束再派单`,
    };
  }

  const gateCheck = checkBudget(workspace, cfg);
  if (!gateCheck.ok) return { ok: false, limited: true, error: gateCheck.reason, remaining: gateCheck.remaining };

  const timeoutMs = cfg.timeoutMinutes * 60_000;
  const lock = freshLock(workspace, timeoutMs + 60_000, taskKey);
  if (!lock.ok) return { ok: false, busy: true, error: '已有一次外审在跑，等它结束再派单' };

  const stamp = input.stamp || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = runDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const taskFile = path.join(dir, `${stamp}-${taskKey}.task.md`);
  const outFile = path.join(dir, `${stamp}-${taskKey}.reply.md`);
  fs.writeFileSync(taskFile, task, 'utf8');

  const sandbox = cfg.sandboxMode === 'danger-full-access' ? 'danger-full-access' : 'read-only';
  // read-only 沙箱在这台机上起不了 codex 的 shell 辅助进程（orchestrator_helper_exit_nonzero），
  // 所以默认让它只读消息正文、别去碰文件；要真的翻仓库只能显式开 danger-full-access。
  const header = [
    `你是独立的第三方审稿人（模型 ${model}，思考强度 ${effort}）。`,
    sandbox === 'read-only'
      ? '本环境没有可用的 shell 与文件读取工具：唯一证据就是这条消息里的正文。不要尝试执行命令或打开文件，也不要因为「读不到文件」而拒审。'
      : '你可以执行只读命令查看本仓库，但不得修改、创建或删除任何文件；证据仍以正文原文为准。',
    '最终回答用 Markdown，第一行固定自报身份。',
    '',
    '--- 以下是审稿任务与正文 ---',
    '',
  ].join('\n');
  const fullPrompt = header + task;

  const exe = resolveCodexExe();
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox', sandbox,
    '--ephemeral',
    '--color', 'never',
    '-C', root,
    '-m', model,
    '-c', `model_reasoning_effort=${effort}`,
    '-o', outFile,
  ];
  const started = Date.now();
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(exe, args, {
      cwd: root,
      env: { ...process.env, HTTPS_PROXY: cfg.proxy, HTTP_PROXY: cfg.proxy, CODEX_HOME },
      windowsHide: true,
      // prompt 走 stdin：argv 有 32k 上限，而稿件动辄十几万字
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.on('error', () => { /* 子进程提前退出时忽略 EPIPE */ });
    child.stdin.end(fullPrompt, 'utf8');
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已退出 */
      }
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += String(d);
      if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
      if (stderr.length > 100_000) stderr = stderr.slice(-50_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(err && err.message), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
  releaseLock(workspace);

  let text = '';
  try {
    text = fs.readFileSync(outFile, 'utf8');
  } catch {
    text = '';
  }
  const ok = result.code === 0 && !result.timedOut && text.trim().length > 0;
  const tokens = parseTokens(result.stdout + result.stderr);
  // CLI 头部的 model/effort 才是「实际跑的是谁」，模型自报经常是错的，两个都记
  // 注意：banner 有时走 stderr（-o 文件 + stdin 提示词时），两边都要找
  const banner = `${result.stdout || ''}\n${result.stderr || ''}`;
  const cliModel = (/^model:\s*(\S+)/m.exec(banner) || [])[1] || '';
  const cliEffort = (/^reasoning effort:\s*(\S+)/m.exec(banner) || [])[1] || '';
  const entry = {
    at: startedAt,
    task: taskKey,
    model,
    effort,
    cliModel,
    cliEffort,
    sandbox,
    ms: Date.now() - started,
    ok,
    timedOut: result.timedOut,
    code: result.code,
    tokens,
    chars: task.length,
    reply: ok ? path.relative(root, outFile) : '',
    error: ok ? '' : (result.timedOut ? `超过 ${cfg.timeoutMinutes} 分钟被终止` : (result.stderr || result.stdout || '').trim().slice(-400) || `退出码 ${result.code}`),
  };
  const budget = recordCall(workspace, { ok, entry });

  if (!ok) {
    return {
      ok: false,
      error: entry.error,
      entry,
      remaining: Math.max(0, cfg.hourlyLimit - budget.calls.length),
      stderr: result.stderr.slice(-2000),
    };
  }
  return {
    ok: true,
    text,
    model,
    effort,
    cliModel,
    cliEffort,
    tokens,
    ms: entry.ms,
    reply: outFile,
    entry,
    remaining: Math.max(0, cfg.hourlyLimit - budget.calls.length),
  };
}

/** 面板状态：额度、最近几次、可执行性。 */
export function codexState(workspace) {
  const cfg = readCodexConfig(workspace);
  const budget = readBudget(workspace);
  const models = listModels();
  const exe = resolveCodexExe();
  const exeOk = exe === 'codex' ? Boolean(which('codex')) : true;
  let recent = [];
  try {
    recent = fs
      .readFileSync(runsLogFile(workspace), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-20)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    recent = [];
  }
  const taskDefs = CODEX_TASKS.map((t) => ({ key: t.key, label: t.label, hint: t.hint }));
  return {
    route: readReviewRoute(workspace),
    config: cfg,
    taskDefs,
    stageDefs: taskDefs, // 旧名兼容
    lock: inspectReviewLock(workspace),
    exe,
    exeOk,
    models: models.models,
    modelsFetchedAt: models.fetchedAt,
    usedThisHour: budget.calls.length,
    remainingThisHour: Math.max(0, cfg.hourlyLimit - budget.calls.length),
    todayCount: budget.day.count,
    consecutiveFailures: budget.consecutiveFailures,
    last: budget.last,
    recent,
  };
}

function which(cmd) {
  try {
    const r = spawnSync('where', [cmd], { encoding: 'utf8', windowsHide: true });
    return r.status === 0 && String(r.stdout).trim();
  } catch {
    return false;
  }
}
