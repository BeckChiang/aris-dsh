#!/usr/bin/env node
/**
 * aris-status.mjs — ARIS 项目状态单屏仪表盘（零依赖，纯 Node 内置模块）
 *
 * 用法：
 *   node bin/aris-status.mjs [--project <dir>] [--json] [--watch] [--interval 2000]
 *
 * 数据来源（项目目录下的 .aris/）：
 *   state.json                   必读；缺失则提示先 init，退出码 1
 *   meta/events.jsonl            追加式事件日志，取最近 5 条
 *   reviews/*.json               审查记录，取最近 3 条
 *   audit-verifier-report.json   可选，外部审计结论
 *
 * 设计约束：
 *   - 不引入任何 npm 依赖
 *   - 输出全部为 ASCII 边框 + 中文文本，避免 Windows 旧控制台花屏
 *   - 颜色仅在 stdout 是 TTY 且未设 NO_COLOR 时启用
 *   - state.json 损坏 / 字段缺失一律降级为 "—"，不抛栈
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const VERSION = '1.0.0';
const WIDTH = 74;              // 单屏仪表盘宽度（显示列）
const DEFAULT_INTERVAL = 2000; // --watch 默认刷新间隔（ms）
const LIVE_WINDOW = 1800;      // 30 分钟；超过视为「陈旧」
const EVENTS_SHOW = 5;
const REVIEWS_SHOW = 3;
const EVENTS_TAIL_BYTES = 512 * 1024; // 事件日志只读尾部，避免大文件拖慢
const MAX_KIND = 14;
const MAX_MSG = 40;

const PHASE_LABEL = {
  literature: '文献调研',
  idea: '选题构思',
  experiment: '实验',
  writing: '写作',
  review: '审查',
  done: '完成',
};

const VERDICT_LABEL = {
  accept: '通过',
  revise: '修改',
  reject: '拒稿',
  unknown: '未知',
};

// ---------------------------------------------------------------------------
// 颜色（可选）
// ---------------------------------------------------------------------------

let colorOn = false;

function initColor() {
  const noColor = Object.prototype.hasOwnProperty.call(process.env, 'NO_COLOR');
  colorOn = Boolean(process.stdout.isTTY) && !noColor && process.env.TERM !== 'dumb';
}

const paint = {
  green: (s) => (colorOn ? `\x1b[32m${s}\x1b[0m` : String(s)),
  red: (s) => (colorOn ? `\x1b[31m${s}\x1b[0m` : String(s)),
  yellow: (s) => (colorOn ? `\x1b[33m${s}\x1b[0m` : String(s)),
  cyan: (s) => (colorOn ? `\x1b[36m${s}\x1b[0m` : String(s)),
  dim: (s) => (colorOn ? `\x1b[2m${s}\x1b[0m` : String(s)),
  bold: (s) => (colorOn ? `\x1b[1m${s}\x1b[0m` : String(s)),
};

// ---------------------------------------------------------------------------
// 显示宽度工具（CJK 占 2 列；ANSI 序列占 0 列）
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '');
}

function charWidth(cp) {
  if (cp === 0) return 0;
  if (
    cp < 32 ||
    (cp >= 0x7f && cp < 0xa0)
  ) {
    return 0;
  }
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 || cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function strWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0));
  return w;
}

function pad(s, width) {
  const text = String(s);
  const gap = width - strWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

function trunc(s, maxWidth) {
  const text = String(s);
  if (maxWidth <= 0) return '';
  if (strWidth(text) <= maxWidth) return text;
  if (maxWidth <= 3) return '.'.repeat(maxWidth);
  let out = '';
  let w = 0;
  const budget = maxWidth - 3;
  for (const ch of text) {
    const cw = charWidth(ch.codePointAt(0));
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return `${out}...`;
}

function oneLine(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, ' ')
    .replace(/[\t\f\v]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 事件日志有两种写法：bin/aris.mjs 写 kind/message，bin/aris-review.mjs 写 event/字段散装。
// 这里统一成一行摘要，避免出现「?」和空消息。
function eventNote(event) {
  const parts = [];
  if (event.slot !== undefined) parts.push(`slot${event.slot}`);
  if (event.tier) parts.push(String(event.tier));
  if (event.verdict) parts.push(String(event.verdict));
  if (event.score !== undefined && event.score !== null) parts.push(`${event.score}/10`);
  if (event.identity) parts.push(String(event.identity));
  if (event.backend) parts.push(`via ${event.backend}`);
  if (event.phase) parts.push(`phase=${event.phase}`);
  if (event.target) parts.push(String(event.target));
  return parts.join(' · ');
}

function text(s) {
  if (s === null || s === undefined) return '—';
  const t = oneLine(s);
  return t === '' ? '—' : t;
}

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = {
    project: null,
    json: false,
    watch: false,
    interval: DEFAULT_INTERVAL,
    intervalGiven: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project' || arg === '-p') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) throw new UsageError('--project 需要一个项目目录参数');
      opts.project = value;
    } else if (arg.startsWith('--project=')) {
      const value = arg.slice('--project='.length);
      if (!value) throw new UsageError('--project 需要一个项目目录参数');
      opts.project = value;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--watch' || arg === '-w') {
      opts.watch = true;
    } else if (arg === '--interval' || arg === '-i') {
      const value = argv[++i];
      opts.interval = Number(value);
      opts.intervalGiven = true;
    } else if (arg.startsWith('--interval=')) {
      opts.interval = Number(arg.slice('--interval='.length));
      opts.intervalGiven = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--version' || arg === '-V') {
      opts.version = true;
    } else {
      throw new UsageError(`未知参数：${arg}`);
    }
  }

  if (opts.intervalGiven && (!Number.isFinite(opts.interval) || opts.interval < 200)) {
    process.stderr.write(`[警告] --interval 需要 >= 200 的毫秒数，已回退为 ${DEFAULT_INTERVAL}ms\n`);
    opts.interval = DEFAULT_INTERVAL;
  }
  opts.interval = Math.round(opts.interval);
  return opts;
}

function usageText() {
  return [
    '用法：node bin/aris-status.mjs [选项]',
    '',
    '选项：',
    '  --project, -p <dir>   项目根目录（默认当前目录）',
    '  --json                一次性输出聚合 JSON',
    '  --watch, -w           循环刷新单屏仪表盘（Ctrl+C 退出）',
    '  --interval <ms>       刷新间隔，默认 2000，最小 200',
    '  --help, -h            显示本帮助',
    '  --version, -V         显示版本',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 文件定位与读取
// ---------------------------------------------------------------------------

function resolveTargets(projectArg) {
  const given = path.resolve(projectArg || process.cwd());
  let projectDir = given;
  const stateEnv = process.env.ARIS_STATE_DIR;
  let arisDir = stateEnv && stateEnv.trim() ? path.resolve(given, stateEnv.trim()) : path.join(given, '.aris');

  const isFile = (p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };

  if (!isFile(path.join(arisDir, 'state.json'))) {
    // 容错：允许直接传 .aris 目录本身
    if (path.basename(given) === '.aris' && isFile(path.join(given, 'state.json'))) {
      arisDir = given;
      projectDir = path.dirname(given);
    }
  }

  return {
    projectDir,
    arisDir,
    statePath: path.join(arisDir, 'state.json'),
  };
}

function readState(file) {
  let mtimeMs = null;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    /* ignore */
  }

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { state: null, error: `无法读取（${err.code || err.message}）`, mtimeMs };
  }

  if (!raw.trim()) {
    return { state: null, error: '文件为空', mtimeMs };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { state: null, error: `JSON 解析失败：${err.message}`, mtimeMs };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: null, error: '顶层不是对象', mtimeMs };
  }

  if (parsed.schema !== undefined && parsed.schema !== 1) {
    return {
      state: parsed,
      warning: `未知 schema=${parsed.schema}，按兼容模式展示`,
      mtimeMs,
    };
  }

  return { state: parsed, warning: null, error: null, mtimeMs };
}

