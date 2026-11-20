/** 运行时版本标记：面板会回显它，用来确认插件宿主加载的是不是最新模块（改完必须升这里 + aris-control 的 ?v=）。 */
export const RUNNER_REV = 50;
// 流水线运行器：为每条流水线起一次 dsh headless，记账、落日志、排下一次。
//
// 设计要点：
//   - 一条流水线同一时刻只有一个 headless 在跑（文件锁 + pid 存活检查）。
//   - 进程层面的所有状态都写在 <root>/.aris-run/，删掉这个目录即回到「没有运行器」。
//   - Kimi 那一侧完全不认识 .aris-run/，所以随时可以停掉 DSH 让 Kimi 接着跑。
import fs from 'node:fs';
import path from 'node:path';
import {
  appendLine,
  costsFile,
  detectDriver,
  ensureDir,
  readConfig,
  readRegistry,
  readRuntime,
  readSettings,
  readText,
  runDir,
  saveRuntime,
  saveConfig,
  writeJsonAtomic,
} from './aris-registry.mjs?v=46';
import { buildEnv, isPidAlive, killTree, resolveDsh, resolveNode, spawnHeadless, writeModelPatch } from './aris-dsh.mjs?v=46';
import { addUsage, normalizeUsage, priceUsage, rateFor, summarizeRuns, usageFromEvent, ZERO_USAGE } from './aris-cost.mjs?v=46';
import { appendEvent } from './aris-events.mjs?v=46';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);
}

export const RUNNING = new Map(); // root(lowercase) -> { runId, child }
const costCache = { key: '', value: null };
// 与 second/pipeline/gate.py 的 COOLDOWN 对齐；早于它起轮只会领到 IDLE。
const FRRS_COOLDOWN_MINUTES = Number(process.env.FRRS_COOLDOWN_MINUTES || 20);

/** Kimi 取件周期（分钟），面板设置里 kimi.intervalMinutes 是唯一真源。 */
export function kimiIntervalMinutes(settings = {}) {
  const n = Number(settings && settings.kimi && settings.kimi.intervalMinutes);
  return n > 0 ? n : 15;
}

/** 实际起轮间隔：DSH 跑时是 Kimi 周期的 2 倍（取件快于生成），交回 Kimi 时同频。 */
export function effectiveInterval(config = {}, settings = {}, mode = 'dsh') {
  const manual = Number(config.intervalMinutes) || 0;
  if (config.intervalSource === 'manual' && manual > 0) return manual;
  const base = kimiIntervalMinutes(settings);
  return mode === 'kimi' ? base : base * 2;
}

/** Kimi 取件的下一个格点：startTime + n·K；没设 startTime 就按“从现在起一个周期”。 */
export function nextKimiTick(settings = {}, fromMs = Date.now()) {
  const base = kimiIntervalMinutes(settings);
  const K = base * 60_000;
  const text = String((settings.kimi && settings.kimi.startTime) || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return fromMs + K;
  const anchor = new Date(fromMs);
  anchor.setHours(Number(m[1]), Number(m[2]), 0, 0);
  // 格点从「前一天同一起始时刻」开始按 K 递推，才能跨午夜正确（如 startTime 22:43、间隔 15 → 01:28 有效）。
  // 只从今天起算会在「现在早于起始时刻」时错跳到今晚（实测把 01:28 算成 22:43）。
  const first = anchor.getTime() - 24 * 3600_000;
  return first + Math.ceil((fromMs - first + 1) / K) * K;
}

/**
 * 下一轮何时起跑。DSH 的停顿只由一件事决定：
 *  - 有在途审稿：等下一次 Kimi 取件 + 审稿窗口，拿到完整返回再跑；
 *  - 没有在途审稿：立刻跑（20 分钟冷却只是给 Kimi 乒乓模式用的）。
 */
export function nextRunAt(settings = {}, mode = 'dsh', fromMs = Date.now(), { pending = false, submittedAt = 0, blockedUntil = 0 } = {}) {
  const base = kimiIntervalMinutes(settings);
  const review = Math.max(5, Number((settings.kimi && settings.kimi.reviewMinutes) || 15));
  if (pending) {
    // 以“送审时刻”为锚：送出去的包要等送审之后的下一次 Kimi 唤醒，而不是等本轮收尾。
    const anchor = Number(submittedAt) > 0 ? Number(submittedAt) : fromMs;
    let at = nextKimiTick(settings, anchor) + review * 60_000 + 60_000;
    const now = Date.now();
    if (at <= now) at = nextKimiTick(settings, now) + review * 60_000 + 60_000;
    return new Date(at).toISOString();
  }
  // GPT 侧额度用完时，下一轮也不能早于「额度恢复」那个时刻。
  if (blockedUntil && Number(blockedUntil) > fromMs) return new Date(Number(blockedUntil)).toISOString();
  if (mode === 'kimi') return new Date(fromMs + base * 60_000).toISOString();
  return new Date(fromMs).toISOString();
}

/** 邮箱里还在等回复的请求（按 target/state_dir 认领到具体流水线）。 */
export function pendingReviews(settings = {}, root = '') {
  const mailbox = String(settings.mailbox || '');
  if (!mailbox) return [];
  let index = null;
  try {
    index = JSON.parse(fs.readFileSync(path.join(mailbox, 'projects.json'), 'utf8'));
  } catch {
    return [];
  }
  const projects = (index && index.projects) || {};
  // Windows 路径分隔符不一致会让比对永远失败（root 用反斜杠、projects.json 用正斜杠）。
  const norm = (v) => String(v || '').split('\\').join('/').replace(/\/+$/, '').toLowerCase();
  const lower = norm(root);
  const out = [];
  for (const [base, entry] of Object.entries(projects)) {
    if (!entry) continue;
    if (!fs.existsSync(path.join(mailbox, 'in', `${base}.request.md`))) continue;
    const target = norm(entry.target_abs || entry.target);
    const sd = norm(entry.state_dir || entry.project);
    const mine = (target && target.startsWith(lower)) || (sd && sd.startsWith(lower));
    if (mine) out.push({ base, target: entry.target_abs || entry.target || '', created_at: entry.created_at });
  }
  return out;
}

/** 在途审稿的送审时刻（取最晚一条，用它推算下一次 Kimi 唤醒）。 */
export function pendingSubmittedAt(entries = []) {
  let at = 0;
  for (const e of entries) {
    const t = Date.parse(String((e && (e.created_at || e.createdAt)) || '')) || 0;
    if (t > at) at = t;
  }
  return at;
}

/** 在途审稿要等到什么时候：送审后的下一次 Kimi 唤醒 + 审稿窗口 + 1 分钟余量。 */
export function pendingWaitUntil(settings = {}, entries = [], now = Date.now()) {
  return Date.parse(nextRunAt(settings, 'dsh', now, { pending: true, submittedAt: pendingSubmittedAt(entries) }));
}

/** 今日（本机时区）已用：轮数与费用。 */
export function todayStats(root) {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let runs = 0;
  let cny = 0;
  let text = '';
  try {
    text = fs.readFileSync(costsFile(root), 'utf8');
  } catch {
    return { runs: 0, cny: 0, day: key };
  }
  for (const line of text.split(String.fromCharCode(10))) {
    if (!line.trim()) continue;
    let row = null;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const at = String(row.finishedAt || row.at || '');
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) continue;
    const lineKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (lineKey !== key) continue;
    runs += 1;
    cny += Number((row.cny && row.cny.total) || 0);
  }
  return { runs, cny: Math.round(cny * 1e6) / 1e6, day: key };
}

function handoffMode(workspace) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(workspace, '.dsh', 'aris-handoff.json'), 'utf8'));
    return j && j.mode === 'kimi' ? 'kimi' : 'dsh';
  } catch {
    return 'dsh';
  }
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function lockFile(root) {
  return path.join(runDir(root), 'lock.json');
}

