#!/usr/bin/env node
/**
 * 手动触发 done 归档（正常运行中，调度器会在空闲窗口自动做，见 bin/lib/aris-done-archive.mjs）。
 *
 * 用法：
 *   node bin/aris-archive-done.mjs <pipeline-root> [--keep 10] [--apply]
 * 默认 dry-run，只报告会搬多少条；--apply 才写盘（自动备份 state.json 到 .aris-run/）。
 */
import fs from 'fs';
import path from 'path';
import { archiveDone } from './lib/aris-done-archive.mjs';

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith('--'));
if (!root) {
  console.error('用法: node bin/aris-archive-done.mjs <pipeline-root> [--keep 10] [--apply]');
  process.exit(2);
}
const keepArg = args.indexOf('--keep');
const KEEP = keepArg >= 0 ? Math.max(1, Number(args[keepArg + 1]) || 10) : 10;
const APPLY = args.includes('--apply');

const file = path.join(root, 'pipeline', 'state.json');
if (!fs.existsSync(file)) {
  console.error(`找不到 ${file}`);
  process.exit(1);
}

const st = JSON.parse(fs.readFileSync(file, 'utf8'));
const plan = [];
let moved = 0;
for (const [name, s] of Object.entries(st.states || {})) {
  const done = Array.isArray(s.done) ? s.done : [];
  if (done.length <= KEEP) continue;
  plan.push(`${name}: 搬 ${done.length - KEEP} 条，留 ${KEEP} 条`);
  moved += done.length - KEEP;
}

const before = fs.statSync(file).size;
if (!plan.length) {
  console.log(`没有需要归档的阶段（每阶段都已 ≤ ${KEEP} 条）。state.json ${before} B。`);
  process.exit(0);
}
console.log(plan.join('\n'));
console.log(`合计搬 ${moved} 条；state.json 现在 ${before} B。`);

if (!APPLY) {
  console.log('dry-run：未写盘。确认后加 --apply。');
  process.exit(0);
}
const res = archiveDone(root, { keep: KEEP });
console.log(`已归档：state.json ${res.before} B → ${res.after} B；搬 ${res.moved} 条；备份在 .aris-run/state.json.bak-*。`);