/** 读 events.jsonl：只读末尾 512 KiB，逐行解析，坏行跳过并计数。 */
function readEvents(file) {
  const result = { events: [], total: 0, corrupt: 0, truncatedTail: false, exists: false };

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return result;
  }
  if (!stat.isFile()) return result;

  result.exists = true;
  const size = stat.size;
  const start = size > EVENTS_TAIL_BYTES ? size - EVENTS_TAIL_BYTES : 0;
  const length = size - start;

  let buf;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      buf = Buffer.alloc(length);
      let read = 0;
      while (read < length) {
        const n = fs.readSync(fd, buf, read, length - read, start + read);
        if (n <= 0) break;
        read += n;
      }
      if (read < length) buf = buf.subarray(0, read);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return result;
  }

  let body = buf.toString('utf8');
  if (start > 0) {
    result.truncatedTail = true;
    const nl = body.indexOf('\n');
    body = nl >= 0 ? body.slice(nl + 1) : '';
  }

  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    result.total += 1;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      result.corrupt += 1;
      continue;
    }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      result.events.push(obj);
    } else {
      result.corrupt += 1;
    }
  }

  return result;
}

function readReviews(dir) {
  const out = { reviews: [], exists: false, corrupt: 0 };
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  out.exists = true;

  for (const name of names) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const file = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let obj;
    try {
      obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      out.corrupt += 1;
      continue;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      out.corrupt += 1;
      continue;
    }

    const created = typeof obj.created_at === 'string' ? Date.parse(obj.created_at) : NaN;
    out.reviews.push({
      file: name,
      slot: obj.slot,
      tier: obj.tier,
      backend: obj.backend,
      model: obj.model,
      identity: obj.identity,
      verdict: obj.verdict,
      summary: obj.summary,
      created_at: obj.created_at,
      _sort: Number.isFinite(created) ? created : stat.mtimeMs,
    });
  }

  out.reviews.sort((a, b) => b._sort - a._sort || String(a.file).localeCompare(String(b.file)));
  return out;
}