function pidAlive(pid) {
  return isPidAlive(pid);
}

/** 读运行时并清理僵尸状态：状态是 running 但 pid 已经没了 → 记为中断。 */
export function reconcile(root) {
  const runtime = readRuntime(root);
  if (runtime.status === 'running' && runtime.pid && !pidAlive(runtime.pid)) {
    return saveRuntime(root, {
      status: 'error',
      pid: null,
      lastError: '上一次运行的进程已不存在（可能被系统终止或 DSH 重启）',
      finishedAt: new Date().toISOString(),
    });
  }
  return runtime;
}

export function isRunning(root) {
  const key = path.resolve(root).toLowerCase();
  if (RUNNING.has(key)) return true;
  const runtime = reconcile(root);
  return runtime.status === 'running';
}

/**
 * 回合结束后，如果 gate.py 的租约仍被本轮占着（模型忘了 --finish、或进程被中断），
 * 由运行器补一次收尾，避免 70 分钟空锁把后续回合全挡住。
 * 只认「本轮认领的租约」：wake_start 必须不早于本轮开始时间。
 */
export function releaseLeaseIfHeld(root, config = {}, { startedAt = 0, pending = 0 } = {}) {
  const driver = config.driver && config.driver !== 'auto' ? config.driver : detectDriver(root).driver;
  if (driver !== 'frrs') return null;
  const statePath = path.join(root, config.frrs?.state || 'pipeline/state.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
  const chain = state.chain || {};
  const startedMs = Date.parse(chain.wake_start || '') || 0;
  if (!chain.wake_owner || !startedMs) return null;
  if (Number(startedAt) && startedMs < Number(startedAt) - 120_000) return null;
  const half = config.frrs?.half || 'A';
  const args = ['pipeline/gate.py', 'pipeline/state.json', half, '--finish'];
  if (pending > 0) args.push('--async-wait');
  try {
    const out = execFileSync(process.env.ARIS_PYTHON || 'python', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    return { released: true, pending, out: String(out).trim().slice(-200) };
  } catch (error) {
    return { released: false, pending, error: String(error?.message || error).slice(-200) };
  }
}

/** 整份读一个 JSON；读不到/解析不了直接抛错，由调用方决定降级策略。 */
function readJsonFull(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}

/** 唤醒时的门禁：只读，不改任何状态。返回 {ok, reason}。 */
export function preflight(root, config = readConfig(root), settings = {}, mode = 'dsh') {
  // 本轮就在跑（租约是我们自己持的），不是“被别的执行者挡住”。
  if (isRunning(root)) {
    return { ok: false, reason: '本轮进行中', driver: config.driver, silent: true, retryAfterMs: 60_000 };
  }
  const driver = config.driver === 'auto' || !config.driver ? detectDriver(root).driver : config.driver;
  const limits = config.limits || {};
  const spent = todayStats(root);
  const maxRuns = Number(limits.dailyRuns) || 0;
  const maxCny = Number(limits.dailyCny) || 0;
  if ((maxRuns > 0 && spent.runs >= maxRuns) || (maxCny > 0 && spent.cny >= maxCny)) {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return {
      ok: false,
      reason: `今日已达上限（${spent.runs}${maxRuns ? `/${maxRuns}` : ''} 轮 · ¥${spent.cny.toFixed(4)}${maxCny ? `/${maxCny}` : ''}）`,
      driver,
      spent,
      retryAfterMs: midnight.getTime() - Date.now(),
    };
  }
  if (driver === 'frrs') {
    const stateFile = path.join(root, config.frrs.state || 'pipeline/state.json');
    let st = null;
    try { st = readJsonFull(stateFile); } catch (error) {
      return {
        ok: false,
        reason: `状态文件读取失败（${path.basename(stateFile)}）：${String((error && error.message) || error).slice(0, 120)}`,
        driver,
        retryAfterMs: 5 * 60_000,
      };
    }
    const status = String((st && st.status) || '');
    if (status === 'paused') return { ok: false, reason: '流水线处于 paused', driver, retryAfterMs: 5 * 60_000 };
    if (status === 'blocked_on_user') return { ok: false, reason: '等待人工处理（blocked_on_user）', driver, retryAfterMs: 10 * 60_000 };
    if (String(st.state || '') === 'done') return { ok: false, reason: '流水线已到 done', driver };
    const chain = st.chain || {};
    const owner = String(chain.wake_owner || '');
    const wakeStart = Date.parse(chain.wake_start || '');
    const leaseMs = 70 * 60_000;
    if (owner && Number.isFinite(wakeStart) && Date.now() - wakeStart < leaseMs) {
      const mins = Math.round((Date.now() - wakeStart) / 60_000);
      return { ok: false, reason: `另一方持有租约（${owner}，${mins} 分钟）`, driver, retryAfterMs: 60_000 };
    }
    if (mode === 'kimi' && FRRS_COOLDOWN_MINUTES > 0) {
      const last = Date.parse(chain.last_wake_end || '');
      const cool = FRRS_COOLDOWN_MINUTES * 60_000;
      if (Number.isFinite(last) && Date.now() - last < cool) {
        const mins = ((Date.now() - last) / 60_000).toFixed(1);
        return { ok: false, reason: `冷却中（距上次收尾 ${mins}/${FRRS_COOLDOWN_MINUTES} 分钟）`, driver, retryAfterMs: cool - (Date.now() - last) };
      }
    }
    const pend = pendingReviews(settings, root);
    if (pend.length) {
      const at = pendingWaitUntil(settings, pend, Date.now());
      return { ok: false, reason: `等待 Kimi 审稿返回（在途 ${pend.length} 条）`, driver, pending: pend.length, retryAfterMs: Math.max(60_000, at - Date.now()) };
    }
    // 连续两轮「该送却没送」就停跑等人工：只亮红标会继续烧钱产出无人审的代码。
    const gap = readRuntime(root).reviewGap || {};
    if (Number(gap.count || 0) >= 2) {
      return { ok: false, reason: `连续 ${gap.count} 轮未送审，已停跑等待人工处理`, driver, retryAfterMs: 10 * 60_000 };
    }
    return { ok: true, driver, mode, pending: 0 };
  }
  let ast = {};
  try { ast = readJsonFull(path.join(root, config.aris.stateDir || '.aris', 'state.json')); } catch (error) {
    return {
      ok: false,
      reason: `状态文件读取失败（.aris/state.json）：${String((error && error.message) || error).slice(0, 120)}`,
      driver,
      retryAfterMs: 5 * 60_000,
    };
  }
  if (String(ast.phase || '') === 'done') return { ok: false, reason: 'ARIS 已到 done', driver };
  const apend = pendingReviews(settings, root);
  if (apend.length) {
    const at = pendingWaitUntil(settings, apend, Date.now());
    return { ok: false, reason: `等待审稿返回（在途 ${apend.length} 条）`, driver, pending: apend.length, retryAfterMs: Math.max(60_000, at - Date.now()) };
  }
  return { ok: true, driver, mode, pending: 0 };
}
/** 人工在面板里写的裁决/补充说明，逐轮追加到提示词末尾，模型每轮都能看到最新一条。 */
function withHumanNote(root, text) {
  const note = readText(path.join(runDir(root), 'human-note.md')).slice(-4000).trim();
  if (!note) return text;
  return `${text}

===== 人工回复（面板提交，按最新在前）=====
${note}
`;
}

/** 送审前额度查询入口（bin/aris-quota.mjs）：提示词里给流水线执行者直接跑。 */
const QUOTA_CLI = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'bin', 'aris-quota.mjs');

/** 提示词版本：默认模板每次结构性变化就加一；流水线的 prompt.md 按此判断是否过期。 */
export function defaultPrompt(root, driver, config, settings, runId = '') {
  const stateRel = driver === 'frrs' ? config.frrs.state || 'pipeline/state.json' : path.join(config.aris.stateDir || '.aris', 'state.json');
  const rid = runId || stamp();
  const head = `【Dsh_Aris · ${path.basename(root)}】自动回合 ${rid}`;
  if (driver === 'frrs') {
    return [
      head,
      '',
      '你是 Frrs 论文二流水线执行者（DSH 侧，A 半区）。cwd 即根目录（勿再加 second/ 前缀），状态文件 `pipeline/state.json`。',
      '1. 读状态文件 + pipeline/handoff/latest.md 最新节，别通读 PIPELINE.md。',
      '2. status 为 paused/blocked_on_user/done → 不改文件，打印 RESULT: blocked <原因>。',
      '3. 用 `python pipeline/gate.py pipeline/state.json A` 认领；非 PROCEED → RESULT: idle。冷却已为 0，别自判 20 分钟。',
      '4. 只做一个原子块（当前 todo 首个未完成项），小步、可自测。',
      `5. 自测全绿 → 写 runs/${rid}-dsh.md，更新 state 的 todo/artifacts，不改 chain。`,
      '6. 完整做完一个子项且全绿才送审（每轮≤1 次）：dataset_gen 下拼 review_package_<scope>_r<轮>.md（首行 <!-- focused: true; scope: <scope>; round: <n> -->，含改动、证据、单测尾部，≤30000 字节），再',
      '   PYTHONIOENCODING=utf-8 python pipeline/review/mailbox_bridge.py --state-dir .aris --mailbox {{MAILBOX}} send --package <包> --tier review --out <out 路径> --scope <scope> --round <n>',
      '   全局参数（--state-dir/--mailbox）必须放在 send 之前；exit 0 且邮箱 queue.md 出现该请求才算入队；非 0 不绕过，写进 runs 日志；没送审则记「送审跳过：<缺什么>」。',
      `   **送审前必须先查额度**：跑 \`node ${QUOTA_CLI}\`，输出一行 JSON；\`blocked=true\` 时不要调用 mailbox_bridge（别浪费物理送审次数、别写 attempts），把本轮记成「送审跳过：等额度，<freeAt> 之后恢复」，继续下一个原子块或正常收尾。`,
      '   送审前自检：把该 scope 未关闭 MUST 的复现命令、diff、测试输出逐条列进包内证据（r5 是最终验收包，尤须如此）。',
      '   exit 8、gate=escalate/manual 或额度已尽 → 不送第 N+1 次，立即把 pipeline/state.json 置 blocked_on_user 并整理人工清单（bridge 已写 cap-review_*.md），等待人工裁决。',
      '7. 收尾 `gate.py … A --finish`：已送审加 `--async-wait`，无进展用 `--no-progress`。不改 Kimi automation / PIPELINE.md，不伪造结果。',
      '8. 收尾时把本轮真正做完的子项写进 state 的 `states.<阶段>.done`（数组，元素写 {text, at, runId, verdict}），并从 `todo` 移除；done 只增不删，没做完的不要写进去。',
      '',
      '末尾只打印：RESULT: <done|idle|blocked> <一句话>',
    ].join(String.fromCharCode(10));
  }
  return [
    head,
    '',
    '你是 ARIS 流水线的执行者（DSH 侧）。',
    `工作区：${root}`,
    `状态文件：${stateRel}`,
    '',
    '步骤：',
    '1. 读状态文件，确认当前阶段与门禁；需要时再按需读相关技能，不要整篇加载大技能。',
    '1.5 需要文献时只走 `node bin/lit.mjs lit "<topic>" --project .`（技能 `research-lit` 顶部横幅有约定），不要用 WebSearch 凭记忆写引用；正文只引用 papers.json 里的条目。',
    '2. 只推进一个原子工作块，并给出可执行的验证方式。',
    '3. 把结果登记回状态文件（set-artifact / log），不要伪造门禁通过。',
    '4. 遇到需要人裁决的事，写清楚阻塞点，不要自行绕过门禁。',
    '',
    '最后必须打印一行：RESULT: <done|idle|blocked> <一句话>。',
  ].join('\n');
}
export const PROMPT_VERSION = 10;

function promptMetaFile(root) {
  return path.join(runDir(root), 'prompt.meta.json');
}
function readPromptMeta(root) {
  try { return JSON.parse(fs.readFileSync(promptMetaFile(root), 'utf8')); } catch { return null; }
}
function writePromptMeta(root, text, edited) {
  try {
    ensureDir(runDir(root));
    fs.writeFileSync(promptMetaFile(root), JSON.stringify({ version: PROMPT_VERSION, sha256: sha256(text), edited: !!edited, at: new Date().toISOString() }, null, 1), 'utf8');
  } catch {}
}

/**
 * 保证 prompt.md 与当前模板同步：
 *  - 没有文件：用默认模板生成；
 *  - 有 meta 且没被手改、版本落后：重新生成；
 *  - 被手改过：保留，只在开头提示可能过期。
 * 返回 { text, stale }。
 */
export function ensurePrompt(root, driver, config, settings, runId = '') {
  const file = path.join(runDir(root), config.promptFile || 'prompt.md');
  const meta = readPromptMeta(root);
  const current = readText(file);
  const fresh = () => {
    const text = defaultPrompt(root, driver, config, settings, runId);
    ensureDir(runDir(root));
    fs.writeFileSync(file, text, 'utf8');
    writePromptMeta(root, text, false);
    return text;
  };
  if (!current || !current.trim()) return { text: fresh(), stale: false };
  const edited = meta ? !!meta.edited : true;
  if (!meta) { writePromptMeta(root, current, true); return { text: current, stale: false }; }
  const changed = meta.sha256 && meta.sha256 !== sha256(current);
  // sha 对不上 = 文件被手改过：必须提示过期，不能默默沿用（旧逻辑只在版本号落后时才 stale）。
  if (changed || edited) return { text: current, stale: true };
  if (Number(meta.version || 0) < PROMPT_VERSION) return { text: fresh(), stale: false };
  return { text: current, stale: false };
}

/** 把提示词重置为默认模板（旧版本备份成 .bak-时间戳）。 */
export function resetPrompt(root, driver, config, settings) {
  const file = path.join(runDir(root), config.promptFile || 'prompt.md');
  const old = readText(file);
  if (old && old.trim()) {
    try { fs.writeFileSync(`${file}.bak-${stamp()}`, old, 'utf8'); } catch {}
  }
  const text = defaultPrompt(root, driver, config, settings, '');
  ensureDir(runDir(root));
  fs.writeFileSync(file, text, 'utf8');
  writePromptMeta(root, text, false);
  return text;
}

/** 模板占位符只在这里替换：prompt.md 落盘保留占位符，邮箱/根目录变了下一轮自动跟上。 */
export function fillPrompt(text, root, settings = {}, runId = '') {
  return String(text || '')
    .replaceAll('{{ROOT}}', root)
    .replaceAll('{{MAILBOX}}', settings.mailbox || '')
    .replaceAll('{{INTERVAL}}', String(settings.kimi?.intervalMinutes || 30))
    .replaceAll('{{RUN_ID}}', runId || stamp())
    .replaceAll('{{DATE}}', new Date().toISOString());
}

export function readPrompt(root, driver, config, settings, runId = '') {
  const file = path.join(runDir(root), config.promptFile || 'prompt.md');
  const wrap = (body) => withHumanNote(root, body);
  const text = readText(file);
  if (text && text.trim()) {
    return wrap(fillPrompt(text, root, settings, runId));
  }
  const fallback = defaultPrompt(root, driver, config, settings, runId);
  ensureDir(runDir(root));
  fs.writeFileSync(file, fallback, 'utf8');
  return wrap(fallback);
}

/** 每轮开头收件；失败不影响本轮（只记日志）。 */
async function collectMailbox(workspace, settings, runDirAbs, root = '') {
  if (!settings.mailbox || settings.kimi?.autoCollect === false) return null;
  const script = path.join(workspace, 'bin', 'aris-review.mjs');
  if (!fs.existsSync(script)) return null;
  const node = resolveNode(settings);
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = spawn(node, [script, '--collect-all', '--mailbox', settings.mailbox], {
      cwd: workspace,
      windowsHide: true,
      env: { ...process.env, ARIS_NO_COLOR: '1' },
    });
    let out = '';
    // 收件也是一次外部进程：挂死会把整轮堵在这里，给个硬超时。
    const killer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* 已经退出 */
      }
    }, 60_000);
    child.stdout.on('data', (c) => (out += c.toString('utf8')));
    child.stderr.on('data', (c) => (out += c.toString('utf8')));
    child.on('close', (code) => {
      clearTimeout(killer);
      if (code !== 0) {
        try {
          appendEvent(workspace, { text: `收件失败（exit ${code}）：${out.slice(-200).replace(/\s+/g, ' ').trim()}` });
        } catch {
          /* 账本写不了不影响主流程 */
        }
      }
      try {
        if (runDirAbs) {
          ensureDir(runDirAbs);
          fs.writeFileSync(path.join(runDirAbs, 'collect.log'), out.slice(-20000), 'utf8');
        }
      } catch {
        /* 日志写不了不算失败 */
      }
      resolve({ code, out: out.slice(-4000) });
    });
    child.on('error', () => {
      clearTimeout(killer);
      resolve(null);
    });
  }).then(async (result) => {
    // Frrs 布局另有邮箱桥：它把 Kimi 的四级审查回复转成 review_result_*.md + gate.json。
    const bridge = root ? path.join(root, 'pipeline', 'review', 'mailbox_bridge.py') : '';
    if (!bridge || !fs.existsSync(bridge)) return result;
    const py = await runBridgeCollect(workspace, settings, bridge, root);
    return { ...(result || {}), bridge: py };
  });
}

