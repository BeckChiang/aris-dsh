#!/usr/bin/env node
// ARIS on DSH — runtime core.
//
// Deterministic state machine over <project>/.aris: init / status / set-phase /
// advance / gate (two-stage, never spawns a process) / next / log / check.
// Pure Node built-ins; no npm dependencies.
import fs from 'node:fs';
import path from 'node:path';
import * as S from './lib/aris-state.mjs';

const HELP = `ARIS 运行时核心（bin/aris.mjs）

用法:
  node bin/aris.mjs <命令> [选项]

命令:
  init [--project <dir>] [--effort low|medium|high] [--assurance standard|strict] [--force]
        在项目目录建 .aris/：state.json、repo、installed-skills.txt、meta/events.jsonl、gates/
        （--effort 也接受上游 lite/balanced/max/beast，--assurance 接受 draft/.../submission）
  status [--json]            中文单屏摘要（--json 输出机器可读的 state 原文）
  set-phase <phase>          设置阶段：literature|idea|experiment|writing|review|done
  advance                    按固定阶段顺序推进一格并轮次 +1（门禁 fail 或「已发命令未记录」时拒绝，
                             确需越过用 --force）
  set-artifact <字段> <路径|-> 记录产物路径：wiki|idea|paper 设单个（- 清空），experiments 追加；
                            相对路径按项目解析，绝对路径原样保存
  gate <name> [--json-args '<json>']
        生成门禁命令写入 .aris/gates/<name>.cmd，并打印可执行的单行命令（不启动子进程）
  gate <name> --record <exitcode> [--out <file>]
        回填上一次命令的退出码与输出摘要，写入 gates 字段与事件日志
  next [--json]              按 phase + 门禁 + 产物给出下一步技能及依据
  log <kind> <message...>    追加一条事件
  check [--json]             校验 state.json 结构与磁盘产物

全局选项:
  --project <dir>   项目目录（默认当前目录）
  --state-dir <dir>  状态目录（默认 <project>/.aris；等价于环境变量 ARIS_STATE_DIR）
                    项目放在同步盘/Kimi 工作区时用它把状态留在 DSH 工作区，避免每次写入都要审批
  --json            机器可读输出（不含中文文案）
  --help, -h        帮助

典型流程:
  node bin/aris.mjs init --project ./my-paper
  node bin/aris.mjs gate evidence_check --json-args '{"value":"73.2","source":"results/eval.json"}'
  # 用 ops_bash 执行打印出的命令，拿到退出码后：
  node bin/aris.mjs gate evidence_check --record 0
`;

const GATE_ALIASES = {
  idea: 'idea_discovery',
  idea_discovery_gate: 'idea_discovery',
  evidence: 'evidence_check',
  forensic: 'forensics',
  forensics_gate: 'forensics',
};

const GATE_SPECS = {
  idea_discovery: {
    script: 'idea_discovery_gate.py',
    positionals: ['root', 'run_id'],
    defaults: { root: '@project' },
    required: ['run_id'],
  },
  evidence_check: {
    script: 'evidence_check.py',
    positionals: ['root'],
    defaults: { root: '@project' },
    required: [],
  },
  forensics: {
    script: 'forensics_gate.py',
    positionals: [],
    defaults: {},
    required: [],
    subcommand: true,
  },
};

const BOOL_FLAGS = new Set(['json', 'force', 'help']);

function fail(message, exitCode = 2) {
  const err = new Error(message);
  err.exitCode = exitCode;
  throw err;
}

function parseArgs(argv) {
  const out = { _: [], flags: {}, values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a === '-h' || a === '--help') {
      out.flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        out.values[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (BOOL_FLAGS.has(body)) {
        out.flags[body] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.flags[body] = true;
      } else {
        out.values[body] = next;
        i += 1;
      }
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      out.flags[a.slice(1)] = true;
      continue;
    }
    out._.push(a);
  }
  return out;
}

function projectOf(opts, { mustExist = true } = {}) {
  const project = S.resolveProject(opts.values.project);
  if (mustExist && !S.isDir(project)) fail(`项目目录不存在: ${project}`);
  return project;
}

function statusLabel(status) {
  return { pending: '待执行', pass: '通过', fail: '不通过' }[status] || status;
}

function shellQuote(value) {
  return `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`;
}

