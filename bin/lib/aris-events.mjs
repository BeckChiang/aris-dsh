// 流水线事件账本：把快照之间的“变化”落成一行行事件，供面板与会话读取。
// 只在宿主节拍或显式 watch 时写，纯追加、可截断，不参与任何调度判断。
import fs from 'node:fs';
import path from 'node:path';

const MAX_EVENTS = 500;

const eventsFile = (workspace) => path.join(workspace, '.dsh', 'aris-events.jsonl');
const stateFile = (workspace) => path.join(workspace, '.dsh', 'aris-events-state.json');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function readEvents(workspace, limit = 80) {
  const lines = readLines(eventsFile(workspace));
  const out = [];
  for (const line of lines.slice(-Math.max(1, Number(limit) || 80))) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // 坏行跳过，不让账本中的一行拖垮整个面板
    }
  }
  return out;
}

function appendEvents(workspace, events) {
  if (!events.length) return;
  const file = eventsFile(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lines = readLines(file).concat(events.map((e) => JSON.stringify(e)));
  const keep = lines.slice(-MAX_EVENTS);
  fs.writeFileSync(file, `${keep.join('\n')}\n`, 'utf8');
}

export function appendEvent(workspace, event) {
  appendEvents(workspace, [{ ...event, at: event.at || new Date().toISOString() }]);
}

function pipelineFingerprint(p) {
  const last = p.lastRun || {};
  return {
    name: String(p.name || ''),
    root: String(p.root || ''),
    enabled: Boolean(p.enabled),
    status: String(p.status || ''),
    stage: String((p.stage && p.stage.stage) || ''),
    stageStatus: String((p.stage && p.stage.status) || ''),
    block: String((p.stage && p.stage.block) || ''),
    blocked: String(p.blocked || ''),
    lastFinishedAt: String(last.finishedAt || ''),
    lastVerdict: String(last.verdict || ''),
    lastCny: last.cny && last.cny.total != null ? Number(last.cny.total) : null,
    lastError: String(p.lastError || ''),
  };
}

function fingerprint(snap) {
  const pipelines = {};
  for (const p of (snap && snap.pipelines) || []) pipelines[pipelineFingerprint(p).name] = pipelineFingerprint(p);
  return {
    handoff: String((snap && snap.handoff && snap.handoff.mode) || ''),
    pending: Number((snap && snap.mailbox && snap.mailbox.pending) || 0),
    pipelines,
  };
}

function yuan(v) {
  return v == null ? '—' : `¥${Number(v).toFixed(4)}`;
}

function diffFingerprint(prev, next) {
  const at = new Date().toISOString();
  const events = [];
  const push = (kind, text, extra = {}) => events.push({ at, kind, text, ...extra });

  if (prev && prev.handoff !== next.handoff) push('handoff', `执行权 ${prev.handoff || '—'} → ${next.handoff || '—'}`);
  if (prev && prev.pending !== next.pending) push('mailbox', `邮箱待处理 ${prev.pending} → ${next.pending}`);

  for (const [name, cur] of Object.entries(next.pipelines)) {
    const old = (prev && prev.pipelines && prev.pipelines[name]) || null;
    if (!old) {
      push('pipeline.add', `新流水线 ${name}（${cur.status}）`, { name });
      continue;
    }
    if (old.enabled !== cur.enabled) push('pipeline.enabled', `${name}：${cur.enabled ? '已启用' : '已停用'}`, { name });
    if (old.status !== cur.status) push('pipeline.status', `${name}：状态 ${old.status} → ${cur.status}`, { name });
    if (old.stage !== cur.stage) push('pipeline.stage', `${name}：阶段 ${old.stage || '—'} → ${cur.stage || '—'}`, { name });
    if (old.lastFinishedAt !== cur.lastFinishedAt) {
      push('pipeline.run', `${name}：完成一轮（${cur.lastVerdict || '—'}，${yuan(cur.lastCny)}）`, { name });
    }
    if (old.block !== cur.block) {
      push('pipeline.block', cur.block ? `${name}：出现人工阻塞 ${cur.block}` : `${name}：人工阻塞已解除`, { name });
    }
    if (old.blocked !== cur.blocked) {
      push('pipeline.preflight', cur.blocked ? `${name}：预检拦住（${cur.blocked}）` : `${name}：预检已放行`, { name });
    }
    if (old.lastError !== cur.lastError) {
      push('pipeline.error', cur.lastError ? `${name}：错误 ${String(cur.lastError).slice(0, 200)}` : `${name}：错误已清除`, { name });
    }
  }
  if (prev) {
    for (const name of Object.keys(prev.pipelines || {})) {
      if (!next.pipelines[name]) push('pipeline.remove', `移除流水线 ${name}`, { name });
    }
  }
  return events;
}

// 对比上次指纹，把变化写进账本并返回本次新增事件。没有任何变化时返回空数组。
export function detectChanges(workspace, snap) {
  const next = fingerprint(snap);
  const saved = readJson(stateFile(workspace));
  const prev = saved && saved.fingerprint ? saved.fingerprint : null;
  if (!prev) {
    fs.mkdirSync(path.dirname(stateFile(workspace)), { recursive: true });
    fs.writeFileSync(stateFile(workspace), JSON.stringify({ version: 1, at: new Date().toISOString(), fingerprint: next }, null, 2), 'utf8');
    return [];
  }
  const events = diffFingerprint(prev, next);
  if (events.length) {
    appendEvents(workspace, events);
    fs.writeFileSync(stateFile(workspace), JSON.stringify({ version: 1, at: new Date().toISOString(), fingerprint: next }, null, 2), 'utf8');
  }
  return events;
}
