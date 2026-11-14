// Host-side readers for the ARIS dashboard: filesystem only, no spawning.
// Everything here is derived from files the ARIS CLI already owns, so the panel
// never becomes a second source of truth.
import fs from 'node:fs';
import path from 'node:path';

export const PHASES = ['literature', 'idea', 'experiment', 'writing', 'review', 'done'];
export const ARTIFACT_FIELDS = ['wiki', 'idea', 'paper', 'experiments'];

const MAX_REVIEW_FILES = 400;

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readText(file, limit = 200_000) {
  try {
    const buf = fs.readFileSync(file);
    return buf.subarray(0, limit).toString('utf8');
  } catch {
    return null;
  }
}

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

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function listFiles(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Dashboard settings live in the workspace so a reinstall is never required. */
export function readSettings(workspace, config = {}) {
  const file = path.join(workspace, '.dsh', 'aris-dashboard.json');
  const raw = readJson(file) || {};
  const pollMs = Number(raw.pollMs);
  const mailbox = String(raw.mailbox || config.mailbox || '').trim();
  const nodePath = String(raw.nodePath || config.nodePath || '').trim();
  const extraRoots = Array.isArray(raw.projectRoots) ? raw.projectRoots.filter((x) => typeof x === 'string') : [];
  return {
    file,
    present: isFile(file),
    mailbox,
    nodePath,
    pollMs: Number.isFinite(pollMs) && pollMs >= 2000 ? pollMs : 5000,
    projectRoots: extraRoots,
  };
}

/**
 * Registered projects first, then a best-effort sweep of the two locations the
 * CLI creates on its own: <workspace>/.aris/* and <workspace>/work/<slug>/.aris.
 */
export function loadProjects(workspace, settings = {}) {
  const found = new Map();
  const add = (entry) => {
    if (!entry || !entry.stateDir) return;
    const stateFile = path.join(entry.stateDir, 'state.json');
    if (!isFile(stateFile)) return;
    const key = path.resolve(entry.stateDir).toLowerCase();
    if (found.has(key)) return;
    found.set(key, entry);
  };

  const registry = readJson(path.join(workspace, '.dsh', 'aris-projects.json'));
  const registered = Array.isArray(registry)
    ? registry
    : registry && Array.isArray(registry.projects)
      ? registry.projects
      : [];
  for (const item of registered) {
    if (!item || typeof item !== 'object') continue;
    const stateDir = item.stateDir || item.state_dir || (item.project ? path.join(item.project, '.aris') : '');
    add({
      name: String(item.name || path.basename(item.project || stateDir || 'aris')),
      project: item.project ? String(item.project) : '',
      stateDir: stateDir ? String(stateDir) : '',
      kind: String(item.kind || 'aris'),
      source: 'registry',
    });
  }

  for (const name of listDirs(path.join(workspace, '.aris'))) {
    const stateDir = path.join(workspace, '.aris', name);
    add({ name, project: '', stateDir, kind: 'aris', source: 'scan' });
  }

  const workDir = path.join(workspace, 'work');
  for (const slug of listDirs(workDir)) {
    const project = path.join(workDir, slug);
    add({ name: slug, project, stateDir: path.join(project, '.aris'), kind: 'aris', source: 'scan' });
  }

  for (const root of settings.projectRoots || []) {
    if (!root || !isDir(root)) continue;
    add({ name: path.basename(root), project: root, stateDir: path.join(root, '.aris'), kind: 'aris', source: 'scan' });
  }

  return [...found.values()];
}

function countFiles(dir, suffix) {
  return listFiles(dir).filter((f) => f.endsWith(suffix)).length;
}

function relTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** One project's live view, tolerant of a missing/corrupt state file. */
export function describeProject(entry) {
  const stateFile = path.join(entry.stateDir, 'state.json');
  const state = readJson(stateFile);
  const base = {
    name: entry.name,
    project: entry.project || (state && state.project) || '',
    stateDir: entry.stateDir,
    kind: entry.kind || 'aris',
    source: entry.source || '',
    present: Boolean(state),
    updatedAt: null,
    ageLabel: null,
    phase: null,
    round: null,
    effort: null,
    assurance: null,
    gates: [],
    gatesOpen: 0,
    gatesPassed: 0,
    allGatesPassed: false,
    reviews: 0,
    latestReview: null,
    next: null,
    artifacts: { wiki: false, idea: false, paper: false, experiments: 0 },
    events: 0,
    error: null,
  };
  if (!state) {
    base.error = `state.json 不可读：${stateFile}`;
    return base;
  }

  base.phase = typeof state.phase === 'string' ? state.phase : null;
  base.round = Number.isFinite(state.round) ? state.round : null;
  base.effort = state.effort || null;
  base.assurance = state.assurance || null;
  base.updatedAt = state.updated_at || state.created_at || null;
  base.ageLabel = relTime(base.updatedAt);
  base.events = Number.isFinite(state.events_count) ? state.events_count : 0;

  const gates = state.gates && typeof state.gates === 'object' ? state.gates : {};
  base.gates = Object.entries(gates).map(([name, gate]) => ({
    name,
    status: String((gate && gate.status) || 'pending'),
    at: (gate && gate.at) || null,
  }));
  base.gatesPassed = base.gates.filter((g) => g.status === 'pass').length;
  base.gatesOpen = base.gates.filter((g) => g.status !== 'pass' && g.status !== 'waived').length;
  base.allGatesPassed = base.gates.length > 0 && base.gates.every((g) => g.status === 'pass' || g.status === 'waived');

  const artifacts = state.artifacts && typeof state.artifacts === 'object' ? state.artifacts : {};
  base.artifacts = {
    wiki: Boolean(artifacts.wiki),
    idea: Boolean(artifacts.idea),
    paper: Boolean(artifacts.paper),
    experiments: Array.isArray(artifacts.experiments) ? artifacts.experiments.length : 0,
  };

  const reviews = Array.isArray(artifacts.reviews) ? artifacts.reviews : [];
  const onDisk = countFiles(path.join(entry.stateDir, 'reviews'), '.json');
  base.reviews = Math.max(reviews.length, Math.min(onDisk, MAX_REVIEW_FILES));
  const last = reviews[reviews.length - 1];
  if (last && typeof last === 'object') {
    base.latestReview = {
      verdict: last.verdict || null,
      score: Number.isFinite(last.score) ? last.score : null,
      at: last.created_at || null,
      tier: last.tier || null,
      backend: last.backend || null,
      target: last.target || null,
    };
  }

  if (state.next && typeof state.next === 'object') {
    base.next = { skill: state.next.skill || null, reason: state.next.reason || null };
  }
  return base;
}

/** Mailbox status from queue.md — the file the collect pass writes. */
export function describeMailbox(mailbox) {
  const out = {
    path: mailbox || '',
    configured: Boolean(mailbox),
    present: false,
    pending: 0,
    pendingItems: [],
    replied: 0,
    generatedAt: null,
    error: null,
  };
  if (!mailbox) {
    out.error = '未配置邮箱目录';
    return out;
  }
  const queueFile = path.join(mailbox, 'queue.md');
  const text = readText(queueFile);
  if (text == null) {
    out.error = `queue.md 不可读：${queueFile}`;
    return out;
  }
  out.present = true;
  const pendingMatch = /PENDING:\s*(\d+)/.exec(text);
  if (pendingMatch) out.pending = Number(pendingMatch[1]);
  const generated = /生成时间：(.+)/.exec(text);
  if (generated) out.generatedAt = generated[1].trim();

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*-\s*`([^`]+)`\s*·\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const request = m[1];
    const projectName = m[2];
    if (out.pendingItems.length < 20 && !out.pendingItems.some((x) => x.request === request)) {
      out.pendingItems.push({ request, project: projectName });
    }
  }
  if (out.pendingItems.length < out.pending) {
    const inDir = path.join(mailbox, 'in');
    for (const file of listFiles(inDir)) {
      if (!file.endsWith('.request.md')) continue;
      if (out.pendingItems.length >= 20) break;
      if (out.pendingItems.some((x) => file.startsWith(x.request))) continue;
      out.pendingItems.push({ request: `in/${file}`, project: '' });
    }
  }
  return out;
}

export function readCollectLog(workspace, lines = 6) {
  const file = path.join(workspace, '.dsh', 'logs', 'aris-collect.log');
  const text = readText(file, 60_000);
  if (text == null) return { path: file, present: false, tail: [], mtime: null };
  const tail = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines);
  return { path: file, present: true, tail, mtime: mtime(file) };
}

export function summarize(projects, mailbox) {
  const withState = projects.filter((p) => p.present);
  return {
    projects: projects.length,
    live: withState.length,
    broken: projects.length - withState.length,
    gatesOpen: withState.reduce((n, p) => n + p.gatesOpen, 0),
    reviews: withState.reduce((n, p) => n + p.reviews, 0),
    pending: mailbox.pending,
    phases: withState.reduce((acc, p) => {
      const key = p.phase || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}