function resolveGateName(raw) {
  if (!raw) return null;
  const key = String(raw).trim().replace(/-/g, '_');
  if (GATE_ALIASES[key]) return GATE_ALIASES[key];
  if (GATE_SPECS[key]) return key;
  const bare = key.replace(/\.py$/, '');
  if (GATE_SPECS[bare]) return bare;
  return bare;
}

function gateSpec(name) {
  return GATE_SPECS[name] || { script: `${name}.py`, positionals: [], defaults: {}, required: [] };
}

function readJsonArgInput(project, text) {
  let raw = String(text).trim();
  if (raw.startsWith('@')) {
    const file = path.resolve(project, raw.slice(1));
    if (!fs.existsSync(file)) fail(`--json-args 指向的文件不存在: ${file}`);
    raw = fs.readFileSync(file, 'utf8');
  } else if (!raw.startsWith('{') && !raw.startsWith('[')) {
    const file = path.resolve(project, raw);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) raw = fs.readFileSync(file, 'utf8');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`--json-args 不是合法 JSON: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('--json-args 必须是 JSON 对象');
  }
  return parsed;
}

// Build the exact Git-Bash command for a gate. Never executed here: the agent
// runs it through ops_bash because this sandbox forbids child processes.
function buildGateCommand(project, arisHome, name, obj) {
  const spec = gateSpec(name);
  const script = path.join(arisHome, 'tools', spec.script);
  if (!fs.existsSync(script)) {
    const available = fs
      .readdirSync(path.join(arisHome, 'tools'))
      .filter((f) => f.endsWith('_gate.py') || f === 'evidence_check.py' || f === 'forensics_gate.py')
      .sort();
    fail(`找不到门禁脚本 ${script}\n可用门禁脚本: ${available.join(', ')}`);
  }

  const consumed = new Set(['args', 'cmd', 'subcommand']);
  const argv = [];

  if (Array.isArray(obj.args)) {
    argv.push(...obj.args.map(String));
    for (const key of spec.positionals) consumed.add(key);
  } else {
    if (spec.subcommand) {
      const sub = obj.cmd || obj.subcommand;
      if (!sub) fail(`门禁 ${name} 需要 "cmd"（gate|update|evaluate|resolve|waive|fresh）或 "args" 数组`);
      argv.push(String(sub));
      consumed.add('cmd');
      consumed.add('subcommand');
    }
    for (const key of spec.positionals) {
      let value = Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : spec.defaults[key];
      if (value === '@project') value = project;
      if (value === undefined || value === null) {
        if ((spec.required || []).includes(key)) fail(`门禁 ${name} 缺少参数 "${key}"（写进 --json-args）`);
        continue;
      }
      let text = String(value);
      if (key === 'root') text = S.toPosix(path.resolve(project, text));
      argv.push(text);
      consumed.add(key);
    }
  }

  for (const [rawKey, rawVal] of Object.entries(obj)) {
    const key = rawKey.replace(/^--/, '');
    if (consumed.has(key)) continue;
    if (rawVal === true) {
      argv.push(`--${key}`);
    } else if (rawVal === false || rawVal === null) {
      continue;
    } else if (Array.isArray(rawVal)) {
      for (const item of rawVal) argv.push(`--${key}`, String(item));
    } else {
      argv.push(`--${key}`, String(rawVal));
    }
  }

  const out = S.gateOutPath(project, name);
  const parts = [
    'cd', shellQuote(S.toPosix(project)), '&&',
    `ARIS_HOME=${shellQuote(S.toPosix(arisHome))}`,
    'python', shellQuote(S.toPosix(script)),
    ...argv.map(shellQuote),
    '>', shellQuote(S.toPosix(out)), '2>&1',
  ];
  return { cmd: parts.join(' '), script, out, argv };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

// ---------------------------------------------------------------- commands

function cmdInit(opts) {
  const project = projectOf(opts, { mustExist: false });
  const arisHome = S.findArisHome();
  if (!arisHome) {
    fail('找不到 ARIS_HOME：期望 <工作区>/.dsh/skills/aris（可用环境变量 ARIS_HOME 覆盖）');
  }
  const effort = S.normalizeEffort(opts.values.effort);
  if (!effort) fail(`--effort 只能是 ${S.EFFORTS.join('|')}（也接受 lite/balanced/max/beast）`);
  const assurance = S.normalizeAssurance(opts.values.assurance);
  if (!assurance) fail(`--assurance 只能是 ${S.ASSURANCES.join('|')}（也接受 draft/polished/conference-ready/submission）`);

  fs.mkdirSync(project, { recursive: true });
  const p = S.arisPaths(project);
  if (fs.existsSync(p.state) && !opts.flags.force) {
    fail(`已存在 ${p.state}；如需重建请加 --force`);
  }
  fs.mkdirSync(p.meta, { recursive: true });
  fs.mkdirSync(p.gates, { recursive: true });
  fs.writeFileSync(p.events, '');
  fs.writeFileSync(p.repo, `${arisHome}\n`, 'utf8');
  // Upstream helpers resolve $ARIS_HOME from this file: "repo_root<TAB><path>".
  fs.writeFileSync(p.installedSkills, `repo_root\t${arisHome}\n`, 'utf8');

  const state = S.emptyState(project, arisHome, { effort, assurance });
  const ev = S.appendEvent(project, state, {
    kind: 'init',
    message: 'ARIS project initialized',
    data: { effort, assurance, aris_home: arisHome },
  });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);

  const next = S.computeNext(state);
  const out = [];
  out.push('已初始化 ARIS 项目');
  out.push(`  项目    ${project}`);
  out.push(`  ARIS    ${arisHome}`);
  out.push(`  状态    ${p.state}`);
  out.push(`  门禁    ${p.gates}\\<name>.cmd（不做目录联接，tools_dir 记录在 state.json）`);
  out.push(`  模式    effort=${effort} · assurance=${assurance} · 阶段=${state.phase} · 轮次=${state.round}`);
  out.push(`  下一步  ${next.skill ? `/${next.skill}` : '（无）'}`);
  out.push('');
  out.push(`export ARIS_HOME=${S.toPosix(arisHome)}`);
  if (opts.flags.json) {
    printJson({ ok: true, project, aris_home: arisHome, state: p.state, effort, assurance, next: { skill: next.skill, reason: next.reason } });
    return 0;
  }
  process.stdout.write(`${out.join('\n')}\n`);
  return 0;
}

function cmdStatus(opts) {
  const project = projectOf(opts);
  const state = S.readState(project);
  if (opts.flags.json) {
    printJson(state);
    return 0;
  }
  const next = S.computeNext(state);
  const art = state.artifacts;
  const exists = (rel) => (rel ? S.artifactExists(state, rel) : false);
  const lines = [];
  lines.push('ARIS 项目状态');
  lines.push(`  项目  ${state.project}`);
  lines.push(`  ARIS  ${state.aris_home}`);
  lines.push(`  阶段  ${S.PHASE_LABELS[state.phase] || state.phase} (${state.phase}) · 轮次 ${state.round}`);
  lines.push(`  模式  effort=${state.effort} · assurance=${state.assurance}`);
  lines.push(`  更新  ${state.updated_at}`);
  lines.push('产物');
  const artLine = (label, rel) => {
    if (!rel) return `  ${label}  未设置`;
    return `  ${label}  ${rel}${exists(rel) ? '' : '（缺失）'}`;
  };
  lines.push(artLine('wiki', art.wiki));
  lines.push(artLine('idea', art.idea));
  lines.push(`  实验  ${Array.isArray(art.experiments) ? `${art.experiments.length} 项` : '格式异常'}`);
  lines.push(artLine('论文', art.paper));
  lines.push(`  审查  ${Array.isArray(art.reviews) ? `${art.reviews.length} 份` : '格式异常'}`);
  lines.push('门禁');
  const names = [...new Set([...S.GATE_NAMES, ...Object.keys(state.gates || {})])];
  for (const name of names) {
    const gate = state.gates?.[name] || { status: 'pending' };
    const extra = gate.detail && typeof gate.detail === 'object' && Number.isInteger(gate.detail.exit_code)
      ? ` (exit ${gate.detail.exit_code})`
      : (gate.status === 'pending' && gate.detail && gate.detail.cmd ? '（命令已生成）' : '');
    lines.push(`  ${name.padEnd(16)}${statusLabel(gate.status)}${extra}`);
  }
  const events = S.readEvents(project);
  const last = events[events.length - 1];
  lines.push(`下一步  ${next.skill ? `/${next.skill}` : '（无）'}`);
  lines.push(`依据    ${next.reasonZh}`);
  lines.push(`事件    ${state.events_count} 条${last && last.ts ? ` · 最近 #${last.seq} ${last.kind} ${String(last.ts).slice(11, 16)}` : ''}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

function cmdSetPhase(opts) {
  const project = projectOf(opts);
  const phase = opts._[1];
  if (!phase) fail(`用法: node bin/aris.mjs set-phase <${S.PHASES.join('|')}>`);
  if (!S.PHASES.includes(phase)) fail(`未知阶段 ${phase}；允许: ${S.PHASES.join('|')}`);
  const state = S.readState(project);
  const from = state.phase;
  state.phase = phase;
  const ev = S.appendEvent(project, state, { kind: 'set_phase', message: `phase ${from} -> ${phase}`, data: { from, to: phase } });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);
  const next = S.computeNext(state);
  if (opts.flags.json) {
    printJson({ ok: true, from, phase, round: state.round, next: { skill: next.skill, reason: next.reason } });
    return 0;
  }
  process.stdout.write(`阶段已从 ${from} 改为 ${phase}\n下一步: ${next.skill ? `/${next.skill}` : '（无）'}\n依据: ${next.reasonZh}\n`);
  return 0;
}

