// 审核单飞锁：GPT 直跑与 Kimi 邮箱共用一个「同一时刻只允许一条审核在跑」的闸门。
// 为什么不是各自一把锁：两条通道审的是同一批稿件，同时跑会互相盖掉产物、也让额度记账失真。
// 锁文件带 TTL，进程被杀后不会永久占锁。
import fs from 'node:fs';
import path from 'node:path';

export function reviewLockFile(workspace) {
  return path.join(workspace, '.dsh', '.review.lock');
}

/** 读锁状态。locked=false 表示可以派单（没有锁，或锁已过期）。 */
export function inspectReviewLock(workspace) {
  const file = reviewLockFile(workspace);
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { locked: false, file, channel: '', task: '', target: '', at: '', ageMs: 0 };
  }
  const at = raw.at ? Date.parse(raw.at) : 0;
  const ageMs = at ? Math.max(0, Date.now() - at) : 0;
  const ttlMs = Number(raw.ttlMs || 0);
  const expired = ttlMs > 0 && ageMs > ttlMs;
  return {
    locked: !expired,
    expired,
    file,
    channel: String(raw.channel || ''),
    task: String(raw.task || ''),
    target: String(raw.target || ''),
    at: String(raw.at || ''),
    pid: raw.pid || null,
    ttlMs,
    ageMs,
  };
}

/**
 * 抢锁。已有未过期的锁就返回 ok:false 并带上持锁者，方便面板说清「谁在跑」。
 * @param {{channel:'gpt'|'kimi', task:string, target?:string, ttlMs?:number}} input
 */
export function acquireReviewLock(workspace, input = {}) {
  const cur = inspectReviewLock(workspace);
  if (cur.locked) return { ok: false, holder: cur };
  const payload = {
    channel: String(input.channel || 'gpt'),
    task: String(input.task || ''),
    target: String(input.target || ''),
    at: new Date().toISOString(),
    ttlMs: Math.max(60_000, Number(input.ttlMs || 15 * 60 * 1000)),
    pid: process.pid,
  };
  const file = reviewLockFile(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  return { ok: true, holder: { ...payload, locked: true, file } };
}

/** 放锁。传 channel 时只放自己那把，避免误放别人的。 */
export function releaseReviewLock(workspace, channel = '') {
  const cur = inspectReviewLock(workspace);
  if (cur.locked && channel && cur.channel && cur.channel !== channel) {
    return { ok: false, holder: cur };
  }
  try {
    fs.rmSync(reviewLockFile(workspace), { force: true });
  } catch {
    /* 已经没了 */
  }
  return { ok: true };
}
