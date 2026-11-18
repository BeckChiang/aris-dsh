// 读取 Codex 订阅额度（ChatGPT 计划的 5 小时窗口 / 周窗口）。
//
// 数据来源：Codex 每次运行都会把服务端返回的 rate_limits 写进会话 rollout 文件
// `~/.codex/sessions/<年>/<月>/<日>/rollout-<ISO>-<thread_id>.jsonl`，形如
//   {"timestamp":"...","type":"event_msg","payload":{"type":"token_count",...,
//     "rate_limits":{"limit_id":"codex","primary":{"used_percent":5,"window_minutes":300,
//     "resets_at":1794996627},"secondary":{"used_percent":1,"window_minutes":10080,...},
//     "credits":{...},"plan_type":"plus","rate_limit_reached_type":null}}}
//
// 这是 CLI 的内部结构，不是公开 API：字段改名/挪位置时这里要跟着改，调用方必须
// 容忍 `ok:false`，不要把额度当作可用性判断依据（闸门另有一套：每小时 N 次）。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');

/** 递归找 rollout 会话文件（最多看 depth 层，避免扫整个目录树）。 */
function listRollouts(dir, depth = 4, out = []) {
  if (depth < 0) return out;
  let names = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of names) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) listRollouts(p, depth - 1, out);
    else if (/^rollout-.*\.jsonl$/.test(d.name)) out.push(p);
  }
  return out;
}

function windowLabel(minutes) {
  if (!minutes) return '窗口';
  if (minutes % 10080 === 0 && minutes >= 10080) return `${minutes / 10080} 周窗口`;
  if (minutes % 1440 === 0) return `${minutes / 1440} 天窗口`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时窗口`;
  return `${minutes} 分钟窗口`;
}

function shapeWindow(w, key) {
  if (!w || typeof w !== 'object') return null;
  const used = Number(w.used_percent);
  const resetsAtMs = Number(w.resets_at) > 0 ? Number(w.resets_at) * 1000 : 0;
  return {
    key,
    label: windowLabel(Number(w.window_minutes) || 0),
    usedPercent: Number.isFinite(used) ? Math.max(0, Math.min(100, used)) : null,
    remainingPercent: Number.isFinite(used) ? Math.max(0, Math.min(100, 100 - used)) : null,
    windowMinutes: Number(w.window_minutes) || null,
    resetsAt: resetsAtMs ? new Date(resetsAtMs).toISOString() : null,
    resetsInMinutes: resetsAtMs ? Math.round((resetsAtMs - Date.now()) / 60000) : null,
  };
}

/** 在单个 rollout 文件里找最后一条 rate_limits。文件不大（几十到几百 KB），整读即可。 */
function quotaFromFile(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const idx = text.lastIndexOf('"rate_limits"');
  if (idx < 0) return null;
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  const lineEnd = text.indexOf('\n', idx);
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  let limits = null;
  let at = rec && rec.timestamp ? rec.timestamp : null;
  const stack = [rec];
  while (stack.length && !limits) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (cur.rate_limits && typeof cur.rate_limits === 'object') {
      limits = cur.rate_limits;
      break;
    }
    for (const v of Object.values(cur)) if (v && typeof v === 'object') stack.push(v);
  }
  if (!limits) return null;
  const windows = [shapeWindow(limits.primary, 'primary'), shapeWindow(limits.secondary, 'secondary')].filter(Boolean);
  const credits = limits.credits && typeof limits.credits === 'object'
    ? {
      hasCredits: Boolean(limits.credits.has_credits),
      unlimited: Boolean(limits.credits.unlimited),
      balance: limits.credits.balance ?? null,
    }
    : null;
  return {
    ok: true,
    plan: limits.plan_type || null,
    limitId: limits.limit_id || null,
    reached: limits.rate_limit_reached_type || null,
    windows,
    credits,
    at,
    file: path.basename(file),
  };
}

/**
 * 取最近一份含 rate_limits 的会话记录。
 * @returns {{ok:boolean, error?:string, plan?:string, windows?:Array, credits?:object,
 *   at?:string, ageMinutes?:number, stale?:boolean, file?:string, scanned?:number}}
 */
export function readCodexQuota({ home = CODEX_HOME, scan = 8 } = {}) {
  const dir = path.join(home, 'sessions');
  let files = [];
  try {
    files = listRollouts(dir);
  } catch {
    return { ok: false, error: `读不到会话目录：${dir}` };
  }
  if (!files.length) return { ok: false, error: '还没有会话记录（先跑一次 GPT 派单）' };
  files.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch {
      return 0;
    }
  });
  let scanned = 0;
  for (const f of files.slice(0, scan)) {
    scanned += 1;
    const q = quotaFromFile(f);
    if (!q) continue;
    const atMs = q.at ? Date.parse(q.at) : 0;
    const ageMinutes = atMs ? Math.max(0, Math.round((Date.now() - atMs) / 60000)) : null;
    // 5 小时窗口的记录超过 5 小时就没有参考价值了，但仍把数字给出来，只标 stale。
    return { ...q, ageMinutes, stale: ageMinutes != null && ageMinutes > 300, scanned };
  }
  return { ok: false, error: `最近 ${scanned} 份会话里没有额度记录`, scanned };
}