function cmdSetArtifact(opts) {
  const project = projectOf(opts);
  const field = opts._[1];
  const raw = opts._[2];
  const SINGLE = ['wiki', 'idea', 'paper'];
  const LIST = ['experiments'];
  if (!field) fail(`用法: node bin/aris.mjs set-artifact <${[...SINGLE, ...LIST].join('|')}> <路径|->（- 表示清空）`);
  const known = [...SINGLE, ...LIST];
  if (!known.includes(field)) fail(`未知产物字段 ${field}；允许: ${known.join('|')}`);
  const state = S.readState(project);
  state.artifacts = state.artifacts && typeof state.artifacts === 'object' ? state.artifacts : {};
  const clear = raw === undefined || raw === '-' || raw === '';
  let stored = null;

  if (SINGLE.includes(field)) {
    if (clear) {
      state.artifacts[field] = null;
    } else {
      const abs = path.resolve(project, raw);
      if (!fs.existsSync(abs)) fail(`产物不存在: ${abs}\n  先产出文件，或传绝对路径指向已有文件；要清空用 -`);
      stored = S.toPosix(raw);
      state.artifacts[field] = stored;
    }
  } else {
    if (!Array.isArray(state.artifacts.experiments)) state.artifacts.experiments = [];
    if (clear) {
      state.artifacts.experiments = [];
    } else {
      const abs = path.resolve(project, raw);
      if (!fs.existsSync(abs)) fail(`产物不存在: ${abs}\n  先产出文件，或传绝对路径指向已有文件；要清空用 -`);
      stored = S.toPosix(raw);
      if (!state.artifacts.experiments.includes(stored)) state.artifacts.experiments.push(stored);
    }
  }

  const ev = S.appendEvent(project, state, {
    kind: 'set_artifact',
    message: clear ? `artifact ${field} cleared` : `artifact ${field} = ${stored}`,
    data: { field, path: clear ? null : stored },
  });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);
  const next = S.computeNext(state);

  if (opts.flags.json) {
    printJson({
      ok: true, field, path: clear ? null : stored,
      artifacts: state.artifacts, next: { skill: next.skill, reason: next.reason },
    });
    return 0;
  }
  const shown = LIST.includes(field)
    ? (state.artifacts.experiments.length ? state.artifacts.experiments.join('\n          ') : '（空）')
    : (state.artifacts[field] || '（空）');
  process.stdout.write(`产物 ${field}: ${shown}\n下一步: ${next.skill ? `/${next.skill}` : '（无）'}\n依据: ${next.reasonZh}\n`);
  return 0;
}

