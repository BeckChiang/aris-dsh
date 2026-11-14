#!/usr/bin/env node
// ARIS 运行器命令行：把「哪条流水线、什么时候跑、跑成什么样」从面板里解耦出来。
//
// 常用：
//   node bin/aris-run.mjs add --root D:\proj\second --name FRRS-二文
//   node bin/aris-run.mjs start --root D:\proj\second --interval 30
//   node bin/aris-run.mjs tick            # 外部计划任务可每 5 分钟调一次
//   node bin/aris-run.mjs status --json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectDriver,
  ensureDir,
  readConfig,
  readRegistry,
  readRuntime,
  readSettings,
  removeProject,
  runDir,
  saveConfig,
  saveRuntime,
  upsertProject,
} from './lib/aris-registry.mjs';
import { costView, isRunning, preflight, reconcile, runOnce, stopPipeline, tick } from './lib/aris-runner.mjs';
import { detectChanges, readEvents } from './lib/aris-events.mjs';
import { snapshot } from './lib/aris-control.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS_DEFAULT = path.dirname(HERE);

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function workspaceOf(args) {
  const ws = String(args.workspace || process.env.ARIS_WORKSPACE || WS_DEFAULT);
  return path.resolve(ws);
}

function needRoot(args) {
  const root = String(args.root || '').trim();
  if (!root) {
    console.error('缺少 --root（流水线根目录）');
    process.exit(2);
  }
  return path.resolve(root);
}

function normDriver(value, info) {
  const detected = info && info.driver && typeof info.driver === 'object' ? info.driver.driver : info && info.driver;
  const text = String(value || '');
  if (text === 'frrs' || text === 'aris') return text;
  return detected === 'frrs' || detected === 'aris' ? detected : 'auto';
}

function humanState(root) {
  const runtime = reconcile(root);
  const config = readConfig(root);
  const info = detectDriver(root);
  let stage = '';
  try {
    if (info.driver === 'frrs') {
      const s = JSON.parse(fs.readFileSync(path.join(root, config.frrs.state || 'pipeline/state.json'), 'utf8'));
      const todo = s.states?.[s.state]?.todo || [];
      const first = todo.find((t) => t && t.status !== 'done' && t.status !== 'completed');
      stage = `${s.state} · ${s.status}${first ? ` · ${String(first.text || first.id || '').slice(0, 40)}` : ''}`;
    } else if (info.driver === 'aris') {
      const s = JSON.parse(fs.readFileSync(path.join(root, config.aris.stateDir || '.aris', 'state.json'), 'utf8'));
      stage = `${s.phase || '?'} · 第 ${s.round ?? 0} 轮`;
    }
  } catch {
    stage = '状态不可读';
  }
  const last = runtime.lastRun;
  return {
    name: path.basename(root),
    root,
    driver: normDriver(config.driver, info),
    enabled: Boolean(config.enabled),
    status: runtime.status,
    stage,
    intervalMinutes: config.intervalMinutes,
    nextAt: runtime.nextAt,
    lastRun: last
      ? { at: last.at, exit: last.exit, ms: last.ms, cny: last.cny, verdict: last.verdict }
      : null,
    totals: runtime.totals,
    lastError: runtime.lastError,
  };
}

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