/** 跑一次邮箱桥收件；失败只记日志，不打断回合。 */
async function runBridgeCollect(workspace, settings, bridge, root) {
  const { spawn } = await import('node:child_process');
  const py = process.env.ARIS_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  return new Promise((resolve) => {
    const child = spawn(
      py,
      [bridge, '--state-dir', path.join(root, '.aris'), '--mailbox', settings.mailbox, 'collect'],
      {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', ARIS_STATE_DIR: path.join(root, '.aris'), NO_COLOR: '1' },
      },
    );
    let out = '';
    const killer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* 已退出 */
      }
    }, 90_000);
    child.stdout.on('data', (c) => (out += c.toString('utf8')));
    child.stderr.on('data', (c) => (out += c.toString('utf8')));
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code, out: out.slice(-4000) });
    });
    child.on('error', (error) => {
      clearTimeout(killer);
      resolve({ code: -1, out: String(error && error.message) });
    });
  });
}

/**
 * 跑一次。调用方负责判断是否该跑；这里只做一次性执行。
 * @returns {Promise<{ok:boolean, runId:string, exit:number|null, usage:object, cny:object|null, summary:string}>}
 */
export async function runOnce(options = {}) {
  const workspace = path.resolve(options.workspace || '');
  const root = path.resolve(options.root || '');
  const settings = options.settings || readSettings(workspace);
  const config = options.config || readConfig(root);
  const key = root.toLowerCase();
  // 宿主插件用它把「有一轮在跑」登记成后台 job，退出确认才拦得住直接关进程。
  const hooks = options.hooks && typeof options.hooks === 'object' ? options.hooks : null;

  if (RUNNING.has(key)) return { ok: false, exit: null, runId: '', usage: { ...ZERO_USAGE }, cny: null, summary: '同一条流水线已有运行中的回合' };

  const driverInfo = detectDriver(root);
  const driver = config.driver && config.driver !== 'auto' ? config.driver : driverInfo.driver;
  const runId = `${stamp()}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = ensureDir(path.join(runDir(root), 'runs', runId));
  const actFile = path.join(runDir(root), 'activity.json');
  let actAt = 0;
  let actText = '';
  let actPhase = '启动 dsh headless';
  const flushActivity = (final = false) => {
    writeJsonAtomic(actFile, {
      at: new Date().toISOString(),
      runId,
      step: steps,
      phase: actPhase,
      startedAt: new Date(startedAt).toISOString(),
      model: model || '',
      sessionId: sessionId || '',
      text: String(actText || '').replace(/\s+/g, ' ').slice(-400),
      final,
    });
  };

  writeJsonAtomic(lockFile(root), { pid: process.pid, runId, at: new Date().toISOString() });
  saveRuntime(root, {
    status: 'running',
    runId,
    pid: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastError: null,
    consecutiveErrors: 0,
  });
  if (hooks && typeof hooks.onStart === 'function') {
    try {
      hooks.onStart({ runId, root, workspace, driver });
    } catch {
      // 钩子失败只影响退出确认，不影响这一轮
    }
  }

  const startedAt = Date.now();
  // 上一轮遗留的停止标记（时间早于本轮开始）不再有效，清掉免得误判。
  const staleStop = readStopRequest(root);
  if (staleStop && Number(staleStop.at) < startedAt) clearStopRequest(root);
  const eventsPath = path.join(dir, 'events.ndjson');
  const events = fs.createWriteStream(eventsPath, { flags: 'a' });
  const errPath = path.join(dir, 'stderr.log');
  const errStream = fs.createWriteStream(errPath, { flags: 'a' });

  let usage = { ...ZERO_USAGE };
  let steps = 0;
  let lastText = '';
  let sawTurnEnd = false;

  const collect = await collectMailbox(workspace, settings, dir, root);
  if (collect) {
    events.write(`${JSON.stringify({ type: 'collect', code: collect.code })}\n`);
  }

  const runHead =
    `运行编号：${runId}（环境变量 ARIS_RUN_ID 同值；写本轮日志时文件名请用 runs/${runId}-dsh.md，不要自己拼时间戳）\n\n`;
  const resolved = ensurePrompt(root, driver, config, settings, runId);
  const staleNote = resolved.stale
    ? (String.fromCharCode(10) + String.fromCharCode(10) + '[提示] prompt.md 是手改过的旧版本，可能缺少送审步骤；可在面板点「重置提示词」。' + String.fromCharCode(10))
    : '';
  const prompt = runHead + fillPrompt(resolved.text, root, settings, runId) + staleNote;
  fs.writeFileSync(path.join(dir, 'prompt.md'), prompt, 'utf8');

  const model = config.model || settings.model || '';
  const patchFile = model ? writeModelPatch(path.join(runDir(root), 'patches'), model) : '';
  const dsh = resolveDsh(settings);
  const nodePath = resolveNode(settings);
  const env = buildEnv({
    settings,
    workspace,
    root,
    extra: {
      ARIS_RUN_ID: runId,
      // 邮箱桥（mailbox_bridge.py）需要 reviews/ 的落盘目录；缺省放在流水线根下 .aris
      ARIS_STATE_DIR: path.join(root, '.aris'),
      // 每日上限以面板配置为准：0 = 不设上限（gate.py 把 0 视为不限）
      FRRS_DAILY_CAP: String(Number(config?.limits?.dailyRuns) || 0),
    },
  });

  let summary = '';
  let exit = null;
  let errorText = '';
  let sessionId = '';

  try {
    const { child, done } = spawnHeadless({
      dsh,
      nodePath,
      prompt,
      cwd: root,
      env,
      patchFile,
      timeoutMs: Math.max(5, Number(config.maxMinutes || settings.maxMinutes || 45)) * 60_000,
      onEvent: (event, raw) => {
        events.write(`${raw}\n`);
        const u = usageFromEvent(event);
        if (u) {
          usage = addUsage(usage, u);
          steps += 1;
        }
        if (event.type === 'session' && typeof event.sessionId === 'string') sessionId = event.sessionId;
        if (event.type === 'text' && typeof event.text === 'string') lastText = event.text;
        if (event.type === 'final' && typeof event.text === 'string') summary = event.text;
        if (event.type === 'status' && event.phase === 'turn_end') sawTurnEnd = true;
        if (event.type === 'status' && event.phase === 'step_end' && event.usage) {
          actPhase = `第 ${steps} 步`;
          if (lastText) actText = lastText;
          if (Date.now() - actAt > 900) {
            actAt = Date.now();
            flushActivity();
          }
        }
        if (event.type === 'text' && typeof event.text === 'string') {
          actText = event.text;
          if (Date.now() - actAt > 900) {
            actAt = Date.now();
            flushActivity();
          }
        }
        options.onEvent?.(event);
      },
      onStderr: (chunk) => {
        errStream.write(chunk);
        errorText = (errorText + chunk).slice(-8000);
      },
    });
    saveRuntime(root, { pid: child.pid || null });
    RUNNING.set(key, { runId, child });
    const result = await done;
    exit = result.code;
    if (result.killed) errorText = `${errorText}\n运行超过 ${config.maxMinutes || settings.maxMinutes || 45} 分钟，已终止`;
    if (result.error) errorText = `${errorText}\n${result.error}`;
  } catch (error) {
    errorText = String(error);
  } finally {
    RUNNING.delete(key);
    events.end();
    errStream.end();
  }

  const finishedAt = new Date();
  // 模型忘记收尾（或中途被杀）时，租约会一直挂到 70 分钟；这里替它放掉。
  let lease = null;
  try {
    lease = releaseLeaseIfHeld(root, config, { startedAt, pending: pendingReviews(settings, root).length });
  } catch (error) {
    lease = { released: false, error: String(error?.message || error) };
  }
  const rate = rateFor(model || 'deepseek-flash', finishedAt, {
    prices: settings.prices || undefined,
    holidays: settings.holidays || [],
  });
  const cny = priceUsage(usage, rate);
  const reportText = summary || lastText;
  const resultLine = /RESULT:\s*(done|idle|blocked)\s*(.*)/i.exec(reportText || '');
  const verdict = resultLine ? resultLine[1].toLowerCase() : null;

  fs.writeFileSync(path.join(dir, 'final.txt'), reportText || '', 'utf8');
  const meta = {
    runId,
    lease,
    sessionId: sessionId || null,
    root,
    driver,
    model: model || rate?.model || '',
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: finishedAt.toISOString(),
    ms: Date.now() - startedAt,
    exit,
    steps,
    sawTurnEnd,
    verdict,
    usage,
    cny,
    summary: (reportText || '').slice(0, 4000),
    stderr: errorText.trim().slice(-4000) || null,
    error: exit === 0 ? null : errorText.trim().slice(-4000) || `退出码 ${exit}`,
    collect: collect ? { code: collect.code } : null,
  };
  writeJsonAtomic(path.join(dir, 'meta.json'), meta);
  appendLine(costsFile(root), JSON.stringify(meta));

  const prev = readRuntime(root);
  const totals = {
    runs: (prev.totals?.runs || 0) + 1,
    usage: addUsage(normalizeUsage(prev.totals?.usage), usage),
    cny: Math.round(((prev.totals?.cny || 0) + (cny ? cny.total : 0)) * 1e6) / 1e6,
  };
  const modeNow = options.mode || handoffMode(workspace);
  const pendingList = pendingReviews(settings, root);
  // 下一轮时间有三条支路：等 Kimi 取件 / 等 GPT 额度恢复 / 按节拍。面板按 nextAtBasis 显示在等谁。
  let nextAt = null;
  let nextAtBasis = null;
  if (config.enabled) {
    if (pendingList.length) {
      nextAt = nextRunAt(settings, modeNow, Date.now(), { pending: true, submittedAt: pendingSubmittedAt(pendingList) });
      nextAtBasis = 'mailbox';
    } else {
      const gate = await gptQuotaGate(workspace);
      if (gate && gate.blocked && gate.freeAt) {
        nextAt = new Date(Math.max(Date.parse(gate.freeAt) || 0, Date.now())).toISOString();
        nextAtBasis = 'quota';
      } else {
        nextAt = nextRunAt(settings, modeNow, Date.now(), { pending: false });
        nextAtBasis = gate && gate.blocked ? 'quota-stuck' : 'interval';
      }
    }
  }
  flushActivity(true);
  const ok = exit === 0 && !errorText.includes('已终止');
  // stderr 里的模型清单/加载日志不是错误，别写进「最近错误」。
  const BENIGN = /[\r\n]+/;
  const realError = errorText
    .split(BENIGN)
    .filter((line) => line.trim() && !/^\[llm-/.test(line.trim()) && !/^\[(dsh|aris)-/.test(line.trim()))
    .join(String.fromCharCode(10))
    .slice(-2000);
  const stopReq = readStopRequest(root);
  const userStopped = !!stopReq && Number(stopReq.at) >= startedAt;
  if (userStopped) clearStopRequest(root);

  // 收尾守门（A/B）：判断这一轮到底有没有送审，连续沉默会在面板上亮红标并记事件。
  // 只有 Frrs 布局有「送审」这一步；用户主动停用、进程异常退出都不计入「没送审」的账。
  const name = path.basename(root);
  const prevGap = prev.reviewGap || { count: 0, lastSubmitAt: null };
  const watch =
    driver === 'frrs' && !userStopped
      ? reviewWatch(root, startedAt, reportText, settings, exit)
      : { kind: 'none', note: '', skipCount: true };
  const reviewGap = watch.skipCount || watch.kind === 'none'
    ? prevGap
    : watch.kind === 'submitted'
      ? { count: 0, lastSubmitAt: finishedAt.toISOString(), lastKind: 'submitted', silentAt: null }
      : {
          count: Number(prevGap.count || 0) + 1,
          lastSubmitAt: prevGap.lastSubmitAt || null,
          lastKind: watch.kind,
          silentAt: finishedAt.toISOString(),
        };
  try {
    if (!watch.skipCount && watch.kind !== 'none') {
      if (watch.kind === 'submitted') {
        appendEvent(workspace, { name, text: `${name}：已送审` });
      } else if (watch.kind === 'skipped') {
        appendEvent(workspace, { name, text: `${name}：送审跳过 — ${watch.note || '未说明'}` });
      } else {
        appendEvent(workspace, { name, text: `${name}：本轮未送审且未说明（连续 ${reviewGap.count} 轮）` });
      }
    }
  } catch {
    // 事件账本写失败不影响回合结论
  }
  // 封顶转人工（PIPELINE.md「确定性裁决与封顶转人工」/ handoff「10/10 仍有 MUST」）：
  // bridge 在 review_guard exit 8 时写 .aris/review-cap.json，这里落成 state.json 的
  // blocked_on_user 并推一条事件，避免旧行为「只停跑、不转人工」。
  let capHit = null;
  if (driver === 'frrs' && !userStopped) {
    const cap = readCapMarker(root, startedAt);
    if (cap) {
      capHit = markBlockedOnCap(root, cap);
      if (capHit) {
        appendEvent(workspace, { name, text: `${name}：审查封顶 ${cap.scope} ${cap.used}/${cap.cap} → blocked_on_user，等待人工（清单 ${capHit.human}）` });
      } else {
        // 写不进状态不等于没封顶：至少留一条可见记录，免得下一轮又去撞同一面墙。
        appendEvent(workspace, { name, text: `${name}：审查封顶 ${cap.scope} ${cap.used}/${cap.cap}，但状态写入失败（state.json 读不到或坏了），请人工检查` });
      }
    }
  }
  saveRuntime(root, {
    status: userStopped ? 'stopped' : ok ? 'idle' : 'error',
    pid: null,
    stopping: false,
    stopRequestedAt: null,
    runId,
    sessionId: sessionId || prev.sessionId || null,
    reviewGap,
    finishedAt: finishedAt.toISOString(),
    lastError: userStopped || ok ? null : realError || `退出码 ${exit}`,
    lastRun: {
      runId,
      sessionId: sessionId || null,
      at: finishedAt.toISOString(),
      ms: meta.ms,
      exit,
      steps,
      verdict,
      usage,
      cny: cny ? cny.total : null,
      peak: cny ? cny.peak : null,
      model: meta.model,
      summary: meta.summary.slice(0, 240),
    },
    totals,
    nextAt: userStopped ? null : nextAt,
    nextAtBasis: userStopped ? null : nextAtBasis,
    consecutiveErrors: userStopped || ok ? 0 : (prev.consecutiveErrors || 0) + 1,
  });
  if (capHit) {
    saveRuntime(root, {
      gateReason: `审查封顶（${capHit.scope} ${capHit.used}/${capHit.cap}），等待人工`,
      nextAt: null,
      blockedUntil: null,
    });
  }

  return { ok, runId, exit, usage, cny, summary: meta.summary, verdict, dir };
}

/**
 * GPT 侧额度闸门：只在评审线路允许 GPT（auto 或 gpt）时才算。
 * 线路设成 kimi 时，GPT 额度用不上去，也不该拦下一轮。
 */
async function gptQuotaGate(workspace) {
  try {
    const mod = await import('./codex-review.mjs');
    let channel = 'auto';
    try {
      const dash = JSON.parse(fs.readFileSync(path.join(workspace, '.dsh', 'aris-dashboard.json'), 'utf8'));
      channel = String((dash && dash.external && dash.external.review && dash.external.review.channel) || 'auto');
    } catch { /* 没配置按 auto */ }
    if (channel === 'kimi') return null;
    return mod.quotaGate(workspace, mod.readCodexConfig(workspace));
  } catch {
    return null; // 读不到预算就别拦调度，宁可让它跑一轮再说
  }
}

/**
 * 额度类阻塞：流水线自己把 state.json 置成 blocked_on_user，原因是「GPT/Codex 本小时额度用尽」。
 * 这不是要人裁决的事——等到额度窗口滑出就该自己接着跑，所以调度与面板都按「等额度」处理。
 * 封顶转人工（review_physical_cap / cap-*）是另一回事，必须继续算人工。
 */
const QUOTA_BLOCK_RE = /额度|配额|quota|429|限流|rate.?limit/i;
export function isQuotaBlock(block) {
  if (!block || typeof block !== 'object') return false;
  const reason = String(block.reason || '');
  if (/review_physical_cap/i.test(reason) || /^cap-/.test(reason)) return false;
  const text = [reason, block.summary, block.title, block.id].filter(Boolean).join(' ');
  // 物理送审次数（attempts 15/15）是硬封顶，等一小时也不会恢复，仍算人工。
  if (/物理送审|attempts\s*\d+\s*\/\s*\d+/i.test(text)) return false;
  return QUOTA_BLOCK_RE.test(text);
}

/** 把「额度类 blocked_on_user」解回 running；解掉了返回 true。 */
export function resumeQuotaBlock(root) {
  const stateFile = path.join(root, 'pipeline', 'state.json');
  let st;
  try {
    st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return false;
  }
  if (String(st.status || '') !== 'blocked_on_user') return false;
  if (!isQuotaBlock(st.block)) return false;
  const prev = st.block;
  st.status = 'running';
  st.block = null;
  st.quota_block_resolved = { at: new Date().toISOString(), by: 'dsh-runner', previous: prev };
  try {
    fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** 用户主动停用的标记：本轮退出时据此把状态写成 stopped 而不是 error。 */
function stopRequestFile(root) {
  return path.join(root, '.aris-run', 'stop-request.json');
}
/**
 * 收尾守门：看这一轮到底有没有把包装出去。
 * 唯一硬证据是邮箱台账：send 成功 → projects.json 里出现本项目的 base 且 in/<base>.request.md 在。
 * 旧实现拿「review_package_*.md 的 mtime 变新」当已送审，包写了但 send 挂了也会判绿，已删除。
 * submitted = 在途请求非空；skipped = 模型写了「送审跳过：<缺什么>」；
 * silent = 本轮确实产出了新 review_package 却没进台账；none = 本轮不需要送审（如只做收口/状态推进），不记欠账。
 * 进程非正常退出（exit≠0）不记模型的账。
 */
export function reviewWatch(root, startedAt, report = '', settings = {}, exit = 0) {
  const text = String(report || '');
  const pend = pendingReviews(settings, root);
  if (pend.length > 0) return { kind: 'submitted', note: '', bases: pend.map((p) => p.base) };
  // 2026-11-18 修：面板把通道切到 GPT 后，送审根本不进 Kimi 邮箱，
  // pendingReviews 永远是空，这一轮就会被当成「该送没送」——连续两轮直接停跑。
  // 判「送没送」必须看所有通道的台账，而不是只看邮箱。
  const recent = recentSubmissions(root, startedAt);
  if (recent.length > 0) return { kind: 'submitted', note: '', bases: recent.slice(0, 5) };
  const skipped = /送审跳过[:：]\s*([^\n]{0,200})/.exec(text);
  if (skipped) return { kind: 'skipped', note: skipped[1].replace(/\s+/g, ' ').trim() };
  // 「已入队」只是模型单方面说法，没有台账就不认，但要能区分「没送」与「进程挂了」。
  if (exit !== 0) return { kind: 'none', note: '', skipCount: true };
  // 只有真产出了新包却没进邮箱，才算「该送未送」；只做收口/推进的回合不算欠账。
  const fresh = freshReviewPackages(root, startedAt);
  if (fresh.length === 0) return { kind: 'none', note: '' };
  return { kind: 'silent', note: fresh.map((f) => path.basename(f)).join(', ') };
}

/**
 * 本轮真正发生的送审证据（任意通道）：
 * ① 项目事件账本 `.aris/meta/events.jsonl` 里的 review / review_enqueued / review_collected（字段名是 event，ts 为 ISO 字符串）
 * ② `pipeline/review/mailbox_jobs/*.json`（python 桥落地的 job）
 * ③ `.aris-run/codex/*.task.md`（GPT 通道的任务包）
 * ④ `.aris/reviews/*.md`（两大通道最终都落成品审稿）
 * 只认 startedAt 之后的（留 2 秒余量），旧账不算。
 */
export function recentSubmissions(root, startedAt = 0) {
  const since = Number(startedAt) - 2000;
  const hit = [];
  try {
    const text = fs.readFileSync(path.join(root, '.aris', 'meta', 'events.jsonl'), 'utf8');
    for (const line of text.split(String.fromCharCode(10))) {
      if (!line.trim()) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const ev = String(d.event || '');
      if (ev !== 'review' && ev !== 'review_enqueued' && ev !== 'review_collected') continue;
      const at = Date.parse(d.ts || d.at || '') || 0;
      if (at >= since) hit.push(`${ev}#${d.round != null ? d.round : ''}${d.backend ? '/' + d.backend : ''}`);
    }
  } catch { /* 没有事件账本就不是 frrs 布局 */ }
  const scan = (dir, re) => {
    let ents = [];
    try { ents = fs.readdirSync(dir); } catch { return; }
    for (const name of ents) {
      if (!re.test(name)) continue;
      try { if (fs.statSync(path.join(dir, name)).mtimeMs >= since) hit.push(name); } catch { /* 刚被移走 */ }
    }
  };
  scan(path.join(root, 'pipeline', 'review', 'mailbox_jobs'), /^[^.]+\.json$/);
  scan(path.join(root, '.aris-run', 'codex'), /\.task\.md$/);
  scan(path.join(root, '.aris', 'reviews'), /\.md$/);
  return hit;
}

/** 本轮（startedAt 之后）新写出的 review_package_*.md；只扫 dataset_gen 根层，避免扫到 out/ 的旧产物。 */
export function freshReviewPackages(root, startedAt) {
  const since = Number(startedAt) - 2000;
  const dir = path.join(root, 'dataset_gen');
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of ents) {
    if (!e.isFile() || !/^review_package_.*\.md$/i.test(e.name)) continue;
    const full = path.join(dir, e.name);
    try {
      if (fs.statSync(full).mtimeMs >= since) out.push(full);
    } catch { /* 文件刚被移动/删除，忽略 */ }
  }
  return out;
}