function cmdAdvance(opts) {
  const project = projectOf(opts);
  const state = S.readState(project);
  const idx = S.PHASES.indexOf(state.phase);
  if (state.phase === 'done' || idx === S.PHASES.length - 1) {
    process.stdout.write('已是最后阶段 done，没有可推进的阶段\n');
    return 0;
  }
  const from = state.phase;
  const to = S.PHASES[idx + 1];
  // 2026-11-07: 门禁未过不得推进（面板「推进阶段」只在一门全 PASS 时可用，CLI 侧此前漏了这道闸）。
  // 判据：fail 一律拦；pending 但已发过命令（detail.cmd 在）也拦——说明两段式只走完了第一段。
  const blocking = S.GATE_NAMES.filter((n) => {
    const g = state.gates?.[n] || {};
    if (g.status === 'fail') return true;
    return g.status === 'pending' && g.detail && typeof g.detail === 'object' && g.detail.cmd;
  });
  if (blocking.length && !opts.flags.force) {
    const lines = blocking.map((n) => `  - ${n}: ${S.gateStatus(state, n)}${state.gates?.[n]?.at ? `（${state.gates[n].at}）` : ''}`).join('\n');
    fail(`门禁未通过，拒绝推进 ${from} -> ${to}：\n${lines}\n先跑 gate / 记录结论；确需越过请加 --force（会写进事件账本）`, 3);
  }
  state.phase = to;
  state.round += 1;
  const forced = blocking.length ? `（--force 越过 ${blocking.join(', ')}）` : '';
  const ev = S.appendEvent(project, state, { kind: 'advance', message: `phase ${from} -> ${to}${forced}`, data: { from, to, round: state.round, forced: blocking } });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);
  const next = S.computeNext(state);
  if (opts.flags.json) {
    printJson({ ok: true, from, phase: to, round: state.round, next: { skill: next.skill, reason: next.reason } });
    return 0;
  }
  process.stdout.write(`阶段已推进 ${from} -> ${to}（轮次 ${state.round}）\n下一步: ${next.skill ? `/${next.skill}` : '（无）'}\n依据: ${next.reasonZh}\n`);
  return 0;
}

