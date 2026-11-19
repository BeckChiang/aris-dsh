// Panel backend: one snapshot for every pipeline, and a whitelist of actions.
// Everything here runs inside the DSH host process; the browser half only sends
// an action name plus a few scalars.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendEvent, readEvents } from './aris-events.mjs?v=46';
import { enforceFloor, getBalance, readBalanceCache } from './aris-balance.mjs?v=46';
import {
  RUN_DIR,
  configFile,
  costsFile,
  detectDriver,
  readConfig,
  readCosts,
  readRegistry,
  readRuntime,
  readSettings,
  saveRuntime,
  removeProject,
  runDir,
  saveConfig,
  saveSettings,
  upsertProject,
  writeJsonAtomic,
} from './aris-registry.mjs?v=46';
import { costView, effectiveInterval, isRunning, kimiIntervalMinutes, nextKimiTick, nextRunAt, pendingReviews, pendingSubmittedAt, preflight, recoverStale, resetPrompt, runOnce, cancelStopIntent, stopPipeline, tick, todayStats, RUNNER_REV } from './aris-runner.mjs?v=48';
import { resolveDsh } from './aris-dsh.mjs?v=46';
import { CODEX_TASKS, codexState, listModels, normalizeWorkspace, previewPrompt, readCodexConfig, runCodexReview, saveCodexConfig, quotaGate } from './codex-review.mjs?v=7';
import { readProjectSlots, readReviewRoute, routeBlocks, saveReviewRoute } from './review-route.mjs?v=3';
import { collectReviewResults } from './review-results.mjs?v=4';
import { readSessionTranscript } from './codex-session.mjs';

const BIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HANDOFF_FILE = path.join('.dsh', 'aris-handoff.json');

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readTextSafe(file, limit = 200_000) {
  try {
    return fs.readFileSync(file, 'utf8').slice(0, limit);
  } catch {
    return '';
  }
}

function existsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** 流水线自身的进度：FRRS 读 pipeline/state.json，ARIS 读 .aris/state.json。 */
export function pipelineStage(root, driver) {
  if (driver === 'frrs') {
    const state = readJsonSafe(path.join(root, 'pipeline', 'state.json'), null);
    if (!state) return { stage: '?', round: null, status: 'unknown', block: null, chain: null };
    return {
      stage: state.state || '?',
      round: null,
      status: state.status || '?',
      block: state.block ? state.block.id || String(state.block) : null,
      chain: state.chain
        ? { owner: state.chain.wake_owner || null, start: state.chain.wake_start || null, today: state.chain.today ?? null }
        : null,
      narrative: state.narrative_adjustment || null,
    };
  }
  const state = readJsonSafe(path.join(root, '.aris', 'state.json'), null);
  if (!state) return { stage: '?', round: null, status: 'unknown', block: null, chain: null };
  return { stage: state.phase || '?', round: state.round ?? null, status: 'active', block: null, chain: null, gates: state.gates || null };
}

export function mailboxState(mailbox) {
  if (!mailbox) return { path: '', exists: false, pending: 0, items: [], checkedAt: new Date().toISOString() };
  const dir = path.resolve(mailbox);
  const queue = readTextSafe(path.join(dir, 'queue.md'), 100_000);
  if (!queue) return { path: dir, exists: existsDir(dir), pending: 0, items: [], checkedAt: new Date().toISOString() };
  const pendingHit = /PENDING:\s*(\d+)/.exec(queue);
  const items = [];
  let inPending = false;
  for (const line of queue.split(/\r?\n/)) {
    if (/^##\s*待处理/.test(line)) {
      inPending = true;
      continue;
    }
    if (/^##\s/.test(line)) {
      inPending = false;
      continue;
    }
    if (!inPending) continue;
    const m = /^[-*]\s+(.+?)\s*$/.exec(line);
    if (m) items.push({ text: m[1], request: (/[\w.-]+\.request\.md/.exec(m[1]) || [])[0] || '' });
  }
  return {
    path: dir,
    exists: existsDir(dir),
    pending: pendingHit ? Number(pendingHit[1]) : items.length,
    items,
    checkedAt: new Date().toISOString(),
  };
}

/** Windows 计划任务：只读查询，失败时返回 available:false 而不是抛错。
 *  powershell 一次要 2 秒以上，所以缓存 60 秒；过期后改成后台异步刷新（stale-while-revalidate），
 *  绝不在快照里同步等它，否则每 60 秒整个宿主会被卡住两秒多。 */
const TASK_TTL_MS = 60_000;
const taskCache = new Map();
const taskInflight = new Set();

export function scheduledTask(name, opts = {}) {
  const key = String(name || '');
  const hit = taskCache.get(key);
  if (hit) {
    if (opts.force || Date.now() - hit.at >= TASK_TTL_MS) refreshTaskAsync(key);
    return hit.value;
  }
  // 冷启动：默认不在请求路径上同步等 powershell（2 秒以上会卡住整个宿主），
  // 先返回「查询中」并在后台刷新；CLI 等需要立即拿到结果的场景传 sync:true。
  if (opts.sync || process.env.ARIS_TASK_SYNC === '1') {
    const value = probeScheduledTask(key);
    taskCache.set(key, { at: Date.now(), value });
    return value;
  }
  refreshTaskAsync(key);
  return { available: true, name: key, present: null, loading: true };
}

function taskScript(safeName) {
  return (
    `$ErrorActionPreference='SilentlyContinue'; ` +
    `$t = Get-ScheduledTask -TaskName '${safeName}'; ` +
    "if (-not $t) { Write-Output 'ABSENT' } else { $i = Get-ScheduledTaskInfo -TaskName '" + safeName + "'; " +
    "[pscustomobject]@{ State = \"$($t.State)\"; Interval = \"$($t.Triggers[0].Repetition.Interval)\"; " +
    "Last = \"$($i.LastRunTime)\"; Next = \"$($i.NextRunTime)\"; LastResult = $i.LastTaskResult } | ConvertTo-Json -Compress }; " +
    'exit 0'
  );
}

function taskValueFromText(name, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed === 'ABSENT') return { available: true, name, present: false };
  try {
    const info = JSON.parse(trimmed.split('\n').pop());
    if (!info) return { available: true, name, present: false };
    return {
      available: true,
      name,
      present: true,
      state: info.State,
      interval: info.Interval,
      lastRun: info.Last,
      nextRun: info.Next,
      lastResult: info.LastResult,
    };
  } catch {
    return { available: false, name, reason: trimmed.slice(0, 400) };
  }
}

function taskValueFromError(name, error) {
  const text = String((error && error.message) || error);
  if (/not found|No MSFT_ScheduledTask|不存在/i.test(text)) return { available: true, name, present: false };
  return { available: false, name, reason: text.slice(0, 400) };
}

function refreshTaskAsync(name) {
  if (process.platform !== 'win32' || taskInflight.has(name)) return;
  taskInflight.add(name);
  const safeName = name.replace(/'/g, "''");
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', taskScript(safeName)],
    { encoding: 'utf8', timeout: 15_000, windowsHide: true },
    (error, stdout) => {
      taskInflight.delete(name);
      if (error && !stdout) {
        taskCache.set(name, { at: Date.now(), value: taskValueFromError(name, error) });
        return;
      }
      taskCache.set(name, { at: Date.now(), value: taskValueFromText(name, stdout) });
    },
  );
}

function probeScheduledTask(name) {
  if (process.platform !== 'win32') return { available: false, name, reason: '仅 Windows' };
  const safeName = String(name || '').replace(/'/g, "''");
  try {
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', taskScript(safeName)], {
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    });
    return taskValueFromText(name, raw);
  } catch (error) {
    return taskValueFromError(name, error);
  }
}