export function capMarkerFile(root) {
  return path.join(root, '.aris', 'review-cap.json');
}

/** 读 bridge 在封顶时留下的标记；只认本回合开始之后写的，避免旧标记反复触发。 */
export function readCapMarker(root, startedAt) {
  const file = capMarkerFile(root);
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  if (st.mtimeMs < Number(startedAt) - 5000) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * 封顶 → blocked_on_user。规则出处：PIPELINE.md「确定性裁决与封顶转人工」、
 * automation_prompt_template 第 10 条、handoff/latest.md「10/10 仍有 MUST 立即 blocked」。
 * 旧 block 存进 block.previous；登记 scope／次数／resolve_hint，供人工解除。
 */
export function markBlockedOnCap(root, cap = {}) {
  const stateFile = path.join(root, 'pipeline', 'state.json');
  let state;
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; }
  const at = new Date().toISOString();
  const scope = String(cap.scope || '?');
  const used = Number(cap.used || 0);
  const capN = Number(cap.cap || 0);
  const id = `cap-${scope}-r${Number(cap.round || 0)}`;
  const prev = state.block && typeof state.block === 'object' ? state.block : null;
  state.status = 'blocked_on_user';
  state.block = {
    id,
    reason: 'review_physical_cap',
    scope,
    tier: cap.tier || 'review',
    used,
    cap: capN,
    at,
    by: 'dsh-runner',
    package: cap.package || null,
    summary: cap.human || null,
    resolve_hint: '审查额度已用尽：先按 summary 清单整理 MUST 证据，再由 Beck 裁决 放行／带遗留放行／继续修订；重开额度需明确批准。',
    previous: prev && prev.id !== id ? prev : null,
  };
  writeJsonAtomic(stateFile, state);
  try { fs.unlinkSync(capMarkerFile(root)); } catch {}
  return { scope, used, cap: capN, human: cap.human || null, block: state.block };
}

