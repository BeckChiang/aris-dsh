// ARIS on DSH — state layer.
// Pure Node built-ins (fs/path/url). Owns: path discovery, the .aris layout,
// atomic state writes, the JSONL event log, and the deterministic `next` rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHASES = ['literature', 'idea', 'experiment', 'writing', 'review', 'done'];

export const PHASE_LABELS = {
  literature: '文献调研',
  idea: '想法生成',
  experiment: '实验',
  writing: '写作',
  review: '审查',
  done: '完成',
};

export const EFFORTS = ['low', 'medium', 'high'];
export const ASSURANCES = ['standard', 'strict'];

// Upstream ARIS names (lite/balanced/max/beast, draft/.../submission) are accepted
// as aliases; state.json always stores the DSH vocabulary used by the other scripts.
const EFFORT_ALIASES = {
  lite: 'low', low: 'low',
  balanced: 'medium', medium: 'medium',
  max: 'high', high: 'high',
  beast: 'high',
};

const ASSURANCE_ALIASES = {
  draft: 'standard', polished: 'standard', standard: 'standard',
  'conference-ready': 'strict', submission: 'strict', strict: 'strict',
};

export const GATE_NAMES = ['idea_discovery', 'forensics', 'evidence_check'];

const GATE_STATUSES = ['pending', 'pass', 'fail'];

export function normalizeEffort(value) {
  if (value === undefined) return 'medium';
  return EFFORT_ALIASES[String(value).toLowerCase()] || null;
}

export function normalizeAssurance(value) {
  if (value === undefined) return 'standard';
  return ASSURANCE_ALIASES[String(value).toLowerCase()] || null;
}

export function iso() {
  return new Date().toISOString();
}

export function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function dirnameOfImport() {
  return path.dirname(fileURLToPath(import.meta.url)); // <workspace>/bin/lib
}

// Walk up from the script and from cwd looking for <root>/.dsh/skills/aris.
export function findArisHome() {
  const env = process.env.ARIS_HOME;
  if (env) {
    const abs = path.resolve(env);
    if (isDir(abs) && isDir(path.join(abs, 'tools'))) return abs;
    return null;
  }
  const starts = [dirnameOfImport(), process.cwd()];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      const cand = path.join(dir, '.dsh', 'skills', 'aris');
      if (isDir(cand) && isDir(path.join(cand, 'tools'))) return cand;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export function resolveProject(raw) {
  return path.resolve(process.cwd(), raw || '.');
}

/** `.aris` 状态根：默认在项目里，可用 ARIS_STATE_DIR 指到别处（例如把项目放在同步盘、
 *  但状态留在 DSH 工作区，收件/记账才不需要提权）。 */
export function stateRoot(project) {
  const env = process.env.ARIS_STATE_DIR;
  if (env && env.trim()) return path.resolve(project, env.trim());
  return path.join(project, '.aris');
}

export function arisPaths(project) {
  const aris = stateRoot(project);
  return {
    aris,
    state: path.join(aris, 'state.json'),
    repo: path.join(aris, 'repo'),
    installedSkills: path.join(aris, 'installed-skills.txt'),
    gates: path.join(aris, 'gates'),
    meta: path.join(aris, 'meta'),
    events: path.join(aris, 'meta', 'events.jsonl'),
  };
}

export function gateCmdPath(project, name) {
  return path.join(arisPaths(project).gates, `${name}.cmd`);
}

export function gateOutPath(project, name) {
  return path.join(arisPaths(project).gates, `${name}.out`);
}

// Git Bash friendly path: forward slashes keep quoted Windows paths usable.
export function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function blankGate() {
  return { status: 'pending', at: null, detail: null };
}

export function emptyState(project, arisHome, { effort = 'medium', assurance = 'standard' } = {}) {
  const now = iso();
  return {
    schema: 1,
    project,
    aris_home: arisHome,
    tools_dir: path.join(arisHome, 'tools'),
    phase: 'literature',
    round: 0,
    effort,
    assurance,
    created_at: now,
    updated_at: now,
    artifacts: { wiki: null, idea: null, experiments: [], paper: null, reviews: [] },
    gates: {
      idea_discovery: blankGate(),
      forensics: blankGate(),
      evidence_check: blankGate(),
    },
    next: { skill: null, reason: null },
    events_count: 0,
  };
}

export function readState(project) {
  const p = arisPaths(project);
  let text;
  try {
    text = fs.readFileSync(p.state, 'utf8');
  } catch {
    throw new Error(`no state file at ${p.state}; run: node bin/aris.mjs init --project "${project}"`);
  }
  let state;
  try {
    state = JSON.parse(text);
  } catch (err) {
    throw new Error(`state file is not valid JSON (${p.state}): ${err.message}`);
  }
  return state;
}

function atomicWrite(file, text) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') {
      // Windows: another reader may hold the file open for an instant.
      try {
        fs.rmSync(file, { force: true });
      } catch { /* ignore */ }
      fs.renameSync(tmp, file);
    } else {
      try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      throw err;
    }
  }
}