export function readHandoff(workspace) {
  const file = path.join(workspace, HANDOFF_FILE);
  const data = readJsonSafe(file, null) || {};
  return { file, mode: data.mode === 'kimi' ? 'kimi' : 'dsh', at: data.at || null, note: data.note || '' };
}

function writeHandoff(workspace, patch) {
  const file = path.join(workspace, HANDOFF_FILE);
  const current = readHandoff(workspace);
  const next = { mode: current.mode, at: new Date().toISOString(), note: current.note || '', ...(patch || {}) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, next);
  return readHandoff(workspace);
}

/** frrs 的总计划：state.states[*].todo 是字符串数组，已完成项以 ✅ 开头。 */

/** 最近一次审查的结论。优先看 `.aris/reviews/` 的最新结构化记录（GPT 与 Kimi 都落这里），
 *  没有再退回旧的 `*.gate.json`（那是 python 邮箱桥才写的，GPT 通道不产生）。 */
const reviewCache = new Map();

function countMustItems(mdFile) {
  let text = '';
  try {
    text = fs.readFileSync(mdFile, 'utf8');
  } catch {
    return null;
  }
  const head = /^##+\s*(MUST|主要问题)(?=\s|$)/im.exec(text);
  if (!head) return null;
  const tail = text.slice(head.index + head[0].length);
  const next = /^##+\s/im.exec(tail);
  const body = next ? tail.slice(0, next.index) : tail;
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-*+]|\d+[.)])\s+\S/.test(l)).length;
}

function lastReview(root) {
  const hit = reviewCache.get(root);
  if (hit && Date.now() - hit.at < 10_000) return hit.value;

  let value = null;
  const dir = path.join(root, '.aris', 'reviews');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  let best = null;
  for (const n of names) {
    const rec = readJsonSafe(path.join(dir, n), null);
    if (!rec || !rec.verdict) continue;
    const at = Date.parse(rec.created_at || '') || 0;
    if (!at) continue;
    if (!best || at > best.at) best = { at, rec, n };
  }
  if (best) {
    const mdRel = path.join('.aris', 'reviews', best.n.replace(/\.json$/, '.md')).replace(/\\/g, '/');
    const must = countMustItems(path.join(root, mdRel));
    value = {
      file: mdRel,
      verdict: String(best.rec.verdict || '').toUpperCase(),
      decision: best.rec.decision || null,
      acceptance: best.rec.acceptance_status || best.rec.acceptance || null,
      score: Number.isFinite(Number(best.rec.score)) ? Number(best.rec.score) : null,
      must,
      should: null,
      scope: String(best.rec.scope || (String(best.rec.target || '').match(/review_package_(.+?)_r\d+\.md$/) || [])[1] || ''),
      channel: /codex/i.test(String(best.rec.backend || '')) ? 'gpt' : /mailbox|kimi/i.test(String(best.rec.backend || '')) ? 'kimi' : '',
      at: new Date(best.at).toISOString(),
      source: 'reviews',
    };
  }

  if (!value) {
    let bestGate = null;
    const walk = (d, depth) => {
      if (depth > 2) return;
      let items = [];
      try {
        items = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of items) {
        const full = path.join(d, it.name);
        if (it.isDirectory()) {
          if (it.name === 'node_modules' || it.name === '.git' || it.name === '__pycache__') continue;
          walk(full, depth + 1);
        } else if (it.name.endsWith('.gate.json')) {
          try {
            const st = fs.statSync(full);
            if (!bestGate || st.mtimeMs > bestGate.mtimeMs) bestGate = { file: full, mtimeMs: st.mtimeMs };
          } catch {}
        }
      }
    };
    walk(root, 0);
    if (bestGate) {
      const g = readJsonSafe(bestGate.file, null);
      if (g) {
        value = {
          file: path.relative(root, bestGate.file),
          verdict: g.verdict || null,
          decision: g.decision || null,
          acceptance: g.acceptance_status || null,
          score: null,
          must: g.must_count ?? null,
          should: g.should_count ?? null,
          scope: '',
          channel: '',
          at: new Date(bestGate.mtimeMs).toISOString(),
          source: 'gate',
        };
      }
    }
  }
  reviewCache.set(root, { at: Date.now(), value });
  return value;
}

function frrsPlan(root) {
  const state = readJsonSafe(path.join(root, 'pipeline', 'state.json'), null);
  if (!state || !state.states) return null;
  const stages = [];
  let total = 0;
  let done = 0;
  for (const [name, s] of Object.entries(state.states)) {
    const todo = Array.isArray(s.todo) ? s.todo : [];
    const status = String(s.status || '');
    const marked = todo.filter((t) => typeof t === 'string' && t.trim().startsWith('✅')).length;
    // 阶段已 done 时，它名下的条目即使没打勾也应视为完成（模型通常不回头补勾）。
    const d = status === 'done' ? todo.length : Math.min(marked, todo.length);
    total += todo.length;
    done += d;
    stages.push({ name, status, done: d, total: todo.length, items: todo.map((t) => ({ text: String(t), done: status === 'done' || String(t).trim().startsWith('✅') })) });
  }
  const current = state.state || '';
  const cur = stages.find((s) => s.name === current) || null;
  const items = cur ? cur.items : [];
  const block = state.block ? { id: state.block.id || '', reason: state.block.reason || '', hint: state.block.resolve_hint || '' } : null;
  return {
    items,
    block,
    percent: total ? Math.round((done / total) * 100) : 0,
    done,
    total,
    current,
    currentStatus: cur ? cur.status : '',
    stages,
  };
}

function arisPlan(root) {
  const state = readJsonSafe(path.join(root, '.aris', 'state.json'), null);
  if (!state) return null;
  const phase = state.phase || '';
  const order = ['literature', 'idea', 'experiment', 'writing', 'review', 'done'];
  const idx = Math.max(0, order.indexOf(phase));
  return {
    percent: Math.round(((idx + (phase === 'done' ? 1 : 0)) / order.length) * 100),
    done: idx,
    total: order.length,
    current: phase,
    currentStatus: state.status || '',
    stages: order.map((name, i) => ({ name, status: i < idx ? 'done' : i === idx ? 'in_progress' : 'pending', done: 0, total: 0 })),
  };
}

function readActivityInner(root) {
  const direct = readJsonSafe(path.join(root, RUN_DIR, 'activity.json'), null);
  const fresh = direct && Date.now() - Date.parse(direct.at || 0) < 180_000;
  const runsDir = path.join(root, RUN_DIR, 'runs');
  let newest = '';
  try {
    for (const name of fs.readdirSync(runsDir)) if (name > newest) newest = name;
  } catch {
    return fresh ? direct : null;
  }
  if (!newest) return fresh ? direct : null;
  let step = 0;
  let last = '';
  try {
    const file = path.join(runsDir, newest, 'events.ndjson');
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - 24576);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    for (const line of buf.toString('utf8').split('\n')) {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === 'status' && ev.phase === 'step_end' && ev.step) step = ev.step;
      if (ev.type === 'text' && typeof ev.text === 'string' && ev.text.trim()) last = ev.text;
      if (!last && ev.type === 'thinking' && typeof ev.text === 'string' && ev.text.trim()) last = ev.text;
    }
  } catch {
    /* 读不到 events 就只用 activity.json */
  }
  let dirBorn = '';
  try {
    dirBorn = fs.statSync(path.join(runsDir, newest)).birthtime.toISOString();
  } catch {
    dirBorn = '';
  }
  const fallback = {
    at: new Date().toISOString(),
    runId: newest,
    startedAt: dirBorn,
    step,
    phase: step ? `第 ${step} 步` : '',
    text: String(last || '').replace(/\s+/g, ' ').slice(-400),
    live: true,
  };
  if (!fresh) return step || last ? fallback : direct || null;
  return {
    ...fallback,
    ...direct,
    step: direct.step || fallback.step,
    phase: direct.phase || fallback.phase,
    text: direct.text || fallback.text,
  };
}