function readAudit(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { exists: false };
  }
  if (!stat.isFile()) return { exists: false };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { exists: true, error: 'JSON 解析失败' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { exists: true, error: '顶层不是对象' };
  }

  return {
    exists: true,
    overall_assurance:
      parsed.overall_assurance ??
      parsed.overallAssurance ??
      parsed.assurance ??
      null,
    generated_at: parsed.generated_at ?? parsed.generatedAt ?? null,
    status: parsed.status ?? null,
  };
}

// ---------------------------------------------------------------------------
// 时间与格式化
// ---------------------------------------------------------------------------

function fmtAge(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

const pad2 = (n) => String(n).padStart(2, '0');

function parseDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  return Date.parse(value);
}

function fmtDay(value) {
  const ms = parseDate(value);
  if (!Number.isFinite(ms)) return value ? trunc(oneLine(value), 12) : '—';
  const d = new Date(ms);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtClock(value) {
  const ms = parseDate(value);
  if (!Number.isFinite(ms)) return value ? trunc(oneLine(value), 8) : '—';
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function fmtStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// 聚合
// ---------------------------------------------------------------------------

function displayPath(projectDir, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!path.isAbsolute(raw)) return raw.replace(/\\/g, '/');
  const rel = path.relative(projectDir, raw);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/');
  return raw.replace(/\\/g, '/');
}

function projectName(state, projectDir) {
  const raw = state && state.project;
  if (typeof raw === 'string' && raw.trim()) {
    const value = raw.trim().replace(/[\\/]+$/, '');
    if (/[\\/]/.test(value)) {
      const base = path.basename(value);
      if (base) return base;
    }
    return value;
  }
  return path.basename(projectDir) || projectDir;
}

function normVerdict(v) {
  const value = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(VERDICT_LABEL, value) ? value : 'unknown';
}

function buildSnapshot(target) {
  const now = Date.now();
  const stateInfo = readState(target.statePath);
  const state = stateInfo.state;
  const st = state || {};

  const eventsInfo = readEvents(path.join(target.arisDir, 'meta', 'events.jsonl'));
  const reviewsInfo = readReviews(path.join(target.arisDir, 'reviews'));
  const audit = readAudit(path.join(target.arisDir, 'audit-verifier-report.json'));

  const artifacts = st.artifacts && typeof st.artifacts === 'object' && !Array.isArray(st.artifacts)
    ? st.artifacts
    : {};

  const gatesRaw = st.gates && typeof st.gates === 'object' && !Array.isArray(st.gates) ? st.gates : {};
  const gates = Object.entries(gatesRaw).map(([name, value]) => {
    const g = value && typeof value === 'object' ? value : {};
    const status = typeof g.status === 'string' ? g.status.trim().toLowerCase() : 'pending';
    return {
      name,
      status,
      at: g.at ?? null,
      detail: g.detail ?? null,
    };
  });

  const updatedAt = typeof st.updated_at === 'string' ? st.updated_at : null;
  let freshness = null;
  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
  if (Number.isFinite(updatedMs)) {
    freshness = Math.max(0, Math.round((now - updatedMs) / 1000));
  } else if (stateInfo.mtimeMs) {
    freshness = Math.max(0, Math.round((now - stateInfo.mtimeMs) / 1000));
  }

  const experiments = Array.isArray(artifacts.experiments) ? artifacts.experiments : null;
  const stateReviews = Array.isArray(artifacts.reviews) ? artifacts.reviews : null;
  const reviewCount = stateReviews ? stateReviews.length : reviewsInfo.reviews.length;

  const recentEvents = eventsInfo.events.slice(-EVENTS_SHOW).reverse();

  return {
    target,
    generatedAt: now,
    state,
    stateInfo,
    eventsInfo,
    reviewsInfo,
    audit,
    artifacts,
    gates,
    updatedAt,
    freshness,
    project: projectName(state, target.projectDir),
    reviewCount,
    experiments,
    recentEvents,
    phase: typeof st.phase === 'string' && st.phase.trim() ? st.phase.trim() : null,
    round: st.round ?? null,
    effort: st.effort ?? null,
    assurance: st.assurance ?? null,
    next: st.next && typeof st.next === 'object' && !Array.isArray(st.next) ? st.next : null,
  };
}

// ---------------------------------------------------------------------------
// 人类可读渲染
// ---------------------------------------------------------------------------

function section(title) {
  const head = `-- ${title} `;
  const fill = '-'.repeat(Math.max(0, WIDTH - strWidth(head)));
  return paint.bold(head) + fill;
}

function metaLine(label, value, extra) {
  const head = `  ${pad(label, 9)}`;
  const tail = extra ? `  ${extra}` : '';
  return trunc(head + text(value) + tail, WIDTH);
}

function gateTag(status) {
  switch (status) {
    case 'pass':
      return { tag: '[PASS]', color: paint.green };
    case 'fail':
      return { tag: '[FAIL]', color: paint.red };
    case 'pending':
      return { tag: '[PEND]', color: paint.yellow };
    default:
      return { tag: '[ ?? ]', color: paint.dim };
  }
}

function verdictPaint(verdict) {
  switch (verdict) {
    case 'accept':
      return paint.green;
    case 'revise':
      return paint.yellow;
    case 'reject':
      return paint.red;
    default:
      return paint.dim;
  }
}

function renderDashboard(snap) {
  const {
    target, project, phase, round, effort, assurance, gates, artifacts,
    reviewsInfo, reviewCount, experiments, recentEvents, eventsInfo, audit,
    stateInfo, updatedAt, freshness, next, generatedAt,
  } = snap;

  const lines = [];
  const projectLabel = `${paint.bold('ARIS 状态面板')} · ${paint.cyan(trunc(project, WIDTH - 18))}`;
  lines.push(projectLabel);
  lines.push('='.repeat(WIDTH));

  if (stateInfo.error) {
    lines.push(metaLine('项目', project));
    lines.push(`  ${pad('状态', 9)}${paint.red('state.json 损坏')} ${paint.dim(trunc(stateInfo.error, WIDTH - 30))}`);
  } else {
    lines.push(metaLine('项目', project));
  }

  const phaseText = phase ? `${phase}${PHASE_LABEL[phase] ? ` / ${PHASE_LABEL[phase]}` : ''}` : '—';
  const roundText = round === null || round === undefined ? '—' : `轮次 ${round}`;
  lines.push(`  ${pad('阶段', 9)}${pad(text(phaseText), 26)}${roundText}`);

  const effortText = effort === null || effort === undefined ? '—' : text(effort);
  const assuranceText = assurance === null || assurance === undefined ? '—' : text(assurance);
  lines.push(metaLine('设置', `effort=${effortText} · assurance=${assuranceText}`));

  const freshLabel = freshness === null
    ? '—'
    : `${fmtAge(freshness)}${freshness > LIVE_WINDOW ? '（陈旧）' : freshness > 300 ? '（正常）' : '（新鲜）'}`;
  const freshColor = freshness === null ? paint.dim : freshness > LIVE_WINDOW ? paint.yellow : paint.green;
  const statePathLabel = path.join(path.basename(target.arisDir), 'state.json').replace(/\\/g, '/');
  lines.push(`  ${pad('状态文件', 9)}${statePathLabel} · ${freshColor(freshLabel)}`);
  if (updatedAt) lines.push(`  ${pad('更新时间', 9)}${paint.dim(text(updatedAt))}`);
  if (stateInfo.warning) lines.push(`  ${pad('注意', 9)}${paint.yellow(trunc(stateInfo.warning, WIDTH - 12))}`);

  // 门禁矩阵
  lines.push(section(`门禁 (${gates.length})`));
  if (!gates.length) {
    lines.push(`  ${paint.dim('—')} ${paint.dim('state.gates 未提供')}`);
  } else {
    for (const gate of gates) {
      const { tag, color } = gateTag(gate.status);
      const name = trunc(gate.name, 24);
      const at = gate.at ? fmtDay(gate.at) : '—';
      const detailWidth = WIDTH - (2 + 7 + 26 + 13);
      const detail = gate.detail ? paint.dim(trunc(oneLine(gate.detail), Math.max(4, detailWidth))) : '';
      lines.push(`  ${color(pad(tag, 7))}${pad(name, 26)}${pad(at, 13)}${detail}`);
    }
  }

  // 审查记录
  const shown = reviewsInfo.reviews.slice(0, REVIEWS_SHOW);
  const corruptNote = reviewsInfo.corrupt ? `，${reviewsInfo.corrupt} 个损坏` : '';
  lines.push(section(`审查 (最近 ${shown.length} / 共 ${reviewCount}${corruptNote})`));
  if (!shown.length) {
    lines.push(`  ${paint.dim('—')} ${paint.dim('暂无审查记录（.aris/reviews/ 为空）')}`);
  } else {
    shown.forEach((review, index) => {
      const slot = trunc(text(review.slot), 13);
      const model = trunc(text(review.model || review.backend), 17);
      const verdict = normVerdict(review.verdict);
      const label = `${verdict}/${VERDICT_LABEL[verdict]}`;
      const time = fmtDay(review.created_at);
      lines.push(
        `  ${index + 1}. ${pad(slot, 14)}${pad(model, 18)}${pad(verdictPaint(verdict)(pad(label, 13)), 14)}${time}`,
      );
    });
  }

  // 产物清单
  lines.push(section('产物'));
  const artifactRow = (label, status, extra) => {
    const tail = extra ? paint.dim(`  ${trunc(extra, WIDTH - 24)}`) : '';
    lines.push(`  ${pad(label, 10)}${pad(status, 7)}${tail}`);
  };

  const wikiPath = displayPath(target.projectDir, artifacts.wiki);
  artifactRow('知识库', artifacts.wiki ? '已生成' : '缺', wikiPath || '');
  const ideaPath = displayPath(target.projectDir, artifacts.idea);
  artifactRow('想法', artifacts.idea ? '已生成' : '缺', ideaPath || '');
  artifactRow('实验', experiments ? `${experiments.length} 项` : '—', '');
  const paperPath = displayPath(target.projectDir, artifacts.paper);
  artifactRow('论文', artifacts.paper ? '已生成' : '缺', paperPath || '');
  artifactRow('审查', reviewCount ? `${reviewCount} 份` : '缺', '');

  let auditStatus = '未运行';
  let auditExtra = '';
  if (audit.exists && audit.error) {
    auditStatus = '损坏';
    auditExtra = audit.error;
  } else if (audit.exists) {
    const verdict = audit.overall_assurance ?? audit.status ?? '已生成';
    auditStatus = trunc(text(verdict), 12);
    auditExtra = audit.generated_at ? fmtDay(audit.generated_at) : 'audit-verifier-report.json';
  }
  artifactRow('外部审计', auditStatus, auditExtra);

  // 下一步
  lines.push(section('下一步'));
  const nextSkill = next && next.skill ? text(next.skill) : '—';
  const nextReason = next && next.reason ? oneLine(next.reason) : '';
  lines.push(metaLine('建议', nextSkill));
  lines.push(metaLine('原因', nextReason ? trunc(nextReason, WIDTH - 12) : '—'));

  // 最近事件
  const evTitle = `最近事件 (${recentEvents.length}/${eventsInfo.total}${eventsInfo.truncatedTail ? '，只读尾部' : ''}${eventsInfo.corrupt ? `，${eventsInfo.corrupt} 行损坏` : ''})`;
  lines.push(section(evTitle));
  if (!recentEvents.length) {
    lines.push(`  ${paint.dim('—')} ${paint.dim('暂无事件（.aris/meta/events.jsonl 为空或不存在）')}`);
  } else {
    for (const event of recentEvents) {
      const kind = trunc(oneLine(event.kind ?? event.event ?? '?'), MAX_KIND);
      const msgWidth = WIDTH - (2 + 9 + 2 + MAX_KIND + 2);
      const message = trunc(oneLine(event.message ?? eventNote(event)), Math.max(6, msgWidth));
      lines.push(`  ${paint.dim(pad(fmtClock(event.ts), 8))}  ${pad(kind, MAX_KIND)}  ${message}`);
    }
  }

  lines.push('-'.repeat(WIDTH));
  lines.push(
    paint.dim(`  aris-status v${VERSION} · ${fmtStamp(generatedAt)}`),
  );

  return `${lines.map((line) => line.replace(/[ \t]+$/, '')).join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// --json
// ---------------------------------------------------------------------------

function buildJson(snap) {
  const {
    target, project, phase, round, effort, assurance, gates, artifacts,
    reviewsInfo, reviewCount, experiments, recentEvents, eventsInfo, audit,
    stateInfo, updatedAt, freshness, next,
  } = snap;

  const reviewSummary = {
    total: reviewCount,
    loaded: reviewsInfo.reviews.length,
    corrupt: reviewsInfo.corrupt,
    counts: { accept: 0, revise: 0, reject: 0, unknown: 0 },
    recent: reviewsInfo.reviews.slice(0, REVIEWS_SHOW).map((review) => {
      const verdict = normVerdict(review.verdict);
      return {
        file: review.file,
        slot: review.slot ?? null,
        tier: review.tier ?? null,
        backend: review.backend ?? null,
        model: review.model ?? null,
        identity: review.identity ?? null,
        verdict,
        summary: review.summary ?? null,
        created_at: review.created_at ?? null,
      };
    }),
  };
  for (const review of reviewsInfo.reviews) {
    reviewSummary.counts[normVerdict(review.verdict)] += 1;
  }

  return {
    schema: 1,
    generated_at: new Date(snap.generatedAt).toISOString(),
    project_dir: target.projectDir,
    state_file: path.relative(target.projectDir, target.statePath).replace(/\\/g, '/') || target.statePath,
    state: snap.state,
    state_error: stateInfo.error ?? null,
    state_warning: stateInfo.warning ?? null,
    summary: {
      project,
      phase,
      round,
      effort,
      assurance,
      updated_at: updatedAt,
      freshness_seconds: freshness,
      freshness: freshness === null ? 'unknown' : freshness > LIVE_WINDOW ? 'stale' : 'live',
      gates,
      next,
      artifacts: {
        wiki: artifacts.wiki ?? null,
        idea: artifacts.idea ?? null,
        experiments: experiments ? experiments.length : null,
        paper: artifacts.paper ?? null,
        reviews: reviewCount,
      },
      events_total: eventsInfo.total,
      events_corrupt: eventsInfo.corrupt,
    },
    reviews: reviewSummary,
    recent_events: recentEvents.map((event) => ({
      ts: event.ts ?? null,
      kind: event.kind ?? null,
      message: event.message ?? null,
    })),
    audit: audit.exists
      ? {
        present: true,
        error: audit.error ?? null,
        overall_assurance: audit.overall_assurance ?? null,
        status: audit.status ?? null,
        generated_at: audit.generated_at ?? null,
      }
      : { present: false },
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function missingStateMessage(target) {
  const arisRel = path.relative(process.cwd(), path.join(target.projectDir, '.aris')) || '.aris';
  return [
    `未找到 ${path.join(arisRel, 'state.json')}（项目目录：${target.projectDir}）`,
    '这个项目还没有初始化 ARIS 状态，先运行：',
    '  node bin/aris.mjs init',
    '（项目不在当前目录时，用 --project <项目根目录> 指定）',
    '',
  ].join('\n');
}

function startWatch(target, interval) {
  let timer = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    process.stdout.write('\n');
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const tick = () => {
    if (stopped) return;
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[H\x1b[2J');
    } else {
      process.stdout.write('\n');
    }
    try {
      process.stdout.write(renderDashboard(buildSnapshot(target)));
    } catch (err) {
      process.stdout.write(`渲染失败：${err && err.message ? err.message : err}\n`);
    }
    timer = setTimeout(tick, interval);
  };

  tick();
}

function main() {
  initColor();

  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n\n${usageText()}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (opts.help) {
    process.stdout.write(`${usageText()}\n`);
    return;
  }
  if (opts.version) {
    process.stdout.write(`aris-status ${VERSION}\n`);
    return;
  }
  if (opts.json && opts.watch) {
    process.stderr.write('不能同时使用 --json 与 --watch（--json 是一次性输出）\n');
    process.exitCode = 2;
    return;
  }

  const target = resolveTargets(opts.project);

  let stateExists = false;
  try {
    stateExists = fs.statSync(target.statePath).isFile();
  } catch {
    stateExists = false;
  }

  if (!stateExists) {
    process.stderr.write(missingStateMessage(target));
    process.exitCode = 1;
    return;
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(buildJson(buildSnapshot(target)), null, 2)}\n`);
    return;
  }

  if (opts.watch) {
    startWatch(target, opts.interval);
    return;
  }

  process.stdout.write(renderDashboard(buildSnapshot(target)));
}

try {
  main();
} catch (err) {
  process.stderr.write(`aris-status 运行失败：${err && err.message ? err.message : err}\n`);
  if (process.env.DEBUG) process.stderr.write(`${err && err.stack ? err.stack : ''}\n`);
  process.exitCode = 1;
}