export function writeState(project, state) {
  const p = arisPaths(project);
  state.updated_at = iso();
  atomicWrite(p.state, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  } catch {
    return [];
  }
}

export function readEvents(project) {
  const p = arisPaths(project);
  const events = [];
  for (const line of readLines(p.events)) {
    try {
      events.push(JSON.parse(line));
    } catch {
      events.push({ kind: 'corrupt', raw: line });
    }
  }
  return events;
}

export function eventCount(project) {
  return readLines(arisPaths(project).events).length;
}

// Append one JSONL event. Returns the event; caller persists state.events_count.
export function appendEvent(project, state, { kind, message, data }) {
  const p = arisPaths(project);
  fs.mkdirSync(p.meta, { recursive: true });
  const seq = eventCount(project) + 1;
  const event = {
    seq,
    ts: iso(),
    kind: String(kind),
    phase: state.phase,
    round: state.round,
    message: String(message ?? ''),
  };
  if (data !== undefined) event.data = data;
  fs.appendFileSync(p.events, `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function artifactExists(state, rel) {
  if (!rel || typeof rel !== 'string') return false;
  return fs.existsSync(path.resolve(state.project, rel));
}

export function gateStatus(state, name) {
  return state?.gates?.[name]?.status || 'pending';
}

// Deterministic next-step rule: first matching row wins. Returns English reason
// (persisted, keeps state.json ASCII-clean) plus a Chinese rendering for humans.
export function computeNext(state) {
  const g = (n) => gateStatus(state, n);
  const art = state.artifacts || {};

  if (state.phase === 'done') {
    return { skill: null, reason: 'phase is done; project complete', reasonZh: '阶段为 done，项目已完成' };
  }

  for (const [name, rule] of [
    ['idea_discovery', { skill: 'idea-discovery', zh: 'idea_discovery 门禁未通过，回到想法阶段返工' }],
    ['forensics', { skill: 'integrity-forensics', zh: 'forensics 门禁未通过，先处理完整性义务' }],
    ['evidence_check', { skill: 'paper-claim-audit', zh: 'evidence_check 门禁未通过，先修引用证据再做 claim 审计' }],
  ]) {
    if (g(name) === 'fail') {
      return { skill: rule.skill, reason: `${name} gate failed; rework the stage before advancing`, reasonZh: rule.zh };
    }
  }

  switch (state.phase) {
    case 'literature':
      if (!artifactExists(state, art.wiki)) {
        return { skill: 'research-wiki', reason: 'phase literature: wiki artifact is missing', reasonZh: '阶段 literature：缺少文献 wiki 产物' };
      }
      if (!artifactExists(state, art.idea)) {
        return { skill: 'idea-discovery', reason: 'phase literature: wiki exists, idea artifact still missing', reasonZh: '阶段 literature：wiki 已就绪，idea 产物仍缺失' };
      }
      return { skill: 'idea-discovery', reason: 'phase literature: core artifacts present; start idea discovery', reasonZh: '阶段 literature：核心产物齐全，可进入想法生成' };
    case 'idea':
      if (!artifactExists(state, art.idea)) {
        return { skill: 'idea-discovery', reason: 'phase idea: idea artifact is missing', reasonZh: '阶段 idea：缺少 idea 产物' };
      }
      if (g('idea_discovery') !== 'pass') {
        return { skill: 'idea-discovery', reason: 'phase idea: idea_discovery gate has not passed', reasonZh: '阶段 idea：idea_discovery 门禁尚未通过' };
      }
      return { skill: 'experiment-bridge', reason: 'phase idea: idea artifact and gate are green; build the experiment bridge', reasonZh: '阶段 idea：idea 产物与门禁均通过，可搭实验桥' };
    case 'experiment':
      if (!Array.isArray(art.experiments) || art.experiments.length === 0) {
        return { skill: 'experiment-bridge', reason: 'phase experiment: no experiment artifact recorded', reasonZh: '阶段 experiment：尚未登记实验产物' };
      }
      return { skill: 'experiment-audit', reason: 'phase experiment: experiments recorded; audit them before claims', reasonZh: '阶段 experiment：实验已登记，先做实验审计再提 claim' };
    case 'writing':
      if (!artifactExists(state, art.paper)) {
        return { skill: 'paper-writing', reason: 'phase writing: paper artifact is missing', reasonZh: '阶段 writing：缺少论文产物' };
      }
      return { skill: 'auto-review-loop', reason: 'phase writing: draft exists; start the review loop', reasonZh: '阶段 writing：草稿已就绪，进入审查循环' };
    case 'review':
      if (!Array.isArray(art.reviews) || art.reviews.length === 0) {
        return { skill: 'auto-review-loop', reason: 'phase review: no review recorded', reasonZh: '阶段 review：尚未记录审查结果' };
      }
      if (g('evidence_check') !== 'pass') {
        return { skill: 'paper-claim-audit', reason: 'phase review: evidence_check gate has not passed', reasonZh: '阶段 review：evidence_check 门禁尚未通过' };
      }
      return { skill: 'kill-argument', reason: 'phase review: reviews and evidence gate are green; run the adversarial audit', reasonZh: '阶段 review：审查与证据门禁均通过，做 kill-argument 对抗审计' };
    default:
      return { skill: null, reason: 'unknown phase', reasonZh: '未知阶段' };
  }
}

export function refreshNext(state) {
  const n = computeNext(state);
  state.next = { skill: n.skill, reason: n.reason };
  return state;
}

// Structure + on-disk integrity of one project. Returns English errors/warnings.
export function validateState(project, state) {
  const errors = [];
  const warnings = [];
  const p = arisPaths(project);

  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  const warn = (cond, msg) => { if (!cond) warnings.push(msg); };

  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return { errors: ['state root is not an object'], warnings };
  }

  need(state.schema === 1, `schema must be 1, got ${JSON.stringify(state.schema)}`);
  need(typeof state.project === 'string' && state.project.length > 0, 'project must be a non-empty string');
  if (typeof state.project === 'string') {
    need(path.resolve(state.project) === path.resolve(project), `project field (${state.project}) differs from --project (${project})`);
    warn(isDir(state.project), `project directory is missing: ${state.project}`);
  }
  need(typeof state.aris_home === 'string' && state.aris_home.length > 0, 'aris_home must be a non-empty string');
  if (typeof state.aris_home === 'string') {
    warn(isDir(state.aris_home), `aris_home is missing: ${state.aris_home}`);
    need(typeof state.tools_dir === 'string' && state.tools_dir.length > 0, 'tools_dir must be a non-empty string');
    if (typeof state.tools_dir === 'string') {
      const expected = path.join(state.aris_home, 'tools');
      warn(isDir(state.tools_dir), `tools_dir is missing: ${state.tools_dir}`);
      warn(path.resolve(state.tools_dir) === path.resolve(expected), `tools_dir (${state.tools_dir}) should be ${expected}`);
    }
  }
  need(PHASES.includes(state.phase), `phase must be one of ${PHASES.join('|')}, got ${JSON.stringify(state.phase)}`);
  need(Number.isInteger(state.round) && state.round >= 0, 'round must be a non-negative integer');
  need(EFFORTS.includes(state.effort), `effort must be one of ${EFFORTS.join('|')}, got ${JSON.stringify(state.effort)}`);
  need(ASSURANCES.includes(state.assurance), `assurance must be one of ${ASSURANCES.join('|')}, got ${JSON.stringify(state.assurance)}`);
  for (const key of ['created_at', 'updated_at']) {
    need(typeof state[key] === 'string' && !Number.isNaN(Date.parse(state[key])), `${key} must be an ISO8601 timestamp`);
  }

  const art = state.artifacts;
  if (art === null || typeof art !== 'object' || Array.isArray(art)) {
    errors.push('artifacts must be an object');
  } else {
    for (const key of ['wiki', 'idea', 'paper']) {
      need(art[key] === null || typeof art[key] === 'string', `artifacts.${key} must be null or a string path`);
      if (typeof art[key] === 'string' && art[key]) warn(artifactExists(state, art[key]), `artifacts.${key} path does not exist: ${art[key]}`);
    }
    for (const key of ['experiments', 'reviews']) {
      need(Array.isArray(art[key]), `artifacts.${key} must be an array`);
      if (Array.isArray(art[key])) {
        for (const item of art[key]) {
          const rel = typeof item === 'string' ? item : (item && typeof item.path === 'string' ? item.path : null);
          if (rel) warn(artifactExists(state, rel), `artifacts.${key} entry path does not exist: ${rel}`);
        }
      }
    }
  }

  const gates = state.gates;
  if (gates === null || typeof gates !== 'object' || Array.isArray(gates)) {
    errors.push('gates must be an object');
  } else {
    for (const [name, value] of Object.entries(gates)) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`gates.${name} must be an object`);
        continue;
      }
      need(GATE_STATUSES.includes(value.status), `gates.${name}.status must be pending|pass|fail, got ${JSON.stringify(value.status)}`);
      need(value.at === null || (typeof value.at === 'string' && !Number.isNaN(Date.parse(value.at))), `gates.${name}.at must be null or an ISO8601 timestamp`);
      need(value.detail === null || typeof value.detail === 'string' || typeof value.detail === 'object', `gates.${name}.detail must be null, a string, or an object`);
      if (typeof state.aris_home === 'string' && isDir(state.aris_home)) {
        const script = path.join(state.aris_home, 'tools', `${name}.py`);
        warn(isDir(state.aris_home) ? fs.existsSync(script) || GATE_NAMES.includes(name) : true, `gate ${name} has no known script under tools/`);
      }
    }
  }

  const next = state.next;
  if (next === null || typeof next !== 'object' || Array.isArray(next)) {
    errors.push('next must be an object');
  } else {
    need(next.skill === null || typeof next.skill === 'string', 'next.skill must be null or a string');
    need(next.reason === null || typeof next.reason === 'string', 'next.reason must be null or a string');
  }

  need(Number.isInteger(state.events_count) && state.events_count >= 0, 'events_count must be a non-negative integer');
  if (Number.isInteger(state.events_count)) {
    const actual = eventCount(project);
    warn(actual === state.events_count, `events_count (${state.events_count}) differs from events.jsonl lines (${actual})`);
  }

  // .aris layout files
  need(fs.existsSync(p.state), `missing state file: ${p.state}`);
  need(fs.existsSync(p.events), `missing event log: ${p.events}`);
  if (fs.existsSync(p.repo)) {
    const recorded = fs.readFileSync(p.repo, 'utf8').trim();
    need(path.resolve(recorded) === path.resolve(String(state.aris_home)), `repo file points to ${recorded}, state.aris_home is ${state.aris_home}`);
  } else {
    errors.push(`missing repo file: ${p.repo}`);
  }
  if (fs.existsSync(p.installedSkills)) {
    const first = fs.readFileSync(p.installedSkills, 'utf8').split(/\r?\n/)[0] || '';
    const fields = first.split('\t');
    const okFormat = fields[0] === 'repo_root' && fields.length >= 2 && fields[1].trim() !== '';
    need(okFormat, `installed-skills.txt line 1 must be "repo_root<TAB><ARIS_HOME>", got ${JSON.stringify(first)}`);
    if (okFormat && typeof state.aris_home === 'string') {
      need(path.resolve(fields[1].trim()) === path.resolve(state.aris_home), `installed-skills.txt repo_root (${fields[1].trim()}) differs from state.aris_home`);
    }
  } else {
    errors.push(`missing installed-skills.txt: ${p.installedSkills}`);
  }
  // A pending gate must have an issued command waiting for --record.
  if (gates && typeof gates === 'object' && !Array.isArray(gates)) {
    for (const [name, value] of Object.entries(gates)) {
      if (value && value.status === 'pending' && value.detail && typeof value.detail === 'object' && value.detail.cmd) {
        warn(fs.existsSync(gateCmdPath(project, name)), `pending gate ${name} is missing its issued command: ${gateCmdPath(project, name)}`);
      }
    }
  }

  return { errors, warnings };
}