function readStopRequest(root) {
  try { return JSON.parse(fs.readFileSync(stopRequestFile(root), 'utf8')); } catch { return null; }
}
function writeStopRequest(root) {
  try {
    fs.mkdirSync(path.dirname(stopRequestFile(root)), { recursive: true });
    fs.writeFileSync(stopRequestFile(root), JSON.stringify({ at: Date.now() }), 'utf8');
  } catch {}
}
function clearStopRequest(root) {
  try { fs.unlinkSync(stopRequestFile(root)); } catch {}
}

/**
 * 停：默认优雅停——登记停止意图并关掉调度，本轮若在跑就让它跑完，
 * 收尾时读到 stop-request 会自然落成 stopped（不会留半截提交）。
 * force=true 才立刻杀掉进程树（切执行权、收尾清场用）。
 */
export function stopPipeline(root, { disable = true, force = false } = {}) {
  const key = path.resolve(root).toLowerCase();
  // 先落停止意图：即便本轮随后被强杀或异常退出，收尾也能据此判成 userStopped。
  writeStopRequest(root);
  const live = RUNNING.get(key);
  const active = Boolean(live) || isRunning(root);
  if (active && !force) {
    if (disable) saveConfig(root, { enabled: false });
    saveRuntime(root, {
      stopping: true,
      stopRequestedAt: new Date().toISOString(),
    });
    return { ...readRuntime(root), graceful: true };
  }
  if (live?.child?.pid) killTree(live.child.pid);
  const runtime = readRuntime(root);
  if (runtime.pid && pidAlive(runtime.pid)) killTree(runtime.pid);
  saveRuntime(root, {
    status: 'stopped',
    pid: null,
    stopping: false,
    stopRequestedAt: null,
    finishedAt: new Date().toISOString(),
    lastError: null,
    nextAt: null,
  });
  if (disable) saveConfig(root, { enabled: false });
  return { ...readRuntime(root), graceful: false };
}