function readActivity(root, running = false) {
  if (!running) return null; // 没在跑时不显示“正在做什么”，避免把上一轮的死数据当成当前进度
  const act = readActivityInner(root);
  if (!act) return null;
  return { ...act, live: true, ended: false };
}
/** 该流水线跑过的所有 headless 会话 id（供把会话挂进 DSH 工作区用）。 */
export function sessionIds(root, limit = 400) {
  const dir = path.join(root, RUN_DIR, 'runs');
  const out = [];
  try {
    for (const name of fs.readdirSync(dir).sort()) {
      const meta = readJsonSafe(path.join(dir, name, 'meta.json'), null);
      let id = meta && meta.sessionId;
      if (!id) {
        // 早期版本没把 sessionId 写进 meta.json，但 events.ndjson 头部一定有一条
        // {"type":"session","sessionId":"session-..."}。
        const head = readTextSafe(path.join(dir, name, 'events.ndjson'), 2048);
        const m = /"sessionId"\s*:\s*"(session-[^"]+)"/.exec(head);
        id = m ? m[1] : null;
      }
      if (id && !out.includes(id)) out.push(id);
    }
  } catch {
    /* 没有 runs 目录就是还没跑过 */
  }
  return out.slice(-limit);
}

/**
 * 正在跑的那一轮的会话 id。
 *
 * `sessionIds()` 只认 runs/<runId>/meta.json，而 meta.json 是收尾时才写的，
 * 所以一轮跑到一半时工作区里看不到它。runtime.json 的 sessionId 在会话第一帧
 * 落地后（通常是启动后 1–2 秒）就有了，这里单独暴露给 attachSessions 用。
 * 只在 status === 'running' 时返回，收尾后交给 sessionIds() 正常路径接管。
 */
export function liveSessionId(root) {
  const rt = readRuntime(root);
  if (!rt || rt.status !== 'running') return null;
  const done = (rt.lastRun && rt.lastRun.sessionId) || null;
  const cur = typeof rt.sessionId === 'string' && rt.sessionId ? rt.sessionId : null;
  // 注意：saveRuntime 只在**收尾时**写 sessionId，所以运行中 rt.sessionId 仍是上一轮的 id。
  // 本轮真正的会话 id 一定先出现在 runs/<runId>/events.ndjson 头部（{"type":"session",...}）。
  let fromEvents = null;
  try {
    const head = readTextSafe(path.join(root, RUN_DIR, 'runs', String(rt.runId || ''), 'events.ndjson'), 16384);
    const m = /"sessionId"\s*:\s*"(session-[^"]+)"/.exec(head);
    fromEvents = m ? m[1] : null;
  } catch {
    /* 还没写出来就下一拍再试 */
  }
  if (fromEvents && fromEvents !== done) return fromEvents;
  if (cur && cur !== done) return cur;
  return fromEvents || null;
}

/** 设置或执行权变化后立即重算各流水线的 nextAt，避免旧间隔残留。 */
export function recalcNextAt(workspace, settings, mode) {
  const registry = readRegistry(workspace);
  for (const entry of Array.isArray(registry) ? registry : registry.projects || []) {
    if (!entry || !entry.root) continue;
    const config = readConfig(entry.root);
    const runtime = readRuntime(entry.root);
    const interval = effectiveInterval(config, settings, mode);
    const finishedMs = runtime.lastRun && runtime.lastRun.finishedAt ? Date.parse(runtime.lastRun.finishedAt) : 0;
    const pending = pendingReviews(settings, entry.root);
    // GPT 额度用完时，下一轮要等额度恢复；线路设成 kimi 则不看 GPT 额度。
    let gate = null;
    try {
      if (readReviewRoute(workspace).channel !== 'kimi') gate = quotaGate(workspace, readCodexConfig(workspace));
    } catch {
      gate = null;
    }
    const blockedUntil = gate && gate.blocked && gate.freeAt ? Date.parse(gate.freeAt) || 0 : 0;
    const nextAt = config.enabled
      ? nextRunAt(settings, mode, Date.now(), {
          pending: pending.length > 0,
          submittedAt: pendingSubmittedAt(pending),
          blockedUntil,
        })
      : null;
    const byInterval = finishedMs && !pending.length ? new Date(Math.max(finishedMs + interval * 60_000, blockedUntil || 0)).toISOString() : nextAt;
    const basis = !config.enabled ? null : pending.length ? 'mailbox' : gate && gate.blocked ? 'quota' : 'interval';
    saveRuntime(entry.root, {
      nextAt: config.enabled ? (pending.length || Date.parse(byInterval) > Date.now() ? byInterval : nextAt) : null,
      nextAtBasis: basis,
      blockedUntil: null,
    });
  }
}

