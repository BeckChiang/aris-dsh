// DeepSeek 账号余额：面板顶部的余额条与「余额过低自动暂停」共用这一份读数。
// 缓存 60 秒并落盘，离线/无 key 时用上次读数，不让面板因为网络抖动变空。
import fs from 'node:fs';
import path from 'node:path';
import { resolveApiKey } from './aris-dsh.mjs?v=46';

const WARN_CNY = 10;
const HALT_CNY = 5;
const TTL_MS = 60_000;
const ENDPOINT = 'https://api.deepseek.com/user/balance';

let memo = { at: 0, value: null };

function cacheFile(workspace) {
  return path.join(workspace, '.dsh', 'aris-balance.json');
}

/** 同步读上次余额（面板快照用；真正的刷新走 getBalance）。 */
export function readBalanceCache(workspace) {
  const cached = readCache(workspace);
  if (!cached) return { ok: false, total: null, currency: 'CNY', at: null, level: 'unknown', warnAt: WARN_CNY, haltAt: HALT_CNY, error: '还没有余额读数' };
  return decorate({ ok: true, ...cached }, cached);
}

function readCache(workspace) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(workspace), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(workspace, value) {
  try {
    fs.mkdirSync(path.dirname(cacheFile(workspace)), { recursive: true });
    fs.writeFileSync(cacheFile(workspace), JSON.stringify(value, null, 2), 'utf8');
  } catch {
    /* 缓存写不了不影响读数 */
  }
}

function normalize(payload) {
  const infos = Array.isArray(payload && payload.balance_infos) ? payload.balance_infos : [];
  const cny = infos.find((x) => String(x.currency || '').toUpperCase() === 'CNY') || infos[0] || {};
  const total = Number(cny.total_balance);
  return {
    available: payload ? Boolean(payload.is_available) : null,
    currency: cny.currency || 'CNY',
    total: Number.isFinite(total) ? total : null,
    granted: Number(cny.granted_balance) || 0,
    toppedUp: Number(cny.topped_up_balance) || 0,
  };
}

/**
 * 读余额。返回值永远是一个对象：
 * `{ ok, total, currency, at, stale, warnAt:10, haltAt:5, level:'ok'|'warn'|'halt'|'unknown', error? }`
 */
export async function getBalance(workspace, settings = {}, { force = false } = {}) {
  const cached = readCache(workspace);
  const now = Date.now();
  if (!force && memo.value && now - memo.at < TTL_MS) return decorate(memo.value, cached);
  const { key } = resolveApiKey(settings);
  if (!key) {
    const value = { ok: false, total: cached ? cached.total : null, currency: 'CNY', at: cached ? cached.at : null, error: '没有可用的 DeepSeek API Key' };
    return decorate(value, cached);
  }
  try {
    const res = await fetch(ENDPOINT, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const value = { ok: true, ...normalize(body), at: new Date().toISOString() };
    memo = { at: now, value };
    writeCache(workspace, value);
    return decorate(value, cached);
  } catch (error) {
    const value = {
      ok: false,
      total: cached && Number.isFinite(cached.total) ? cached.total : null,
      currency: 'CNY',
      at: cached ? cached.at : null,
      error: String((error && error.message) || error),
    };
    return decorate(value, cached);
  }
}

function decorate(value, cached) {
  const total = Number.isFinite(value.total) ? value.total : null;
  const level = total == null ? 'unknown' : total <= HALT_CNY ? 'halt' : total <= WARN_CNY ? 'warn' : 'ok';
  return {
    ...value,
    total,
    level,
    warnAt: WARN_CNY,
    haltAt: HALT_CNY,
    stale: Boolean(value.at && cached && cached.at === value.at),
  };
}

/**
 * 余额护栏：低于 halt 线时只停「没在跑」的流水线，正在跑的那轮允许跑完。
 * 返回本次被停用的流水线名，供面板与事件账本解释原因。
 */
export function enforceFloor(snap, balance, { saveConfig }) {
  const halted = [];
  if (!balance || balance.level !== 'halt') return { halted, reason: '' };
  for (const p of snap.pipelines || []) {
    if (!p.enabled || p.running) continue;
    saveConfig(p.root, { enabled: false });
    halted.push(p.name);
  }
  return { halted, reason: `余额 ¥${Number(balance.total).toFixed(2)} 低于 ¥${balance.haltAt}，已暂停 ${halted.length} 条流水线` };
}
