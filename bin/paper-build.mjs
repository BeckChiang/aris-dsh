#!/usr/bin/env node
// paper-build.mjs — 论文编译（latexmk 优先，pdflatex/xelatex 兜底），供 DSH-ARIS 面板的「产物」页调用。
// 只做编译与日志解析：不改 .tex、不拉依赖、不联网。
//
//   node bin/paper-build.mjs --project <根> [--dir paper2/en] [--out build] [--engine auto|xelatex|pdflatex]
//                            [--clean] [--json] [--timeout 240]
//
// 退出码：0 编译成功；1 编译失败或有错误；2 参数/环境问题（找不到目录、没有主文件、没有 TeX 引擎）。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name, dflt = '') => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const flag = (name) => argv.includes(`--${name}`);

const project = path.resolve(String(opt('project', '')));
const jsonOut = flag('json');
const wantClean = flag('clean');
const timeoutMs = Math.max(10, Number(opt('timeout', '240')) || 240) * 1000;

const out = (obj) => {
  if (jsonOut) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  else {
    const lines = [
      `${obj.ok ? '✓' : '✗'} ${obj.ok ? '编译通过' : '编译失败'}  ${obj.engine || '?'}  ${obj.ms}ms`,
      obj.main ? `主文件：${path.relative(obj.project, obj.main)}` : '',
      obj.pdf ? `PDF：${path.relative(obj.project, obj.pdf)}${obj.pages ? `（${obj.pages} 页）` : ''}` : '',
      obj.errors && obj.errors.length ? `错误 ${obj.errors.length}：` : '',
      ...(obj.errors || []).slice(0, 8).map((e) => `  · ${e.msg}`),
      obj.warnings ? `警告：未定义引用 ${obj.warnings.undefinedRefs}、Overfull ${obj.warnings.overfull}、LaTeX Warning ${obj.warnings.latexWarn}` : '',
    ].filter(Boolean);
    process.stdout.write(lines.join('\n') + '\n');
  }
};

const die = (msg, code = 2) => {
  out({ ok: false, error: msg, ms: 0 });
  process.exit(code);
};

if (!project || !fs.existsSync(project)) die(`项目目录不存在：${project || '(空)'}`);

// ---- 找 TeX 引擎：PATH 里可能有 .exe，也可能只有 .bat/.cmd ----
const findExe = (name) => {
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const exts of [[], ['.exe'], ['.cmd'], ['.bat']]) {
    for (const d of dirs) {
      for (const ext of exts) {
        const p = path.join(d, name + ext);
        try {
          if (fs.statSync(p).isFile()) return p;
        } catch {}
      }
    }
  }
  return '';
};

// ---- 选目录与主文件 ----
const mainDirCandidates = [];
if (opt('dir')) mainDirCandidates.push(String(opt('dir')));
mainDirCandidates.push('paper2/en', 'paper2/cn', 'paper', 'paper2', '.');

const findMain = (dir) => {
  const abs = path.isAbsolute(dir) ? dir : path.join(project, dir);
  if (!fs.existsSync(abs)) return null;
  const main = path.join(abs, 'main.tex');
  if (fs.existsSync(main)) return { dir: abs, main };
  let names = [];
  try {
    names = fs.readdirSync(abs).filter((n) => n.toLowerCase().endsWith('.tex'));
  } catch {}
  names.sort();
  for (const n of names) {
    const p = path.join(abs, n);
    try {
      const head = fs.readFileSync(p, 'utf8');
      if (/\\documentclass/.test(head)) return { dir: abs, main: p };
    } catch {}
  }
  return null;
};