export function describePipeline(workspace, entry, settings) {
  const root = entry.root;
  const config = readConfig(root);
  const runtime = readRuntime(root);
  const detectedDriver = detectDriver(root).driver || '';
  const pick = (value) => (value && value !== 'auto' && value !== 'unknown' ? value : '');
  const driver = pick(entry.driver) || pick(config.driver) || pick(detectedDriver) || 'aris';
  const costs = costView(root);
  const stage = pipelineStage(root, driver);
  const handoff = readHandoff(workspace);
  const mode = handoff && handoff.mode === 'kimi' ? 'kimi' : 'dsh';
  const running = isRunning(root) || runtime.status === 'running';
  // 本轮正在跑时，租约就是我们自己持有的，别再拿预检结果当“拦截原因”展示。
  let blocked = '';
  if (!running) {
    try {
      const pre = preflight(root, config, settings, readHandoff(workspace).mode === 'kimi' ? 'kimi' : 'dsh');
      blocked = pre && pre.ok === false ? String(pre.reason || pre.message || '预检未通过') : '';
    } catch (error) {
      blocked = String(error && error.message ? error.message : error);
    }
  }
  const lastRun = costs.last || null;
  const plan = driver === 'frrs' ? frrsPlan(root) : arisPlan(root);
  const pending = pendingReviews(settings, root);
  const today = todayStats(root);
  return {
    root,
    name: entry.name || config.name || path.basename(root),
    driver,
    enabled: config.enabled !== false,
    model: config.model || settings.model,
    mode,
    intervalMinutes: effectiveInterval(config, settings, mode),
    intervalSource: config.intervalSource || 'auto',
    kimiIntervalMinutes: kimiIntervalMinutes(settings),
    maxMinutes: Number(config.maxMinutes || settings.maxMinutes || 45),
    status: config.enabled === false ? 'stopped' : running ? 'running' : runtime.status || 'idle',
    pid: runtime.pid || null,
    running,
    stopping: running && Boolean(runtime.stopping),
    stopRequestedAt: runtime.stopRequestedAt || null,
    blocked,
    stage,
    plan,
    activity: (() => {
      const act = readActivity(root, running);
      if (!act) return null;
      const started = Date.parse(act.startedAt || '') || Date.parse(runtime.lastRun?.startedAt || '') || 0;
      const at = Date.parse(act.at || '') || 0;
      return {
        ...act,
        model: runtime.lastRun?.model || config.model || settings.model || '',
        runId: act.runId || runtime.lastRun?.runId || '',
        sessionId: runtime.sessionId || runtime.lastRun?.sessionId || '',
        elapsedMs: started && at ? Math.max(0, at - started) : 0,
        totalMs: runtime.lastRun?.ms || 0,
        steps: runtime.lastRun?.steps || act.step || 0,
      };
    })(),
    waiting: runtime.waiting || 0,
    pending: pending.length,
    pendingBases: pending.map((x) => x.base),
    reviewGap: runtime.reviewGap || { count: 0, lastSubmitAt: null, lastKind: null },
    staleReview: (() => {
      const oldest = pending.reduce((m, x) => {
        const t = Date.parse(x.created_at || '') || 0;
        return t && (!m || t < m) ? t : m;
      }, 0);
      if (!oldest) return null;
      const ageMin = Math.round((Date.now() - oldest) / 60_000);
      const limit = Math.max(30, 2 * kimiIntervalMinutes(settings));
      return { ageMin, limit, over: ageMin > limit, since: new Date(oldest).toISOString() };
    })(),
    today,
    lastReview: lastReview(root),
    limits: { dailyRuns: Number(config.limits?.dailyRuns) || 0, dailyCny: Number(config.limits?.dailyCny) || 0 },
    lastRun,
    // 运行中优先给本轮会话（runtime.sessionId 收尾才更新，会是上一轮的 id）。
    lastSessionId: liveSessionId(root) || runtime.sessionId || (lastRun && lastRun.sessionId) || null,
    totals: { runs: costs.count, cny: (costs.total && costs.total.cny) || 0, usage: (costs.total && costs.total.usage) || null },
    // 下一轮：runtime 里没有就现算，避免「刚启用 / 刚改设置」时卡片显示空。
    ...(() => {
      if (config.enabled === false) return { nextAt: null, nextAtBasis: null };
      if (runtime.nextAt) return { nextAt: runtime.nextAt, nextAtBasis: runtime.nextAtBasis || 'interval' };
      if (pending.length) {
        return {
          nextAt: nextRunAt(settings, mode, Date.now(), { pending: true, submittedAt: pendingSubmittedAt(pending) }),
          nextAtBasis: 'mailbox',
        };
      }
      let gate = null;
      try {
        if (readReviewRoute(workspace).channel !== 'kimi') gate = quotaGate(workspace, readCodexConfig(workspace));
      } catch {
        gate = null;
      }
      const blockedUntil = gate && gate.blocked && gate.freeAt ? Date.parse(gate.freeAt) || 0 : 0;
      const at = nextRunAt(settings, mode, Date.now(), { blockedUntil });
      return { nextAt: at, nextAtBasis: gate && gate.blocked ? (gate.freeAt ? 'quota' : 'quota-stuck') : 'interval' };
    })(),
    consecutiveErrors: runtime.consecutiveErrors || 0,
    lastError: runtime.lastError || null,
    costFile: costsFile(root),
    gates: (() => { const list = Array.isArray(plan && plan.gates) ? plan.gates : []; return { done: list.filter((g) => g && g.status === 'done').length, total: list.length, list }; })(),
    blockers: (() => {
      const out = [];
      const blk = plan && plan.block;
      if (blk && (blk.reason || blk.id)) out.push({ severity: 'error', kind: 'state-block', text: String(blk.reason || blk.id), evidence: 'pipeline/state.json 的 block', human: true, action: { kind: 'open-log', label: '看日志' } });
      if (String(stage && stage.status) === 'blocked_on_user') out.push({ severity: 'warn', kind: 'blocked-on-user', text: '等待人工裁决', evidence: 'state.json 标记 blocked_on_user', human: true, action: { kind: 'open-log', label: '看日志' } });
      if (blocked) out.push({ severity: 'warn', kind: 'preflight', text: blocked, evidence: '运行前预检未通过', human: false });
      if (running && Boolean(runtime.stopping)) out.push({ severity: 'info', kind: 'stopping', text: '已登记停止，本轮结束后停下', evidence: 'runtime.stopRequestedAt', human: false });
      if (pending.length) out.push({ severity: 'info', kind: 'review-pending', text: pending.length + ' 轮还没送审', evidence: pending.map((x) => x.base).slice(0, 3).join('、'), human: false });
      if (runtime.lastError) out.push({ severity: 'warn', kind: 'error', text: String(runtime.lastError).slice(0, 160), evidence: 'runtime.lastError', human: false });
      return out;
    })(),
    history: (() => { const rows = Array.isArray(costs.runs) ? costs.runs : []; return rows.slice(0, 30).map((r) => ({ runId: r.runId || '', at: r.finishedAt || r.startedAt || '', steps: Number(r.steps) || 0, ms: Number(r.ms) || 0, cny: Number((r.cny && r.cny.total) || 0), tokens: Number((r.usage && r.usage.total) || 0), verdict: r.verdict || '', exit: r.exit == null ? null : r.exit })); })(),
    budget: (() => { const u = (lastRun && lastRun.usage) || null; return { tokens: Number((u && u.total) || 0), ctxPct: Number(runtime.ctxPct ?? (runtime.lastRun && runtime.lastRun.ctxPct)) || null, steps: Number((lastRun && lastRun.steps) || 0), callsMax: Number(config.maxSteps) || 0 }; })(),
    tokensTotal: (() => { const rows = Array.isArray(costs.runs) ? costs.runs : []; return rows.reduce((n, r) => n + Number((r.usage && r.usage.total) || 0), 0); })(),
  };
}

// ---------------------------------------------------------------------------
// GPT 外审（via=codex）：面板状态 + 手动派单
// ---------------------------------------------------------------------------

let codexManual = { running: false, at: null, root: '', task: '', target: '', result: null, remaining: null, file: '' };

function codexSnapshot(workspace) {
  let base;
  try {
    base = codexState(workspace);
  } catch (e) {
    base = { error: String((e && e.message) || e) };
  }
  const taskDefs = CODEX_TASKS.map((t) => ({ key: t.key, label: t.label, hint: t.hint }));
  let promptPreview = null;
  try {
    promptPreview = previewPrompt(readCodexConfig(workspace));
  } catch {
    promptPreview = null;
  }
  // 项目侧实际生效的是 reviewer.json 的 active —— 面板要能看到它是同步的。
  let projectRoutes = [];
  try {
    const reg = readRegistry(workspace);
    projectRoutes = (Array.isArray(reg) ? reg : reg.projects || [])
      .filter((e) => e && e.root)
      .map((e) => {
        let slots = { active: null, exists: false, file: '' };
        let err = null;
        try {
          slots = readProjectSlots(e.root);
        } catch (e2) {
          err = String((e2 && e2.message) || e2);
        }
        return {
          root: e.root,
          name: e.name || path.basename(e.root),
          active: slots.active,
          exists: slots.exists,
          file: slots.file,
          ...(err ? { error: err } : {}),
        };
      });
  } catch {
    projectRoutes = [];
  }
  return {
    ...base,
    route: { ...readReviewRoute(workspace), projects: projectRoutes },
    taskDefs,
    stageDefs: taskDefs, // 旧名兼容
    promptPreview,
    manual: codexManual,
    lastManual: readJsonSafe(path.join(workspace, '.dsh', 'codex-manual-last.json'), null),
  };
}

const SEND_FILE_MAX = 8; // 一次最多送几个文件
const SEND_FILE_CHARS = 60000; // 单文件字符上限（约 15k tokens）

