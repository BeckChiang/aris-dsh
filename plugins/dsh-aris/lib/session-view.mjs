// 只读会话视图：把自动回合产生的 headless 会话读成面板能渲染的时间线。
//
// 三件事必须说清：
//  1. 这里只读，不写。会话由 headless 进程追加，我们只用 fs.readFileSync 取字节，
//     再按 zstd 帧魔数切段逐帧解压——不碰持久化句柄，不会和写入方抢锁。
//  2. 会话日志是「每帧一段 JSONL」的追加文件，正在跑时最后一帧可能只写了一半：
//     解不开就跳过该帧，前面的照常显示，损坏的字节不会被我们回写。
//  3. 磁盘上的分桶名由 cwd 推导（`C:\a\b` -> `--C-a-b--`），所以同一份数据
//     不依赖 GUI 的工作区登记，插件自己就能找到。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]); // zstd frame magic
const ID_RE = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 24 * 1024 * 1024;

/** 会话分桶：把 cwd 变成 ~/.dsh/sessions 下的目录名。 */
export function bucketOf(dir) {
  const abs = path.resolve(String(dir || '.'));
  const flat = abs.replace(/[:\\/]+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  return `--${flat}--`;
}

export function sessionsHome(home) {
  return home || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

/** 定位某个会话的日志文件；id 形状不对或文件不存在时抛中文错误。 */
export function sessionFile(root, sessionId, opts = {}) {
  const id = String(sessionId || '').trim();
  if (!ID_RE.test(id)) throw new Error(`会话 id 形状不对：${id || '(空)'}`);
  const file = path.join(sessionsHome(opts.home), 'sessions', bucketOf(root), id, 'session.v4.jsonl.zstd');
  if (!fs.existsSync(file)) throw new Error(`找不到会话文件：${file}`);
  return file;
}

/** 逐帧解压；坏帧跳过，返回 { text, frames, broken }。 */
export function decodeFrames(buf) {
  const at = [];
  let i = -1;
  while ((i = buf.indexOf(MAGIC, i + 1)) !== -1) at.push(i);
  let text = '';
  let broken = 0;
  for (let k = 0; k < at.length; k++) {
    const end = k + 1 < at.length ? at[k + 1] : buf.length;
    try {
      text += zlib.zstdDecompressSync(buf.subarray(at[k], end)).toString('utf8');
    } catch {
      broken += 1; // 正在写入的尾帧，或历史坏帧：跳过
    }
  }
  return { text, frames: at.length, broken };
}

const clip = (s, n) => {
  const str = String(s == null ? '' : s).replace(/\r/g, '');
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

const flatten = (content, kinds) => {
  if (!Array.isArray(content)) return '';
  const out = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (kinds.includes(part.type) && part.text) out.push(String(part.text));
  }
  return out.join('\n');
};

/**
 * 读一轮会话的时间线。
 * @param {string} root       流水线根目录（会话按它的 cwd 分桶）
 * @param {string} sessionId  session-xxx
 * @param {object} opts       { home, limit=120, textLimit=1200 }
 */
export function readSession(root, sessionId, opts = {}) {
  const file = sessionFile(root, sessionId, opts);
  const stat = fs.statSync(file);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`会话文件过大：${(stat.size / 1048576).toFixed(1)}MB`);
  const { text, frames, broken } = decodeFrames(fs.readFileSync(file));

  const limit = Math.max(10, Math.min(600, Number(opts.limit) || 120));
  const textLimit = Math.max(200, Math.min(6000, Number(opts.textLimit) || 1200));

  const out = {
    ok: true,
    id: String(sessionId),
    file,
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    frames,
    brokenFrames: broken,
    cwd: '',
    title: '',
    model: '',
    createdAt: null,
    counts: { user: 0, assistant: 0, tool: 0, failed: 0 },
    items: [],
    total: 0,
    truncated: false,
  };

  const rows = text.split('\n').filter(Boolean);
  const items = [];
  const toolName = new Map(); // callId -> 工具名，给结果行补标题

  for (const line of rows) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const d = (ev && ev.data) || {};
    const at = ev && ev.time ? new Date(ev.time).toISOString() : null;

    if (ev.type === 'session') {
      out.cwd = ev.cwd || '';
      out.createdAt = ev.createdAt ? new Date(ev.createdAt).toISOString() : null;
      continue;
    }
    if (ev.type === 'session/title' && d.title) {
      out.title = String(d.title); // last-wins，与侧栏一致
      continue;
    }
    if (ev.type === 'user/message') {
      out.counts.user += 1;
      items.push({ kind: 'user', at, text: clip(flatten(d.content, ['text']), textLimit) });
      continue;
    }
    if (ev.type === 'assistant/message') {
      const src = (d.message && d.message.source) || {};
      if (!out.model && src.model) out.model = String(typeof src.model === 'string' ? src.model : src.model.model || '');
      const say = flatten(d.message && d.message.content, ['text']);
      if (!say) continue; // 只有思考与工具调用的空壳，不占一行
      out.counts.assistant += 1;
      items.push({ kind: 'assistant', at, text: clip(say, textLimit) });
      continue;
    }
    if (ev.type === 'tool/call') {
      out.counts.tool += 1;
      if (d.callId) toolName.set(String(d.callId), String(d.name || 'tool'));
      items.push({
        kind: 'tool',
        at,
        name: String(d.name || 'tool'),
        text: clip(String(d.arguments || '').replace(/\s+/g, ' '), 400),
      });
      continue;
    }
    if (ev.type === 'tool/result') {
      const msg = d.message || {};
      const body = flatten(msg.content, ['text']);
      const failed = Boolean(d.error) || /^\s*(error|failed)|exit code: [1-9]/i.test(body.slice(0, 200));
      if (failed) out.counts.failed += 1;
      items.push({
        kind: 'result',
        at,
        name: toolName.get(String(d.toolCallId || msg.toolCallId || '')) || 'tool',
        bad: failed,
        text: clip(body, Math.min(textLimit, 800)),
      });
    }
  }

  out.total = items.length;
  out.items = items.slice(-limit);
  out.truncated = items.length > out.items.length;
  return out;
}