function cmdGate(opts) {
  const project = projectOf(opts);
  const name = resolveGateName(opts._[1]);
  if (!name) fail("用法: node bin/aris.mjs gate <name> [--json-args '<json>'] | gate <name> --record <exitcode> [--out <file>]");

  if (opts.values.record !== undefined) {
    return recordGate(opts, project, name);
  }

  const state = S.readState(project);
  const arisHome = state.aris_home || S.findArisHome();
  if (!arisHome) fail('state.aris_home 为空且找不到 ARIS_HOME');
  const obj = opts.values['json-args'] !== undefined ? readJsonArgInput(project, opts.values['json-args']) : {};
  const built = buildGateCommand(project, arisHome, name, obj);

  fs.mkdirSync(S.arisPaths(project).gates, { recursive: true });
  fs.writeFileSync(S.gateCmdPath(project, name), `${built.cmd}\n`, 'utf8');
  state.gates = state.gates || {};
  state.gates[name] = {
    status: 'pending',
    at: null,
    detail: { cmd: built.cmd, script: built.script, issued_at: S.iso(), out: built.out },
  };
  const ev = S.appendEvent(project, state, {
    kind: 'gate_issue',
    message: `issued gate ${name}`,
    data: { gate: name, script: built.script, cmd: built.cmd },
  });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);

  if (opts.flags.json) {
    printJson({ ok: true, gate: name, status: 'pending', cmd: built.cmd, out: built.out, script: built.script });
    return 0;
  }
  process.stdout.write([
    `门禁 ${name}: 已生成待执行命令（state=pending）`,
    '命令（用 ops_bash 执行这一行）:',
    built.cmd,
    '',
    '执行后回填退出码:',
    `  node bin/aris.mjs gate ${name} --record <exitcode>`,
    `输出文件: ${built.out}`,
    '',
  ].join('\n'));
  return 0;
}