function expandRel(root, rel) {
  if (!rel.includes('*')) return [rel];
  const dir = path.posix.dirname(rel);
  const pattern = path.posix.basename(rel);
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  let names = [];
  try {
    names = fs.readdirSync(path.join(root, dir));
  } catch {
    return [];
  }
  return names.filter((n) => re.test(n)).sort().map((n) => path.posix.join(dir, n));
}

/** 按「送审文件清单」把文件内容读出来：单文件截断、文件数封顶，问题记进 notes */
function collectSendFiles(root, list) {
  const notes = [];
  const files = [];
  const seen = new Set();
  for (const item of list) {
    for (const rel of expandRel(root, item)) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (files.length >= SEND_FILE_MAX) {
        notes.push('文件数超过 ' + SEND_FILE_MAX + ' 个，已忽略 ' + rel);
        continue;
      }
      const abs = path.resolve(root, rel);
      if (path.relative(root, abs).startsWith('..')) {
        notes.push('越界路径被忽略：' + rel);
        continue;
      }
      let text = '';
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        notes.push('读不到 ' + rel);
        continue;
      }
      let truncated = false;
      if (text.length > SEND_FILE_CHARS) {
        text = text.slice(0, SEND_FILE_CHARS);
        truncated = true;
        notes.push(rel + ' 超过 ' + SEND_FILE_CHARS + ' 字符，已截断');
      }
      files.push({ rel, text, chars: text.length, truncated });
    }
  }
  return { files, notes };
}

function startCodexRun(workspace, input) {
  if (codexManual.running) return { ok: false, error: '已有一次手动外审在跑，等它结束' };
  const routeBlocked = routeBlocks(workspace, 'gpt');
  if (routeBlocked) return { ok: false, blocked: true, error: routeBlocked };
  const taskKey = String(input.task || input.taskKey || input.gate || 'routine_review');
  const root = path.resolve(String(input.root || ''));
  if (!existsDir(root)) return { ok: false, error: '项目目录不存在：' + root };

  // 送审文件清单：input.files 可以是数组，也可以是换行/逗号分隔的字符串；空则退回单文件 target
  const rawList = (Array.isArray(input.files) ? input.files : String(input.files || '').split(/[\n,]/))
    .map((x) => String(x || '').trim().replace(/\\/g, '/'))
    .filter(Boolean);
  const targetRel = String(input.target || '').replace(/\\/g, '/').trim();
  if (!rawList.length && targetRel) rawList.push(targetRel);
  if (!rawList.length) return { ok: false, error: '请选择送审文件（或填一个目标文件）' };
  const picked = collectSendFiles(root, rawList);
  if (!picked.files.length) {
    return { ok: false, error: '送审文件一个都没读到：' + (picked.notes.join('；') || rawList.join('、')) };
  }

  // 工作区：决定 -C，也决定 ChatGPT 续聊时能看到的范围
  const cfg = readCodexConfig(workspace);
  const sel = normalizeWorkspace(
    input.workspace
      ? { ...normalizeWorkspace(cfg.workspace), ...(typeof input.workspace === 'string' ? { mode: input.workspace } : input.workspace) }
      : cfg.workspace,
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let cwd = root;
  let copyDir = '';
  if (sel.mode === 'subdir') {
    const sub = path.resolve(root, sel.path || '');
    if (!sel.path || !existsDir(sub) || path.relative(root, sub).startsWith('..')) {
      return { ok: false, error: '子目录不存在或越界：' + (sel.path || '(空)') };
    }
    cwd = sub;
  } else if (sel.mode === 'copy') {
    copyDir = path.join(workspace, 'tmp', 'codex-sandbox', stamp);
    try {
      fs.mkdirSync(copyDir, { recursive: true });
      for (const f of picked.files) {
        const dest = path.join(copyDir, f.rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.text, 'utf8');
      }
    } catch (e) {
      return { ok: false, error: '准备隔离副本失败：' + String((e && e.message) || e) };
    }
    cwd = copyDir;
  }

  const labels = picked.files.map((f) => f.rel);
  const task = [
    '# 稿审派单 · ' + labels.join('、'),
    '',
    '请按 ARIS 审稿契约给出结论：先给 `VERDICT: accept|revise|reject`，再给 `Score: x/10`，然后写「## 摘要」与「## 主要问题」。',
    '主要问题必须可证伪、并指明证据在原文的哪一句；没有证据就只能写「材料不足」。不要重写稿件。',
  ].join('\n');

  codexManual = {
    running: true,
    at: new Date().toISOString(),
    root,
    task: taskKey,
    target: labels.join('、'),
    files: labels,
    workspace: sel,
    cwd,
    result: null,
    remaining: null,
    file: '',
  };

  const cleanup = () => {
    if (!copyDir || !cfg.cleanCopy) return;
    try {
      fs.rmSync(copyDir, { recursive: true, force: true });
    } catch {
      /* 清不掉就留着，面板上能看到路径 */
    }
  };

  runCodexReview({ workspace, root, taskKey, task, files: picked.files, cwd, workspaceMode: sel.mode })
    .then((res) => {
      let file = '';
      if (res.ok) {
        try {
          const dir = path.join(root, '.aris', 'reviews');
          fs.mkdirSync(dir, { recursive: true });
          const fstamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          file = path.join(dir, fstamp + '-codex-' + taskKey + '.md');
          fs.writeFileSync(file, res.text, 'utf8');
        } catch {
          /* 记录写失败不影响返回 */
        }
      }
      codexManual = {
        ...codexManual,
        running: false,
        file,
        remaining: res.remaining ?? null,
        result: res.ok
          ? {
            ok: true,
            model: res.model,
            cliModel: res.cliModel,
            effort: res.effort,
            tokens: res.tokens,
            ms: res.ms,
            chars: (res.entry && res.entry.chars) || 0,
            files: labels.length,
            sessionId: res.sessionId || '',
            events: (res.entry && res.entry.events) || '',
            verdict: require_verdict(res.text),
            notes: picked.notes,
            reply: res.text.slice(0, 4000),
          }
          : { ok: false, error: res.error, notes: picked.notes },
      };
      try {
        writeJsonAtomic(path.join(workspace, '.dsh', 'codex-manual-last.json'), {
          at: codexManual.at,
          task: taskKey,
          target: codexManual.target,
          files: labels,
          workspace: sel,
          file,
          ...codexManual.result,
        });
      } catch {
        /* 落盘失败不影响面板 */
      }
      cleanup();
    })
    .catch((e) => {
      codexManual = { ...codexManual, running: false, result: { ok: false, error: String((e && e.message) || e) } };
      cleanup();
    });
  return { ok: true, started: true, task: taskKey, target: labels.join('、'), files: labels, workspace: sel, cwd };
}

function require_verdict(text) {
  const m = /VERDICT\s*[:：=]\s*\**\s*(accept|revise|reject)/i.exec(String(text || ''));
  return m ? m[1].toLowerCase() : 'unknown';
}

/** 正在跑的流水线名字（切换审核线路前用它拦一下）。 */
function runningPipelineNames(workspace, config) {
  try {
    const settings = readSettings(workspace, config);
    const registry = readRegistry(workspace);
    const entries = (Array.isArray(registry) ? registry : registry.projects || [])
      .filter((e) => e && e.root && existsDir(e.root))
      .map((e) => ({ ...e, driver: e.driver === 'auto' ? (detectDriver(e.root).driver || 'auto') : e.driver }))
      .filter((e) => e.driver === 'frrs' || e.driver === 'aris');
    return entries
      .filter((e) => {
        try {
          return describePipeline(workspace, e, settings).running;
        } catch {
          return false;
        }
      })
      .map((e) => e.name || path.basename(e.root));
  } catch {
    return [];
  }
}

export function snapshot(workspace, config = {}) {
  const settings = readSettings(workspace, config);
  const registry = readRegistry(workspace);
  const entries = (Array.isArray(registry) ? registry : registry.projects || [])
    .filter((e) => e && e.root && existsDir(e.root))
    .map((e) => ({ ...e, driver: e.driver === 'auto' ? (detectDriver(e.root).driver || 'auto') : e.driver }))
    .filter((e) => e.driver === 'frrs' || e.driver === 'aris');
  const pipelines = entries.map((entry) => describePipeline(workspace, entry, settings));
  const allEvents = readEvents(workspace, 200);
  for (const p of pipelines) {
    p.events = allEvents.filter((e) => !e.name || e.name === p.name).slice(-30);
  }
  const running = pipelines.filter((p) => p.running).length;
  return {
    ok: true,
    at: new Date().toISOString(),
    workspace,
    runnerRev: RUNNER_REV,
    settings: {
      mailbox: settings.mailbox || '',
      model: settings.model,
      maxConcurrent: settings.maxConcurrent,
      maxMinutes: settings.maxMinutes,
      permissionMode: settings.permissionMode,
      kimi: settings.kimi || {},
      collectTask: settings.collectTask || {},
      pricesVersion: require_prices_version(),
    },
    dsh: (() => {
      const d = resolveDsh(settings);
      return { kind: d.kind, file: d.file };
    })(),
    codex: codexSnapshot(workspace),
    reviews: (() => {
      const rv = collectReviewResults(workspace);
      // 通道侧的「要人管」也并进同一张清单：额度用完 / 连续失败停摆
      try {
        const cx = codexState(workspace);
        const gate = cx && cx.quotaGate;
        const extra = [];
        if (gate && gate.blocked && /连续\s*3\s*次失败/.test(String(gate.reason || ''))) {
          extra.push({ kind: 'failures', level: 'bad', name: 'GPT 外审', title: '连续失败已停摆', detail: gate.reason, at: '', file: '' });
        } else if (gate && gate.blocked && gate.freeAt) {
          extra.push({ kind: 'quota', level: 'warn', name: 'GPT 外审', title: '本小时额度用完', detail: `已用 ${gate.used}/${gate.limit}，${String(gate.freeAt).slice(11, 16)} 之后恢复`, at: '', file: '' });
        }
        if (extra.length) rv.humanActions = [...extra, ...(rv.humanActions || [])];
        // 红色（真要人动手）排前面，琥珀（看着点）在后
        rv.humanActions.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
      } catch {}
      return rv;
    })(),
    pipelines,
    running,
    mailbox: mailboxState(settings.mailbox),
    handoff: readHandoff(workspace),
    events: allEvents,
    eventsPerCard: Number(settings.eventsPerCard) || 6,
    balance: readBalanceCache(workspace),
    registryFile: path.join(workspace, '.dsh', 'aris-projects.json'),
  };
}

function require_prices_version() {
  return '2026-11';
}

function resolveRoot(workspace, input) {
  const raw = String((input && (input.root || input.name)) || '').trim();
  if (!raw) throw new Error('缺少流水线根目录');
  const dir = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspace, raw);
  if (!existsDir(dir)) throw new Error(`目录不存在：${dir}`);
  return dir;
}