// ---- --all：把每个有主文件的子目录各编一遍（en/cn 双语稿）----
if (flag('all') && !process.env.PAPER_BUILD_CHILD) {
  const found = [];
  for (const c of ['paper2/en', 'paper2/cn', 'paper', 'paper2', '.']) {
    const m = findMain(c);
    if (m) found.push({ rel: path.relative(project, m.dir) || '.', dir: m.dir });
  }
  if (!found.length) die(`在 ${project} 下没有找到含 \\documentclass 的 .tex 主文件`);
  if (process.env.PAPER_BUILD_DEBUG) process.stderr.write(`found=${JSON.stringify(found)}\n`);
  const self = fileURLToPath(import.meta.url);
  const started = Date.now();
  const items = [];
  for (const f of found) {
    const args = [self, '--project', project, '--dir', f.dir, '--json', '--engine', String(opt('engine', 'auto'))];
    if (opt('out')) args.push('--out', String(opt('out')));
    if (wantClean) args.push('--clean');
    const r = spawnSync(process.execPath, args, {
      encoding: 'utf8', timeout: timeoutMs + 60_000, windowsHide: true,
      env: { ...process.env, PAPER_BUILD_CHILD: '1' },
    });
    let parsed = null;
    try { parsed = JSON.parse(String(r.stdout || '').trim()); } catch {}
    items.push(parsed || { ok: false, mainDir: f.dir, error: String(r.stderr || '').slice(-400) || `退出码 ${r.status}` });
  }
  const brief = items.map((it) => ({
    dir: path.relative(project, it.mainDir || ''),
    ok: Boolean(it.ok),
    engine: it.engine || '',
    pages: it.pages || 0,
    pdf: it.pdf || '',
    errors: (it.errors || []).slice(0, 4),
    warnings: it.warnings || null,
    ms: it.ms || 0,
  }));
  out({ ok: brief.every((b) => b.ok), all: true, project, ms: Date.now() - started, items: brief });
  process.exit(brief.every((b) => b.ok) ? 0 : 1);
}

let picked = null;
for (const c of mainDirCandidates) {
  picked = findMain(c);
  if (picked) break;
}
if (!picked) die(`在 ${project} 下没有找到含 \\documentclass 的 .tex 主文件（试过：${mainDirCandidates.join(', ')}）`);