function yuan(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v < 0.01 ? `¥${v.toFixed(4)}` : `¥${v.toFixed(2)}`;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._[0] || 'status';
  const workspace = workspaceOf(args);
  const settings = readSettings(workspace);

  if (cmd === 'kimi-prompt') {
    const { buildKimiPrompt, writeKimiPrompt } = await import('./lib/aris-kimi.mjs');
    const text = buildKimiPrompt({
      mailbox: settings.mailbox,
      intervalMinutes: (settings.kimi && settings.kimi.intervalMinutes) || 30,
    });
    if (args.write) {
      const file = writeKimiPrompt(path.resolve(String(args.write)), text);
      console.log(`✔ 已写入 ${file}`);
    }
    if (args.json) {
      console.log(JSON.stringify({ mailbox: settings.mailbox, intervalMinutes: (settings.kimi && settings.kimi.intervalMinutes) || 30, text }, null, 2));
      return;
    }
    console.log(text);
    return;
  }

  if (cmd === 'watch') {
    const snap = snapshot(workspace, {});
    const changes = detectChanges(workspace, snap);
    const tail = Number(args.tail || 5);
    if (args.json) {
      console.log(JSON.stringify({ at: snap.at, changes, recent: readEvents(workspace, tail) }, null, 2));
      return;
    }
    if (!changes.length) {
      console.log('自上次检查以来没有变化。');
    } else {
      console.log(`自上次检查以来 ${changes.length} 条变化：`);
      for (const e of changes) console.log(`- ${e.at}  ${e.text}`);
    }
    const recent = readEvents(workspace, tail);
    if (recent.length) {
      console.log('\n最近事件：');
      for (const e of recent) console.log(`  ${e.at}  ${e.text}`);
    }
    return;
  }

  if (cmd === 'events') {
    const list = readEvents(workspace, Number(args.tail || 30));
    if (args.json) {
      console.log(JSON.stringify({ workspace, events: list }, null, 2));
      return;
    }
    if (!list.length) {
      console.log('还没有事件记录。宿主节拍或 `watch` 会在状态变化时写入。');
      return;
    }
    for (const e of list) console.log(`${e.at}  ${e.text}`);
    return;
  }

  if (cmd === 'add') {
    const root = needRoot(args);
    if (!fs.existsSync(root)) {
      console.error(`目录不存在：${root}`);
      process.exit(2);
    }
    const info = detectDriver(root);
    const detected = info.driver && typeof info.driver === 'object' ? info.driver.driver : info.driver;
    const driver = String(args.driver || (detected === 'unknown' ? 'auto' : detected));
    if (info.driver === 'unknown' && driver === 'auto') {
      console.error('这个目录里既没有 .aris/state.json，也没有 pipeline/gate.py；用 --driver 指定类型，或确认路径。');
      process.exit(3);
    }
    ensureDir(runDir(root));
    saveConfig(root, {
      driver,
      model: String(args.model || settings.model || ''),
      maxMinutes: Number(args.max || settings.maxMinutes || 45),
      intervalMinutes: Number(args.interval || 0),
      autoCollect: args['no-collect'] ? false : true,
    });
    const promptFile = path.join(runDir(root), 'prompt.md');
    if (!fs.existsSync(promptFile)) {
      const { defaultPrompt } = await import('./lib/aris-runner.mjs');
      const text = defaultPrompt(root, info.driver === 'unknown' ? driver : info.driver, readConfig(root), settings);
      fs.writeFileSync(promptFile, text, 'utf8');
    }
    upsertProject(workspace, { root, name: String(args.name || path.basename(root)), driver });
    console.log(`✔ 已登记：${root}  (${driver})`);
    console.log(`  运行目录：${runDir(root)}`);
    console.log(`  提示词：${promptFile}`);
    return;
  }

  if (cmd === 'list' || cmd === 'status') {
    const rows = readRegistry(workspace).map((e) => humanState(e.root));
    if (args.json) {
      console.log(JSON.stringify({ workspace, rows }, null, 2));
      return;
    }
    if (!rows.length) {
      console.log('还没有登记流水线。用 `aris-run.mjs add --root <目录>` 添加。');
      return;
    }
    console.log(`工作区：${workspace}`);
    for (const r of rows) {
      const tag = r.status === 'running' ? '▶ 运行中' : r.enabled ? '● 已启用' : '○ 已停用';
      console.log(`\n${tag}  ${r.name}  [${r.driver}]`);
      console.log(`  根目录：${r.root}`);
      console.log(`  阶段：${r.stage || '—'}`);
      if (r.lastRun) {
        console.log(`  上轮：${r.lastRun.at} · 退出 ${r.lastRun.exit} · ${fmtMs(r.lastRun.ms)} · ${yuan(r.lastRun.cny)}${r.lastRun.verdict ? ` · ${r.lastRun.verdict}` : ''}`);
      } else {
        console.log('  上轮：还没有运行记录');
      }
      console.log(`  累计：${r.totals.runs} 轮 · ${yuan(r.totals.cny)}`);
      if (r.nextAt) console.log(`  下次：${r.nextAt}`);
      if (r.lastError) console.log(`  ⚠ ${r.lastError}`);
    }
    return;
  }

  if (cmd === 'start') {
    const root = needRoot(args);
    const interval = Number(args.interval || 0);
    saveConfig(root, { enabled: true, ...(interval > 0 ? { intervalMinutes: interval } : {}) });
    saveRuntime(root, { nextAt: new Date().toISOString(), status: 'idle' });
    console.log(`✔ 已启用：${root}（间隔 ${interval || readConfig(root).intervalMinutes || 0} 分钟，下一拍立即执行）`);
    return;
  }

  if (cmd === 'stop') {
    const root = needRoot(args);
    const runtime = stopPipeline(root);
    console.log(`✔ 已停止并停用：${root}（${runtime.status}）`);
    return;
  }

  if (cmd === 'run') {
    const root = needRoot(args);
    const config = readConfig(root);
    const gate = preflight(root, config);
    if (!gate.ok && !args.force) {
      console.log(`○ 跳过：${gate.reason}`);
      return;
    }
    console.log(`▶ 运行一次：${root}`);
    const result = await runOnce({ workspace, root, config, settings });
    console.log(`  结果：${result.ok ? '成功' : '失败'} · 退出 ${result.exit} · ${fmtMs(0) === '0s' ? '' : ''}${yuan(result.cny ? result.cny.total : null)}`);
    console.log(`  日志：${result.dir}`);
    if (result.summary) console.log(`  摘要：${String(result.summary).slice(0, 400)}`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (cmd === 'tick') {
    const result = await tick(workspace, { force: Boolean(args.force) });
    console.log(JSON.stringify(result));
    return;
  }

  if (cmd === 'logs') {
    const root = needRoot(args);
    const dir = path.join(runDir(root), 'runs');
    let entries = [];
    try {
      entries = fs.readdirSync(dir).sort();
    } catch {
      console.log('还没有运行记录');
      return;
    }
    const last = entries[entries.length - 1];
    if (!last) {
      console.log('还没有运行记录');
      return;
    }
    const base = path.join(dir, last);
    const tail = Number(args.tail || 40);
    const meta = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(base, 'meta.json'), 'utf8'));
      } catch {
        return null;
      }
    })();
    console.log(`最近一次：${last}`);
    if (meta) {
      console.log(`  退出 ${meta.exit} · ${fmtMs(meta.ms)} · ${meta.model || '?'} · ${yuan(meta.cny ? meta.cny.total : null)}${meta.cny?.peak ? '（高峰价）' : '（空闲价）'}`);
      console.log(`  token：输入 ${meta.usage.input}（命中 ${meta.usage.cacheRead}）输出 ${meta.usage.output}`);
      console.log(`  结论：${meta.verdict || '—'}`);
    }
    const stderr = (() => {
      try {
        return fs.readFileSync(path.join(base, 'stderr.log'), 'utf8');
      } catch {
        return '';
      }
    })();
    if (stderr.trim()) {
      console.log(`\n--- stderr（末 ${tail} 行）---`);
      console.log(stderr.trim().split(/\r?\n/).slice(-tail).join('\n'));
    }
    const final = (() => {
      try {
        return fs.readFileSync(path.join(base, 'final.txt'), 'utf8');
      } catch {
        return '';
      }
    })();
    if (final.trim()) {
      console.log(`\n--- 最终输出 ---`);
      console.log(final.trim().slice(0, 4000));
    }
    return;
  }

  if (cmd === 'cost') {
    const root = needRoot(args);
    const view = costView(root);
    if (args.json) {
      console.log(JSON.stringify(view, null, 2));
      return;
    }
    console.log(`累计：${view.total.runs} 轮 · 输入 ${view.total.usage.input}（命中 ${view.total.usage.cacheRead}）· 输出 ${view.total.usage.output} · ${yuan(view.total.cny)}`);
    for (const r of view.runs.slice(0, 10)) {
      const when = new Date(r.finishedAt || r.at || Date.now()).toLocaleString();
      console.log(`  ${when}  ${r.model || '?'}  ${r.usage.output} out  ${yuan(r.cny ? r.cny.total : null)}${r.cny?.peak ? '（峰）' : ''}`);
    }
    return;
  }

  if (cmd === 'remove') {
    const root = needRoot(args);
    removeProject(workspace, root);
    const rt = readRuntime(root);
    console.log(`✔ 已从注册表移除：${root}（运行目录保留：${runDir(root)}，状态 ${rt.status}）`);
    return;
  }

  console.log(`用法：
  aris-run.mjs add    --root <目录> [--name X] [--driver auto|frrs|aris] [--interval 分钟]
  aris-run.mjs start  --root <目录> [--interval 分钟]
  aris-run.mjs stop   --root <目录>
  aris-run.mjs run    --root <目录> [--force]
  aris-run.mjs tick   [--force]
  aris-run.mjs status [--json]
  aris-run.mjs logs   --root <目录> [--tail 40]
  aris-run.mjs cost   --root <目录> [--json]
  aris-run.mjs remove --root <目录>
公共参数：--workspace <工作区>`);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