/** 撤回停止意图（启用时调用）：本轮继续跑完，下一轮照常调度。 */
export function cancelStopIntent(root) {
  clearStopRequest(root);
  saveRuntime(root, { stopping: false, stopRequestedAt: null });
}

/**
 * 调度一拍：把到点的流水线各起一个回合，受 maxConcurrent 限制。
 * 宿主插件每 5 秒调一次；命令行 tick 也能被外部计划任务驱动。
 */
export async function tick(workspace, { force = false, hooks = null } = {}) {
  const settings = readSettings(workspace);
  const list = readRegistry(workspace);
  const cap = Math.max(1, Number(settings.maxConcurrent) || 2);
  let running = 0;
  for (const entry of list) {
    if (reconcile(entry.root).status === 'running') running += 1;
  }
  const started = [];
  const skipped = [];
  const mode = handoffMode(workspace);

  // 在途审稿先收件：回复回来之前起轮没有意义（模型只能空转）。
  const pendingAny = list.some((e) => pendingReviews(settings, e.root).length > 0);
  if (pendingAny && settings.mailbox) {
    await collectMailbox(workspace, settings, null, list.find((e) => pendingReviews(settings, e.root).length > 0)?.root || '');
  }

  for (const entry of list) {
    const config = readConfig(entry.root);
    const runtime = reconcile(entry.root);
    const pending = pendingReviews(settings, entry.root);
    if (pending.length) {
      const oldest = pending.reduce((m, x) => {
        const t = Date.parse(x.created_at || '') || 0;
        return t && (!m || t < m) ? t : m;
      }, 0);
      const limitMs = Math.max(30, 2 * kimiIntervalMinutes(settings)) * 60_000;
      const warned = Date.parse(runtime.pendingWarnAt || '') || 0;
      if (oldest && Date.now() - oldest > limitMs && Date.now() - warned > 30 * 60_000) {
        const mins = Math.round((Date.now() - oldest) / 60_000);
        const nm = path.basename(entry.root);
        try {
          appendEvent(workspace, { name: nm, text: `${nm}：Kimi 未取件 ${mins} 分钟（在途 ${pending.length} 条）` });
        } catch {
          // 账本失败不影响调度
        }
        saveRuntime(entry.root, { pendingWarnAt: new Date().toISOString() });
      }
    }
    if (!config.enabled && !force) continue;
    if (runtime.status === 'running') continue;

    // 额度类 blocked_on_user：不是人工阻塞。额度恢复就解掉继续跑，没恢复就排到恢复时刻。
    try {
      const stFile = path.join(entry.root, 'pipeline', 'state.json');
      let stNow = null;
      try { stNow = JSON.parse(fs.readFileSync(stFile, 'utf8')); } catch {}
      if (stNow && String(stNow.status || '') === 'blocked_on_user' && isQuotaBlock(stNow.block)) {
        const q0 = await gptQuotaGate(workspace);
        if (q0 && q0.blocked) {
          const at = q0.freeAt ? new Date(Math.max(Date.parse(q0.freeAt) || 0, Date.now())).toISOString() : new Date(Date.now() + 10 * 60_000).toISOString();
          if (runtime.nextAt !== at || runtime.nextAtBasis !== 'quota') {
            saveRuntime(entry.root, { nextAt: at, nextAtBasis: 'quota', waiting: pending.length, gateReason: q0.reason || '等额度恢复' });
          }
          skipped.push({ root: entry.root, reason: q0.reason || '等额度恢复' });
          continue;
        }
        if (resumeQuotaBlock(entry.root)) {
          appendEvent(workspace, { name: entry.name || path.basename(entry.root), text: `${entry.name || path.basename(entry.root)}：额度恢复，解除额度类阻塞并继续` });
        }
      }
    } catch {
      // 解阻塞失败不拦调度
    }

    // 小时额度用完：不启新一轮（避免空跑或到送审时被拒），排到恢复时刻；这不是人工阻塞。
    if (!pending.length) {
      try {
        const q1 = await gptQuotaGate(workspace);
        if (q1 && q1.blocked && q1.freeAt) {
          const at = new Date(Math.max(Date.parse(q1.freeAt) || 0, Date.now())).toISOString();
          if (runtime.nextAt !== at || runtime.nextAtBasis !== 'quota') {
            saveRuntime(entry.root, { nextAt: at, nextAtBasis: 'quota', waiting: 0, gateReason: q1.reason || '等额度恢复' });
          }
          skipped.push({ root: entry.root, reason: '等额度恢复：' + (q1.reason || q1.freeAt) });
          continue;
        }
      } catch {
        // 查额度失败不拦调度
      }
    }

    // 间隔只由“有没有在途审稿”决定：有就等送审后的 Kimi 取件+审稿，没有就立刻。
    const finishedMs = runtime.lastRun?.finishedAt ? Date.parse(runtime.lastRun.finishedAt) : 0;
    const dueAt = pending.length
      ? pendingWaitUntil(settings, pending)
      : mode === 'kimi' && finishedMs
        ? finishedMs + kimiIntervalMinutes(settings) * 60_000
        : 0;
    // 预检失败时会把 nextAt 推到 +5 分钟；到期判定要尊重它，否则节拍每 60 秒重算一遍。
    // nextAt 只用来承接「预检失败推迟 5 分钟」这类短期回压；历史遗留的远期值不能把调度锁死
    //（实测一次错误计算写下的 22:59 会让正确算出的 01:44 一直被 max() 丢掉）。
    const floorMs = Math.min(Date.parse(runtime.nextAt || '') || 0, Date.now() + 5 * 60_000);
    const effectiveDue = Math.max(dueAt || 0, floorMs);
    const due = force || !effectiveDue || effectiveDue <= Date.now();
    if (!due) {
      const iso = new Date(effectiveDue).toISOString();
      if (runtime.nextAt !== iso || runtime.waiting !== pending.length) {
        saveRuntime(entry.root, { nextAt: iso, waiting: pending.length });
      }
      continue;
    }

    if (running >= cap) {
      skipped.push({ root: entry.root, reason: `并发上限 ${cap}` });
      continue;
    }
    const gate = preflight(entry.root, config, settings, mode);
    // DSH 模式下若租约持有人早就该收尾了（超过单轮上限 + 10 分钟），判定为死锁并代为释放。
    if (mode === 'dsh' && /租约/.test(String(gate.reason || ''))) {
      const reclaimed = reclaimStaleLease(entry.root, config);
      if (reclaimed) {
        skipped.push({ root: entry.root, reason: `已代为释放超时租约（${reclaimed.owner}）` });
        saveRuntime(entry.root, { gateReason: null, lastError: null, nextAt: new Date(Date.now() + 5_000).toISOString() });
        continue;
      }
    }
    if (!gate.ok) {
      const wait = Number(gate.retryAfterMs) > 0 ? Number(gate.retryAfterMs) : 5 * 60_000;
      saveRuntime(entry.root, {
        status: 'idle',
        // 预检拦住多半是「等人工 / 等额度 / 在途审稿」，不是错误：
        // 写进 lastError 会让面板显示「出错」，与实际状态打架。
        lastError: null,
        blockedUntil: new Date(Date.now() + wait).toISOString(),
        nextAt: new Date(Date.now() + wait).toISOString(),
        waiting: pending.length,
        gateReason: gate.reason,
      });
      skipped.push({ root: entry.root, reason: gate.reason });
      continue;
    }
    running += 1;
    started.push(entry.root);
    saveRuntime(entry.root, { blockedUntil: null, gateReason: null, waiting: 0 });
    const fired = runOnce({ workspace, root: entry.root, config, settings, mode, hooks });
    fired
      .catch((error) => {
        saveRuntime(entry.root, { status: 'error', lastError: String(error), pid: null });
      })
      .finally(() => {
        if (hooks && typeof hooks.onEnd === 'function') {
          try {
            hooks.onEnd({ root: entry.root });
          } catch {
            // 收尾钩子失败不阻塞调度
          }
        }
      });
  }
  return { started, skipped, running };
}

