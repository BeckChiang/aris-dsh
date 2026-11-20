#!/usr/bin/env node
/**
 * 把 pipeline/state.json 里过旧的 states[].done 条目搬到 pipeline/done-archive.json。
 *
 * 背景：done[] 只增不删，单条记录常带整段验收文字（1–2 KB）。积累到几百条后
 * state.json 会涨到几百 KB，所有「读整份再解析」的路径都要为它买单（2026-11-20 就因为
 * 422 KB 超过某处读取上限，导致预检静默放行、每 60 秒空跑一轮）。
 *
 * 用法：
 *   node bin/aris-archive-done.mjs <pipeline-root> [--keep 10] [--apply]
 * 默认 dry-run，只打印会搬多少条、状态文件能从多少降到多少；--apply 才写盘，
 * 写前会把 state.json 复制到 pipeline/state.json.bak-<时间戳>。
 *
 * 归档后 states[<阶段>].doneArchived 记账，面板/wiki 的「已完成 k 项」仍按总数显示，
 * 明细只列保留下来的最近若干条。归档文件里原样保留条目（含 at/runId/verdict 证据）。
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--'));
if (!root) {
  console.error('用法: node bin/aris-archive-done.mjs <pipeline-root> [--keep 10] [--apply]');
  process.exit(2);
}
const keepArg = args.indexOf('--keep');
const KEEP = keepArg >= 0 ? Math.max(0, Number(args[keepArg + 1]) || 10) : 10;
const APPLY = args.includes('--apply');

const stateFile = path.join(root, 'pipeline', 'state.json');
const archiveFile = path.join(root, 'pipeline', 'done-archive.json');
if (!fs.existsSync(stateFile)) {
  console.error(`找不到 ${stateFile}`);
  process.exit(1);
}

const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const plan = [];
let moved = 0;
for (const [name, s] of Object.entries(st.states || {})) {
  const done = Array.isArray(s.done) ? s.done : [];
  if (done.length <= KEEP) continue;
  const cut = done.length - KEEP;
  plan.push({ name, move: cut, keep: KEEP });
  moved += cut;
}

const before = fs.statSync(stateFile).size;
const est = before - moved * Math.round(
  plan.reduce((bytes, p) => bytes + 0, 0) || 0,
);

if (!plan.length) {
  console.log(`没有需要归档的阶段（每阶段都已 ≤ ${KEEP} 条）。state.json ${before} B。`);
  process.exit(0);
}

console.log(plan.map((p) => `${p.name}: 搬 ${p.move} 条，留 ${p.keep} 条`).join('\n'));
console.log(`合计搬 ${moved} 条；state.json 现在 ${before} B，预计降到 ${Math.round(est)} B（按条目均长估算，实际以落盘为准）。`);
if (!APPLY) {
  console.log('dry-run：未写盘。确认后加 --apply。');
  process.exit(0);
}

const backup = `${stateFile}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(stateFile, backup);

const arch = fs.existsSync(archiveFile) ? JSON.parse(fs.readFileSync(archiveFile, 'utf8')) : { version: 1, stages: {} };
arch.version = arch.version || 1;
arch.stages = arch.stages || {};
for (const [name, s] of Object.entries(st.states || {})) {
  const done = Array.isArray(s.done) ? s.done : [];
  if (done.length <= KEEP) continue;
  const cut = done.length - KEEP;
  const head = done.slice(0, cut);
  s.done = done.slice(cut);
  s.doneArchived = Number(s.doneArchived || 0) + head.length;
  arch.stages[name] = (arch.stages[name] || []).concat(head);
}
arch.archivedAt = new Date().toISOString();
arch.policy = { keepPerStage: KEEP };
fs.writeFileSync(archiveFile, `${JSON.stringify(arch, null, 2)}\n`, 'utf8');
const tmp = `${stateFile}.tmp-${Date.now()}`;
fs.writeFileSync(tmp, `${JSON.stringify(st, null, 2)}\n`, 'utf8');
fs.renameSync(tmp, stateFile);
console.log(`已归档：state.json ${before} B → ${fs.statSync(stateFile).size} B；归档文件 ${fs.statSync(archiveFile).size} B；备份 ${path.basename(backup)}`);
