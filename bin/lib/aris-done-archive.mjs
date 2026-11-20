/**
 * done 明细的自动归档：把过旧的 states[].done 搬到 pipeline/done-archive.json，并在
 * states[<阶段>].doneArchived 记账，让面板/wiki 的「已完成 k 项」统计不丢。
 *
 * 安全前提（调用方负责，本模块也复查一次）：
 *   1. 只有流水线空闲（runtime.status !== 'running'）时才动 state.json；
 *   2. 文件小于阈值时什么都不做；
 *   3. 两次归档之间至少隔 cooldownMs，避免每个节拍都重写；
 *   4. 写盘走 临时文件 + rename（原子替换），并保留最近几份 state.json 备份；
 *   5. 任何异常都吞掉并返回 skipped —— 归档失败绝不能拦住调度。
 */
import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  thresholdBytes: 380_000,
  keep: 10,
  cooldownMs: 6 * 60 * 60_000,
  backups: 3,
};

function runDir(root) {
  return path.join(root, '.aris-run');
}

function stateFile(root) {
  return path.join(root, 'pipeline', 'state.json');
}

function archiveFile(root) {
  return path.join(root, 'pipeline', 'done-archive.json');
}

function markerFile(root) {
  return path.join(runDir(root), 'archive.json');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** 按阶段把 done 头部搬到归档文件；返回移动条数与文件大小变化。 */
export function archiveDone(root, { keep = DEFAULTS.keep, backup = true } = {}) {
  const file = stateFile(root);
  const before = fs.statSync(file).size;
  const st = readJson(file);
  const stages = st.states || {};

  const plan = [];
  for (const [name, s] of Object.entries(stages)) {
    const done = Array.isArray(s.done) ? s.done : [];
    if (done.length > keep) plan.push({ name, cut: done.length - keep });
  }
  if (!plan.length) return { ok: true, moved: 0, before, after: before };

  const arch = fs.existsSync(archiveFile(root))
    ? readJson(archiveFile(root))
    : { version: 1, stages: {} };
  arch.stages = arch.stages || {};

  if (backup) {
    const dir = runDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bak = path.join(dir, `state.json.bak-${stamp}`);
    fs.copyFileSync(file, bak);
    // 只保留最近几份备份，避免每个流水线堆出几十份 350 KB 副本。
    const baks = fs
      .readdirSync(dir)
      .filter((n) => n.startsWith('state.json.bak-'))
      .sort()
      .reverse();
    for (const n of baks.slice(DEFAULTS.backups)) {
      try { fs.unlinkSync(path.join(dir, n)); } catch { /* 备份清理失败不影响归档 */ }
    }
  }

  let moved = 0;
  for (const { name, cut } of plan) {
    const s = stages[name];
    const head = s.done.slice(0, cut);
    s.done = s.done.slice(cut);
    s.doneArchived = Number(s.doneArchived || 0) + head.length;
    arch.stages[name] = (arch.stages[name] || []).concat(head);
    moved += head.length;
  }
  arch.archivedAt = new Date().toISOString();
  arch.policy = { keepPerStage: keep };

  writeJsonAtomic(archiveFile(root), arch);
  writeJsonAtomic(file, st);
  return { ok: true, moved, before, after: fs.statSync(file).size, keep };
}

/**
 * 自动归档入口：条件都满足才动，失败/不满足一律静默跳过。
 * @returns {{skipped?: string, moved?: number, before?: number, after?: number}}
 */
export function maybeArchiveDone(root, { workspace = '', name = '', event = null, ...opts } = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  try {
    const file = stateFile(root);
    if (!fs.existsSync(file)) return { skipped: 'no state.json' };

    const runtimeFile = path.join(runDir(root), 'runtime.json');
    let runtime = {};
    try { runtime = readJson(runtimeFile); } catch { /* 读不到当空闲 */ }
    if (runtime && runtime.status === 'running') return { skipped: 'running' };

    const size = fs.statSync(file).size;
    if (size < cfg.thresholdBytes) return { skipped: `below threshold (${size} B)` };

    let last = 0;
    try { last = Date.parse(readJson(markerFile(root)).at || '') || 0; } catch { /* 没有标记 */ }
    if (last && Date.now() - last < cfg.cooldownMs) return { skipped: 'cooldown' };

    const res = archiveDone(root, { keep: cfg.keep });
    writeJsonAtomic(markerFile(root), {
      at: new Date().toISOString(),
      moved: res.moved,
      before: res.before,
      after: res.after,
      keep: cfg.keep,
    });
    if (event && res.moved > 0) {
      try {
        event(`${name || path.basename(root)}：done 归档 ${res.moved} 条（state.json ${Math.round(res.before / 1024)} KB → ${Math.round(res.after / 1024)} KB）`);
      } catch { /* 账本失败不影响归档 */ }
    }
    return res;
  } catch (error) {
    return { skipped: `error: ${String(error?.message || error).slice(0, 160)}` };
  }
}