/** 租约被占、且持有时间远超单轮上限 → 判为死锁，代跑一次 `--finish --no-progress` 释放。 */
export function reclaimStaleLease(root, config = {}) {
  const driver = config.driver && config.driver !== 'auto' ? config.driver : detectDriver(root).driver;
  if (driver !== 'frrs') return null;
  const statePath = path.join(root, config.frrs?.state || 'pipeline/state.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
  const chain = state.chain || {};
  const startedMs = Date.parse(chain.wake_start || '') || 0;
  if (!chain.wake_owner || !startedMs) return null;
  const limit = (Number(config.maxMinutes) || 45) + 10;
  const ageMinutes = Math.round((Date.now() - startedMs) / 60_000);
  if (ageMinutes < limit) return null;
  const half = config.frrs?.half || 'A';
  try {
    execFileSync(process.env.ARIS_PYTHON || 'python', ['pipeline/gate.py', 'pipeline/state.json', half, '--finish', '--no-progress'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    return { owner: chain.wake_owner, ageMinutes };
  } catch {
    return null;
  }
}

/** 关机/被杀后的恢复：running 但进程已不在 → 标记 interrupted，留下可读原因。 */export function recoverStale(workspace) {
  const list = readRegistry(workspace);
  const fixed = [];
  for (const entry of Array.isArray(list) ? list : list.projects || []) {
    if (!entry || !entry.root) continue;
    const runtime = readRuntime(entry.root);
    if (runtime.status !== 'running') continue;
    if (runtime.pid && isPidAlive(runtime.pid)) continue;
    saveRuntime(entry.root, {
      status: 'interrupted',
      pid: null,
      lastError: '上一轮进程已消失（关机、被杀或 DSH 退出），本轮无产出',
      finishedAt: new Date().toISOString(),
    });
    fixed.push(entry.root);
  }
  return fixed;
}

/** 汇总某条流水线的成本俯视图。 */
export function costView(root, limit = 200) {
  const file = costsFile(root);
  // 成本流水只增不减，必须整份读：readText 会截到 400 KB（保留最早的记录），
  // 结果是「累计轮数/累计花费」比实际少，今日成本却对得上，两个数还会互相矛盾。
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { text = ''; }
  const stampKey = `${file}|${text.length}|${text.slice(-40)}`;
  if (costCache.key === stampKey && costCache.value) return costCache.value;
  const runs = [];
  if (text) {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        // 早期版本把 token 字段名解析错了，落盘价全是 0；读到就按同一套价目表补算。
        if ((!row.cny || !row.cny.total) && row.usage && row.usage.total > 0) {
          const rate = rateFor(row.model || 'deepseek-flash', new Date(row.finishedAt || row.startedAt || Date.now()));
          const fixed = priceUsage(row.usage, rate);
          if (fixed) row.cny = fixed;
        }
        runs.push(row);
      } catch {
        /* 跳过坏行 */
      }
    }
  }
  const tail = runs.slice(-limit);
  const out = { total: summarizeRuns(runs), recent: summarizeRuns(tail.slice(-20)), last: tail[tail.length - 1] || null, count: runs.length, runs: tail.slice(-20).reverse() };
  costCache.key = stampKey;
  costCache.value = out;
  return out;
}