function findPipeline(workspace, root) {
  const registry = readRegistry(workspace);
  const hit = (Array.isArray(registry) ? registry : registry.projects || []).find((e) => e && path.resolve(e.root).toLowerCase() === root.toLowerCase());
  return hit || { root, driver: detectDriver(root) || 'aris', name: path.basename(root) };
}

/**
 * frrs 的暂停状态写在 pipeline/state.json，运行器每轮 preflight 都读它。
 * 只写 enabled=true 而不清 paused，等于按了「启用」却永远不跑 —— resume 与 start 共用这一段。
 */
function clearFrrsPause(root, suffix = 'dsh-resume') {
  const file = path.join(root, 'pipeline', 'state.json');
  const state = readJsonSafe(file, null);
  if (!state) throw new Error('读不到 pipeline/state.json');
  const before = { status: state.status, block: state.block ? state.block.id || String(state.block) : null };
  if (state.status === 'paused') state.status = 'running';
  if (state.block && (state.block.paused_by || state.block.resume_ok)) state.block = null;
  if (!Array.isArray(state.user_directives)) state.user_directives = [];
  state.user_directives.push({
    id: 'dir-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + suffix,
    ts: new Date().toISOString(),
    by: 'dsh-panel',
    text: '面板解除暂停：由 DSH headless 接管执行，A/B 保持 disable。',
    status: 'done',
    done: null,
  });
  writeJsonAtomic(file, state);
  // 上一轮留下的门禁字段会让 tick 继续跳过，解除暂停时一并清掉。
  const rt = readRuntime(root);
  if (rt.gateReason || rt.blockedUntil || rt.nextAt) {
    saveRuntime(root, { gateReason: '', blockedUntil: null, nextAt: null });
  }
  return { before, after: { status: state.status, block: null } };
}

/** 注册表里的 driver 可能是字符串，也可能被 describePipeline 写成了对象。 */
function driverNameOf(entry, root) {
  const raw = entry && entry.driver;
  const name = typeof raw === 'string' ? raw : raw && raw.driver ? raw.driver : '';
  if (name && name !== 'auto') return name;
  const det = detectDriver(root);
  return (det && det.driver) || 'aris';
}