function recordGate(opts, project, name) {
  const rawCode = String(opts.values.record).trim();
  const code = Number(rawCode);
  if (!Number.isInteger(code)) fail(`--record 需要整数退出码，收到 ${JSON.stringify(rawCode)}`);

  const state = S.readState(project);
  const cmdFile = S.gateCmdPath(project, name);
  if (!fs.existsSync(cmdFile)) {
    fail(`没有找到 ${cmdFile}；先运行: node bin/aris.mjs gate ${name}`);
  }
  const cmd = fs.readFileSync(cmdFile, 'utf8').trim();
  const outPath = opts.values.out ? path.resolve(project, opts.values.out) : S.gateOutPath(project, name);

  let snippet = null;
  const notes = [];
  if (fs.existsSync(outPath)) {
    const text = fs.readFileSync(outPath, 'utf8');
    snippet = text.length > 2000 ? text.slice(-2000) : text;
  } else {
    notes.push(`输出文件不存在，仅记录退出码: ${outPath}`);
  }

  const status = code === 0 ? 'pass' : 'fail';
  state.gates = state.gates || {};
  state.gates[name] = {
    status,
    at: S.iso(),
    detail: { cmd, script: gateSpec(name).script, exit_code: code, out: outPath, snippet },
  };
  const ev = S.appendEvent(project, state, {
    kind: 'gate_result',
    message: `${name} ${status} (exit ${code})`,
    data: { gate: name, exit_code: code, status, out: outPath, snippet },
  });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);

  const exitCode = code === 0 ? 0 : (code > 0 && code < 126 ? code : 1);
  if (opts.flags.json) {
    printJson({ ok: code === 0, gate: name, status, exit_code: code, out: outPath, snippet, notes });
    return exitCode;
  }
  const lines = [
    `门禁 ${name}: ${statusLabel(status)} (exit ${code})`,
    `输出: ${outPath}`,
  ];
  if (snippet) {
    const tail = snippet.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-12);
    lines.push('摘要（末尾）:');
    for (const line of tail) lines.push(`  ${line}`);
  }
  for (const note of notes) lines.push(`注意: ${note}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return exitCode;
}

function cmdNext(opts) {
  const project = projectOf(opts);
  const state = S.readState(project);
  const next = S.computeNext(state);
  if (opts.flags.json) {
    printJson({ skill: next.skill, reason: next.reason });
    return 0;
  }
  process.stdout.write(`下一步: ${next.skill ? `/${next.skill}` : '（无）'}\n依据: ${next.reasonZh}\n`);
  return 0;
}

function cmdLog(opts) {
  const project = projectOf(opts);
  const kind = opts._[1];
  const message = opts._.slice(2).join(' ');
  if (!kind) fail('用法: node bin/aris.mjs log <kind> <message...>');
  if (!message) fail('缺少事件消息: node bin/aris.mjs log <kind> <message...>');
  const state = S.readState(project);
  const ev = S.appendEvent(project, state, { kind, message });
  state.events_count = ev.seq;
  S.refreshNext(state);
  S.writeState(project, state);
  if (opts.flags.json) {
    printJson({ ok: true, seq: ev.seq, kind, message, phase: ev.phase, round: ev.round });
    return 0;
  }
  process.stdout.write(`已记录事件 #${ev.seq} [${kind}] ${message}\n`);
  return 0;
}

function cmdCheck(opts) {
  const project = projectOf(opts);
  let state;
  try {
    state = S.readState(project);
  } catch (err) {
    if (opts.flags.json) {
      printJson({ ok: false, errors: [err.message], warnings: [] });
    } else {
      process.stderr.write(`状态校验失败: ${err.message}\n`);
    }
    return 1;
  }
  const { errors, warnings } = S.validateState(project, state);
  const ok = errors.length === 0;
  if (opts.flags.json) {
    printJson({ ok, errors, warnings });
    return ok ? 0 : 1;
  }
  const lines = [`状态校验: ${ok ? '通过' : '失败'}（${errors.length} 错误 / ${warnings.length} 警告）`];
  if (errors.length) {
    lines.push('错误');
    for (const e of errors) lines.push(`  - ${e}`);
  }
  if (warnings.length) {
    lines.push('警告');
    for (const w of warnings) lines.push(`  - ${w}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
  return ok ? 0 : 1;
}

function run(argv) {
  const opts = parseArgs(argv);
  if (opts.values['state-dir']) process.env.ARIS_STATE_DIR = String(opts.values['state-dir']);
  else if (opts.flags['state-dir'] && opts.flags['state-dir'] !== true) process.env.ARIS_STATE_DIR = String(opts.flags['state-dir']);
  const command = opts._[0];
  if (!command || command === 'help' || opts.flags.help) {
    if (opts.flags.help && command && command !== 'help') {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  switch (command) {
    case 'init': return cmdInit(opts);
    case 'status': return cmdStatus(opts);
    case 'set-phase': return cmdSetPhase(opts);
    case 'advance': return cmdAdvance(opts);
    case 'set-artifact': return cmdSetArtifact(opts);
    case 'gate': return cmdGate(opts);
    case 'next': return cmdNext(opts);
    case 'log': return cmdLog(opts);
    case 'check': return cmdCheck(opts);
    default:
      fail(`未知命令 ${command}；用 --help 查看用法`, 2);
  }
  return 0;
}

try {
  const code = run(process.argv.slice(2));
  if (typeof code === 'number' && code !== 0) process.exitCode = code;
} catch (err) {
  const code = Number.isInteger(err.exitCode) ? err.exitCode : 1;
  process.stderr.write(`错误: ${err.message}\n`);
  process.exitCode = code;
}
