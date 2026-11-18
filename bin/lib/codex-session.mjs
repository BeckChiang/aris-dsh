// GPT 外审会话回放：从 ~/.codex/sessions 里读 rollout，还原成「提问 / 回复」对话。
// 面板「最近调用 → 查看会话」用它把 ChatGPT 一侧究竟收到什么、回了什么摊开看。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CODEX_HOME = path.join(os.homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');

// 这些是 harness 自己塞进去的上下文块，不是人说的话
const NOISE_PREFIXES = [
  '<skills_instructions',
  '<environment_context',
  '<multi_agent_role',
  '<multi_agent_mode',
  '<user_instructions',
  '<developer',
  'You are Codex',
  '<turn_context',
];

function isNoise(text) {
  const t = String(text || '').trimStart();
  return NOISE_PREFIXES.some((p) => t.startsWith(p));
}

export function sessionFile(sessionId) {
  const id = String(sessionId || '').trim();
  if (!id) return '';
  const stack = [SESSIONS_DIR];
  let guard = 0;
  while (stack.length && guard++ < 2000) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.includes(id) && e.name.endsWith('.jsonl')) return full;
    }
  }
  return '';
}

function textOf(item) {
  const c = item && item.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((x) => (typeof x === 'string' ? x : x && (x.text || x.input_text || '')))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * 读一条会话，还原成对话。
 * @returns {{ok:boolean, file?:string, meta?:object, turns?:Array, chars?:number, error?:string}}
 */
export function readSessionTranscript(sessionId, opts = {}) {
  const file = sessionFile(sessionId);
  if (!file) return { ok: false, error: '找不到这条会话的 rollout 文件（可能被清理，或会话 id 不对）' };
  const maxTurns = Number(opts.maxTurns) > 0 ? Number(opts.maxTurns) : 40;
  const clip = Number(opts.clip) > 0 ? Number(opts.clip) : 20000;

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, error: '读会话文件失败：' + e.message };
  }

  const meta = {};
  const turns = [];
  let chars = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d.type === 'session_meta' && d.payload) {
      meta.id = d.payload.id;
      meta.cwd = d.payload.cwd;
      meta.originator = d.payload.originator;
      meta.source = d.payload.source;
      meta.cli = d.payload.cli_version;
      meta.startedAt = d.payload.timestamp || d.timestamp;
      continue;
    }
    if (d.type === 'turn_context' && d.payload && d.payload.model) {
      meta.model = d.payload.model;
      meta.effort = d.payload.effort || d.payload.reasoning_effort;
      continue;
    }
    if (d.type !== 'response_item' || !d.payload || d.payload.type !== 'message') continue;
    const role = d.payload.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const text = textOf(d.payload);
    if (!text || isNoise(text)) continue;
    chars += text.length;
    turns.push({ role, text: text.length > clip ? text.slice(0, clip) + '\n…（已截断）' : text, at: d.timestamp || '' });
  }

  const kept = turns.slice(-maxTurns);
  return {
    ok: true,
    file,
    meta,
    turns: kept,
    total: turns.length,
    dropped: turns.length - kept.length,
    chars,
  };
}

/** 面板一行用：会话文件的体积与条数（不做全量解析之外的额外开销） */
export function sessionBrief(sessionId) {
  const file = sessionFile(sessionId);
  if (!file) return null;
  try {
    const st = fs.statSync(file);
    return { file, bytes: st.size, mtime: st.mtimeMs };
  } catch {
    return null;
  }
}