export async function control(workspace, name, input = {}, config = {}) {
  const settings = readSettings(workspace, config);
  switch (name) {
    case 'refresh':
      return { ok: true };
    case 'add': {
      const root = resolveRoot(workspace, input);
      const detected = detectDriver(root);
      const driver = String(input.driver || (detected && detected.driver) || '');
      if (driver !== 'frrs' && driver !== 'aris') {
        throw new Error('无法识别流水线类型：既没有 pipeline/state.json，也没有 .aris/state.json');
      }
      const saved = upsertProject(workspace, { root, name: String(input.name || path.basename(root)), driver });
      const entry = Array.isArray(saved)
        ? (readRegistry(workspace).find((x) => path.resolve(x.root).toLowerCase() === root.toLowerCase()) || saved[0])
        : saved;
      saveConfig(root, {
        driver,
        enabled: input.enabled !== false,
        model: String(input.model || settings.model),
        maxMinutes: Number(input.maxMinutes || settings.maxMinutes || 45),
        intervalMinutes: Number(input.intervalMinutes || 0),
      });
      return { ok: true, entry, pipeline: describePipeline(workspace, entry, settings) };
    }
    case 'remove': {
      const root = resolveRoot(workspace, input);
      removeProject(workspace, root);
      return { ok: true, root };
    }
    case 'resume': {
      // 解除人工暂停：只清 status=paused 与暂停 block，不动 chain 与历史账本。
      const root = resolveRoot(workspace, input);
      const entry = findPipeline(workspace, root);
      const driver = driverNameOf(entry, root);
      let changed = null;
      if (driver === 'frrs') changed = clearFrrsPause(root, 'dsh-resume');
      saveConfig(root, { enabled: true });
      return { ok: true, changed };
    }
    case 'start': {
      const root = resolveRoot(workspace, input);
      const patch = { enabled: true };
      if (input.intervalMinutes != null) patch.intervalMinutes = Number(input.intervalMinutes) || 0;
      saveConfig(root, patch);
      // 启用后立刻排一次下一轮，否则卡片会一直显示「无下次时间」。
      try {
        recalcNextAt(workspace, readSettings(workspace), readHandoff(workspace).mode === 'kimi' ? 'kimi' : 'dsh');
      } catch {
        /* 排期失败不影响启用 */
      }
      // 重新启用时把上一次被杀/中断留下的 error 状态清掉，否则卡片一直显示「出错」。
      const rt = readRuntime(root);
      // 启用即撤回停止意图（本轮跑完继续，下一轮照常调度），顺带清掉旧的 stop-request 残留。
      cancelStopIntent(root);
      if (!isRunning(root) && ['error', 'interrupted', 'stopped'].includes(String(rt.status || ''))) {
        saveRuntime(root, { status: 'idle', lastError: null, pid: null });
      }
      const entry = findPipeline(workspace, root);
      const driver = driverNameOf(entry, root);
      // 「启用」必须同时解除 paused，否则运行器每轮都在 preflight 被拦，界面却显示已启用。
      let resumed = null;
      if (driver === 'frrs') {
        const st = readJsonSafe(path.join(root, 'pipeline', 'state.json'), null);
        if (st && st.status === 'paused') resumed = clearFrrsPause(root, 'dsh-start');
      }
      return { ok: true, resumed, pipeline: describePipeline(workspace, entry, settings) };
    }
    case 'stop': {
      const root = resolveRoot(workspace, input);
      const stopped = stopPipeline(root, { force: Boolean(input.force) });
      return { ok: true, graceful: Boolean(stopped && stopped.graceful), stopped };
    }
    case 'run': {
      const root = resolveRoot(workspace, input);
      const config = readConfig(root);
      if (isRunning(root)) return { ok: true, started: false, reason: '本轮进行中' };
      // 后台起跑，但要等 pid 落盘再返回：立刻返回会让卡片停在旧状态，
      // 失败也只落在 lastError 里，用户看到「已点但没反应」。
      let failure = null;
      const hooks = input.hooks && typeof input.hooks === 'object' ? input.hooks : null;
      const job = runOnce({ workspace, root, config, settings, hooks });
      job
        .catch((err) => {
          failure = err;
          try { saveRuntime(root, { lastError: String((err && err.message) || err).slice(0, 300), status: 'error', pid: null }); } catch {}
        })
        .finally(() => {
          if (hooks && typeof hooks.onEnd === 'function') {
            try { hooks.onEnd({ root }); } catch {}
          }
        });
      const deadline = Date.now() + 8000;
      let rt = readRuntime(root);
      while (Date.now() < deadline && !rt.pid && !failure) {
        await new Promise((r) => setTimeout(r, 200));
        rt = readRuntime(root);
      }
      if (failure) return { ok: false, started: false, error: String((failure && failure.message) || failure) };
      return { ok: true, started: Boolean(rt.pid), pid: rt.pid || null, runId: rt.runId || null };
    }
    case 'tick': {
      const results = await tick(workspace, { force: Boolean(input.force), hooks: input.hooks || null });
      return { ok: true, results };
    }
    case 'prompt.get': {
      const root = resolveRoot(workspace, input);
      return { ok: true, text: readTextSafe(path.join(runDir(root), 'prompt.md'), 60_000) };
    }
    case 'prompt.reset': {
      const root = resolveRoot(workspace, input);
      const cfg = readConfig(root);
      const st = readSettings(workspace);
      const text = resetPrompt(root, cfg.driver, cfg, st);
      return { ok: true, reset: true, chars: text.length };
    }
    case 'prompt.set': {
      const root = resolveRoot(workspace, input);
      const text = String(input.text || '');
      if (!text.trim()) throw new Error('提示词不能为空');
      fs.mkdirSync(runDir(root), { recursive: true });
      fs.writeFileSync(path.join(runDir(root), 'prompt.md'), text, 'utf8');
      return { ok: true, bytes: Buffer.byteLength(text) };
    }
    case 'logs': {
      const root = resolveRoot(workspace, input);
      const runsDir = path.join(runDir(root), 'runs');
      let latest = '';
      try {
        latest = fs
          .readdirSync(runsDir)
          .filter((n) => fs.statSync(path.join(runsDir, n)).isDirectory())
          .sort()
          .pop() || '';
      } catch {
        latest = '';
      }
      const dir = latest ? path.join(runsDir, latest) : '';
      const tail = (file, n = 120) => {
        if (!dir) return '';
        const text = readTextSafe(path.join(dir, file), 400000);
        return text.split(/\r?\n/).filter(Boolean).slice(-n).join('\n');
      };
      return {
        ok: true,
        runId: latest,
        prompt: dir ? readTextSafe(path.join(dir, 'prompt.md'), 60000) : '',
        final: tail('final.txt', 200),
        stderr: tail('stderr.log', 80),
        events: tail('events.ndjson', 40),
      };
    }
    case 'settings.save': {
      const patch = {};
      const s = input.settings || {};
      if (s.mailbox != null) patch.mailbox = String(s.mailbox).trim();
      if (s.model != null) patch.model = String(s.model).trim();
      if (s.maxConcurrent != null) patch.maxConcurrent = Math.max(1, Number(s.maxConcurrent) || 1);
      if (s.maxMinutes != null) patch.maxMinutes = Math.max(5, Number(s.maxMinutes) || 45);
      if (s.kimi) patch.kimi = s.kimi;
      if (s.collectTask) patch.collectTask = s.collectTask;
      if (s.eventsPerCard != null) patch.eventsPerCard = Math.max(0, Math.min(30, Number(s.eventsPerCard) || 0));
      const next = saveSettings(workspace, patch);
      recalcNextAt(workspace, next, readHandoff(workspace).mode === 'kimi' ? 'kimi' : 'dsh');
      return { ok: true, settings: next };
    }
    case 'task.delete': {
      // 取件任务已退役：headless 每轮自己 collect，不再需要 Windows 计划任务。
      return { ok: true, deleted: null };
    }
    case 'codex.state': {
      return { ok: true, codex: codexSnapshot(workspace) };
    }
    case 'codex.models': {
      return { ok: true, models: listModels() };
    }
    case 'codex.save': {
      // 写后立刻回读：面板显示的一定是落盘后的真值，不是乐观回显。
      const patch = input.codex || input;
      saveCodexConfig(workspace, patch && typeof patch === 'object' ? patch : {});
      return { ok: true, codex: codexSnapshot(workspace), saved: readCodexConfig(workspace) };
    }
    case 'review.route': {
      const want = String((input || {}).channel || '').trim();
      const current = readReviewRoute(workspace);
      if (want && want !== current.channel) {
        const running = runningPipelineNames(workspace, config);
        if (running.length) {
          return {
            ok: false,
            blocked: true,
            error: `流水线「${running.join('、')}」正在运行，运行期间不允许切换审核线路——跑到一半换通道会让同一轮出现两种审稿人。等这一轮结束再改。`,
            route: current,
            dashboard: snapshot(workspace, config),
          };
        }
      }
      // 面板是唯一入口：同时改 DSH 设置与每个项目的 reviewer.json（双槽保留）。
      const projects = (() => {
        try {
          const reg = readRegistry(workspace);
          return (Array.isArray(reg) ? reg : reg.projects || []).map((e) => ({ root: e && e.root, name: (e && (e.name || e.label)) || '' })).filter((x) => x.root);
        } catch {
          return [];
        }
      })();
      const saved = saveReviewRoute(workspace, want, projects);
      const bad = (saved.projects || []).filter((x) => x && x.ok === false);
      return {
        ok: bad.length === 0,
        route: saved,
        projects: saved.projects || [],
        ...(bad.length ? { error: `设置已写入，但有 ${bad.length} 个项目同步失败：${bad.map((b) => b.root).join('、')}` } : {}),
        dashboard: snapshot(workspace, config),
      };
    }
    case 'codex.run': {
      return startCodexRun(workspace, input || {});
    }
    case 'codex.session': {
      // 把一条会话的 rollout 还原成对话：面板「查看会话」用，只读，不碰会话库。
      const sid = String((input || {}).sessionId || '').trim();
      if (!sid) return { ok: false, error: '缺少 sessionId' };
      const t = readSessionTranscript(sid, { maxTurns: (input || {}).maxTurns });
      return t.ok ? { ok: true, session: t } : { ok: false, error: t.error || '读取会话失败' };
    }
    case 'handoff.set': {
      const mode = String(input.mode || '') === 'kimi' ? 'kimi' : 'dsh';
      if (mode === 'kimi') {
        const registry = readRegistry(workspace);
        for (const entry of Array.isArray(registry) ? registry : registry.projects || []) {
          if (entry && entry.root) stopPipeline(entry.root, { force: true });
        }
      }
      const handoff = writeHandoff(workspace, { mode, note: String(input.note || '') });
      recalcNextAt(workspace, readSettings(workspace, config), mode);
      return { ok: true, handoff };
    }
    case 'balance.check': {
      // 只在「由不安全回到 ok」的那一次提示；否则每个节拍都会重复写同一条事件（踩过 4 次）。
      let prevLevel = '';
      try {
        prevLevel = String((readBalanceCache(workspace) || {}).level || '');
      } catch {
        prevLevel = '';
      }
      const bal = await getBalance(workspace, settings, { force: Boolean(input.force) });
      const snapBal = snapshot(workspace, config);
      const floor = enforceFloor(snapBal, bal, { saveConfig });
      // 余额回到安全线后只提示，不自动重启（重启与否由人决定）。
      const recovered = bal && bal.level === 'ok' && prevLevel && prevLevel !== 'ok';
      if (recovered && (snapBal.pipelines || []).some((x) => x.enabled === false && x.blocked)) {
        try {
          appendEvent(workspace, { text: '余额已恢复：先前被余额阈值停用的流水线可重新启用' });
        } catch {
          /* 账本写失败不影响检查 */
        }
      }
      return { ok: true, balance: bal, halted: floor.halted, reason: floor.reason };
    }
    case 'limits.save': {
      const root = resolveRoot(workspace, input);
      const patch = {};
      if (input.dailyRuns != null) patch.dailyRuns = Math.max(0, Number(input.dailyRuns) || 0);
      if (input.dailyCny != null) patch.dailyCny = Math.max(0, Number(input.dailyCny) || 0);
      const config = saveConfig(root, { limits: patch });
      return { ok: true, limits: config.limits };
    }
    case 'human.reply': {
      // 人工介入：把回复写成文件交给下一轮，可选立刻解除阻塞并重启。
      const root = resolveRoot(workspace, input);
      const text = String(input.text || '').trim();
      if (!text) throw new Error('回复内容为空');
      fs.mkdirSync(runDir(root), { recursive: true });
      const file = path.join(runDir(root), 'human-note.md');
      const at = new Date().toISOString();
      const prev = readTextSafe(file, 200_000) || '';
      const next = `## ${at} 人工回复

${text}

` + prev;
      fs.writeFileSync(file, next, 'utf8');
      let resumed = null;
      if (input.restart) {
        const entry = findPipeline(workspace, root);
        const driver = entry.driver && entry.driver !== 'auto' ? entry.driver : detectDriver(root).driver || 'aris';
        if (driver === 'frrs') {
          const stateFile = path.join(root, 'pipeline', 'state.json');
          const state = readJsonSafe(stateFile, null);
          if (state) {
            const before = { status: state.status, block: state.block ? state.block.id || 'block' : null };
            state.status = 'running';
            state.block = null;
            if (!Array.isArray(state.user_directives)) state.user_directives = [];
            state.user_directives.push({
              id: 'dir-' + at.slice(0, 10).replace(/-/g, '') + '-human-reply',
              ts: at,
              by: 'dsh-panel-human',
              text: text.slice(0, 500),
              status: 'done',
              done: null,
            });
            writeJsonAtomic(stateFile, state);
            resumed = { before, after: { status: state.status, block: null } };
          }
        }
        saveConfig(root, { enabled: true });
      }
      return { ok: true, file, resumed };
    }
    case 'recover': {
      const fixed = recoverStale(workspace);
      const released = [];
      const registry0 = readRegistry(workspace);
      for (const entry of Array.isArray(registry0) ? registry0 : registry0.projects || []) {
        if (!entry || !entry.root) continue;
        const cfg = readConfig(entry.root);
        const driver = cfg.driver && cfg.driver !== 'auto' ? cfg.driver : detectDriver(entry.root).driver;
        if (driver !== 'frrs') continue;
        const stateFile = path.join(entry.root, 'pipeline', 'state.json');
        const state = readJsonSafe(stateFile, null);
        const owner = state && state.chain && state.chain.wake_owner;
        const started = state && state.chain && state.chain.wake_start;
        if (!owner || !started) continue;
        const ageMin = (Date.now() - Date.parse(started)) / 60_000;
        if (ageMin < 70) continue; // 租约还没过期，不动
        if (isRunning(entry.root)) continue;
        released.push({ root: entry.root, owner, ageMin: Math.round(ageMin) });
      }
      return { ok: true, fixed, staleLeases: released };
    }
    case 'runtime.reset': {
      const root = resolveRoot(workspace, input);
      if (isRunning(root)) return { ok: false, error: '本轮还在运行：先停用再清空' };
      const dir = path.join(root, RUN_DIR);
      const hist = path.join(dir, 'history');
      fs.mkdirSync(hist, { recursive: true });
      const stamp0 = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const moved = [];
      for (const f of ['runtime.json', 'costs.jsonl', 'activity.json']) {
        const src = path.join(dir, f);
        if (!fs.existsSync(src)) continue;
        const dst = path.join(hist, `${stamp0}-${f}`);
        fs.renameSync(src, dst);
        moved.push(dst);
      }
      saveRuntime(root, {
        status: 'idle', pid: null, lastRun: null, sessionId: null, nextAt: null,
        consecutiveErrors: 0, blockedUntil: null, waiting: 0, gateReason: '', lastError: null,
        totals: { runs: 0, cny: 0, usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 } },
      });
      return { ok: true, root, reset: true, archived: moved };
    }
    case 'lease.release': {
      // 只有人工确认后才调用：把过期租约交还给状态机（--finish --no-progress）。
      const root = resolveRoot(workspace, input);
      const stateFile = path.join(root, 'pipeline', 'state.json');
      const gate = path.join(root, 'pipeline', 'gate.py');
      if (!fs.existsSync(gate)) throw new Error('找不到 gate.py');
      const { execFileSync } = await import('node:child_process');
      const out = execFileSync('python', [gate, stateFile, input.half || 'A', '--finish', '--no-progress'], {
        cwd: root, encoding: 'utf8', timeout: 30_000,
      });
      return { ok: true, output: String(out).trim().slice(-1000) };
    }
    case 'mailbox.collect': {
      const { collectMailbox } = await import('./aris-runner.mjs');
      const out = await collectMailbox(workspace, settings, runDir(workspace));
      return { ok: true, collect: out };
    }
    default:
      throw new Error(`未知动作：${name}`);
  }
}