// ---- 判引擎 ----
const readAll = (files) => files.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
const preambleFiles = (dir) => {
  const p = path.join(dir, 'preamble');
  try {
    return fs.readdirSync(p).filter((n) => n.endsWith('.tex')).map((n) => path.join(p, n));
  } catch { return []; }
};
const probe = readAll([picked.main, ...preambleFiles(picked.dir)]);
const needsXe = /\\usepackage(\[[^\]]*\])?\{\s*(ctex|xeCJK|fontspec)\s*\}|\\documentclass(\[[^\]]*\])?\{\s*ctex/.test(probe);
const forced = String(opt('engine', 'auto'));
const engine = forced === 'auto' ? (needsXe ? 'xelatex' : 'pdflatex') : forced;

// ---- 输出目录 ----
// 默认就地编译（aux/pdf 与源码同目录）。给了 --out 才隔离 PDF：
// 但 -outdir 会把 bibtex 的 cwd 挪到输出目录，\bibliography{../../intro/refs}
// 这类相对路径立刻失效，所以必须同时用 -auxdir=. 把 aux 钉在源码目录。
const outArg = String(opt('out', ''));
const outDir = outArg ? path.resolve(picked.dir, outArg) : picked.dir;
const auxDir = picked.dir;
const isolated = outDir !== picked.dir;
const stem = path.basename(picked.main, path.extname(picked.main));
const logPath = path.join(auxDir, `${stem}.log`);
const pdfPath = path.join(outDir, `${stem}.pdf`);
const AUX_RE = /\.(aux|log|out|toc|bbl|blg|fls|fdb_latexmk|synctex\.gz|xdv|nav|snm)$/i;

if (wantClean) {
  for (const d of [auxDir, outDir]) {
    try {
      for (const n of fs.readdirSync(d)) if (AUX_RE.test(n)) fs.unlinkSync(path.join(d, n));
    } catch {}
  }
}

const latexmk = findExe('latexmk') || findExe('latexmk.pl');
const direct = findExe(engine);
if (!latexmk && !direct) die(`找不到 latexmk 或 ${engine}（检查 TeX Live 是否在 PATH）`);

const run = (cmd, args, cwd) => {
  const t0 = Date.now();
  // -outdir 会把 bibtex 的工作目录换到输出目录，相对 \bibliography{../../intro/refs}
  // 就解不开了；把主文件目录垫进搜索路径，相对路径在 outdir 里也能命中。
  const withDir = (v) => `${picked.dir};${v || ''}`;
  const r = spawnSync(cmd, args, {
    cwd, timeout: timeoutMs, encoding: 'utf8', windowsHide: true,
    env: {
      ...process.env,
      max_print_line: '1000',
      PYTHONIOENCODING: 'utf-8',
      TEXINPUTS: withDir(process.env.TEXINPUTS),
      BIBINPUTS: withDir(process.env.BIBINPUTS),
      BSTINPUTS: withDir(process.env.BSTINPUTS),
    },
  });
  return {
    status: r.status, ms: Date.now() - t0,
    timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT'),
    spawnError: r.error ? String(r.error.message || r.error) : '',
    stdout: String(r.stdout || ''), stderr: String(r.stderr || ''),
  };
};

const started = Date.now();
let attempts = [];
let ok = false;

if (latexmk) {
  const mode = engine === 'xelatex' ? '-xelatex' : '-pdf';
  const args = [mode, '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-synctex=0'];
  if (isolated) args.push('-auxdir=.', `-outdir=${outDir}`);
  args.push(path.basename(picked.main));
  const r = run(latexmk, args, picked.dir);
  attempts.push({ tool: 'latexmk', ...r });
  ok = r.status === 0 && !r.timedOut;
} else if (direct) {
  // 无 latexmk 时只能就地跑两遍（-output-directory 会让 bibtex 找不到相对 .bib）。
  for (let i = 0; i < 2; i += 1) {
    const r = run(direct, ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', path.basename(picked.main)], picked.dir);
    attempts.push({ tool: engine, ...r });
    if (r.status !== 0 || r.timedOut) break;
    ok = true;
  }
}

// ---- 读日志：错误、警告、页数 ----

let log = '';
try { log = fs.readFileSync(logPath, 'utf8'); } catch {}

const errors = [];
const seen = new Set();
const pushErr = (msg, where) => {
  const key = `${where || ''}|${msg}`;
  if (seen.has(key) || errors.length >= 50) return;
  seen.add(key);
  errors.push(where ? { msg, where } : { msg });
};
for (const m of log.matchAll(/^(?:\.\/)?([^\n:]+\.(?:tex|sty|cls|bbl)):(\d+): (.+)$/gm)) {
  pushErr(m[3].trim(), `${m[1]}:${m[2]}`);
}
for (const m of log.matchAll(/^(! .+)$/gm)) pushErr(m[1].trim());
if (!ok && !errors.length) {
  const tail = (attempts[attempts.length - 1] || {});
  const blob = `${tail.stderr || ''}\n${tail.stdout || ''}`;
  const m = blob.match(/^!+\s*(.+)$/m) || blob.match(/(LaTeX Error:[^\n]+)/);
  if (m) pushErr(m[1].trim());
  else if (tail.timedOut) pushErr(`编译超时（> ${timeoutMs / 1000}s）`);
  else if (tail.spawnError) pushErr(tail.spawnError);
  else pushErr(`编译退出码 ${tail.status}`);
}

const count = (re) => (log.match(re) || []).length;
const warnings = {
  undefinedRefs: count(/Reference `[^']+' on page \d+ undefined/g) + count(/Citation `[^']+' on page \d+ undefined/g),
  overfull: count(/Overfull \\hbox/g),
  latexWarn: count(/^LaTeX Warning:/gm),
};


const pdfOk = fs.existsSync(pdfPath);
const pagesMatch = log.match(/Output written on .*?\((\d+) pages?/);
if (pdfOk && !ok && !errors.length) ok = true;

// 隔离输出时 aux 会落在源码目录（-auxdir=. 的代价）。日志已读完，默认清掉；
// --keep-aux 留着可以加速下一遍。
let auxCleaned = 0;
if (isolated && !flag('keep-aux')) {
  try {
    for (const n of fs.readdirSync(auxDir)) {
      if (!AUX_RE.test(n)) continue;
      try { fs.unlinkSync(path.join(auxDir, n)); auxCleaned += 1; } catch {}
    }
  } catch {}
}

out({
  ok: ok && pdfOk,
  project,
  main: picked.main,
  mainDir: picked.dir,
  engine,
  pdf: pdfOk ? pdfPath : '',
  outDir,
  pages: pagesMatch ? Number(pagesMatch[1]) : 0,
  ms: Date.now() - started,
  errors,
  warnings,
  auxCleaned,
  logTail: log ? log.slice(-1600) : '',
  attempts: attempts.map((a) => ({ tool: a.tool, status: a.status, ms: a.ms, timedOut: a.timedOut })),
});

process.exit(ok && pdfOk ? 0 : 1);
