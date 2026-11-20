import fs from 'node:fs';
import path from 'node:path';

// 物理送审额度：预算、用量、追加写入与审计。只读部分被面板和任务选择共用。
const L1_KEY = 'l1_max_physical_submissions';
const L2_KEY = 'l2_max_physical_submissions';
const DEFAULT_L1 = 5;
const DEFAULT_L2 = 10;
const AUDIT_LIMIT = 200;

function readJson(file, missing) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return missing;
    throw error;
  }
}

export function scopeFromPackage(file) {
  const base = path.parse(String(file || 'unknown.md')).name.replace(/^review_package_/, '');
  return base.split(/_r\d+(?:_|$)/)[0].replace(/^_+|_+$/g, '') || path.basename(path.dirname(String(file || '')));
}

export function reviewBudgetFile(root) {
  return path.join(root, 'pipeline', 'budget.json');
}

export function quotaAuditFile(root) {
  return path.join(root, '.aris-run', 'quota-decisions.jsonl');
}

export function keyOf(tier) {
  return tier === 'fast' ? L1_KEY : L2_KEY;
}

/** 读预算：默认值 + scope 覆盖。读不到文件时按缺省值（缺预算不等于没额度）。 */
export function readReviewBudget(root) {
  const file = reviewBudgetFile(root);
  const review = readJson(file, {})?.review || {};
  const l1 = Number(review[L1_KEY]);
  const l2 = Number(review[L2_KEY]);
  const overrides = review.scope_overrides && typeof review.scope_overrides === 'object' ? review.scope_overrides : {};
  return {
    file,
    exists: fs.existsSync(file),
    defaults: {
      l1: Number.isInteger(l1) && l1 >= 0 ? l1 : DEFAULT_L1,
      l2: Number.isInteger(l2) && l2 >= 0 ? l2 : DEFAULT_L2,
    },
    overrides,
  };
}

/** 每个 scope 的物理送审用量（tier 决定算 L1 还是 L2）。 */
export function physicalUsage(root) {
  const ledger = readJson(path.join(root, 'pipeline', 'review', 'attempts.json'), { reviews: {} });
  const reviews = ledger && ledger.reviews && typeof ledger.reviews === 'object' ? ledger.reviews : {};
  const out = {};
  for (const record of Object.values(reviews)) {
    if (!record) continue;
    const scope = String(record.scope || scopeFromPackage(record.package || 'unknown.md'));
    const tier = record.tier === 'fast' ? 'fast' : 'review';
    const key = scope + '\u0000' + tier;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/** 某个 scope 的额度与用量：limit 取 scope_overrides 或默认值。 */
export function scopeQuota(root, scope, tier, budget = readReviewBudget(root), usage = physicalUsage(root)) {
  const key = keyOf(tier);
  const override = Number(budget.overrides?.[scope]?.[key]);
  const limit = Number.isInteger(override) && override >= 0 ? override : (tier === 'fast' ? budget.defaults.l1 : budget.defaults.l2);
  const used = usage[scope + '\u0000' + (tier === 'fast' ? 'fast' : 'review')] || 0;
  return { scope, tier, key, used, limit, overridden: Number.isInteger(override), remaining: Math.max(0, limit - used) };
}

export function recentDecisions(root, limit = 20) {
  const file = quotaAuditFile(root);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const lines = text.split('\n').filter(Boolean).slice(-Math.max(1, Number(limit) || 20));
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* 坏行跳过，不影响面板 */
    }
  }
  return out.reverse();
}

function appendAudit(root, entries) {
  if (!entries.length) return;
  const file = quotaAuditFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const keep = [];
  for (const entry of recentDecisions(root, AUDIT_LIMIT - 1)) keep.push(entry);
  const merged = keep.concat(entries).slice(-AUDIT_LIMIT);
  fs.writeFileSync(file, merged.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
}

/**
 * 追加物理送审额度：只改 budget.json 的 scope_overrides 并写审计，不清 state.block、不起轮。
 * add 是「再追加几次」；也接受 target（直接设成某个上限）。
 */
export function raiseQuota(root, rows, { by = 'panel', directiveId = '' } = {}) {
  const budget = readReviewBudget(root);
  const usage = physicalUsage(root);
  const file = budget.file;
  const raw = readJson(file, null);
  if (!raw || typeof raw !== 'object') return { ok: false, error: '读不到 pipeline/budget.json，先确认项目结构' };
  const review = raw.review && typeof raw.review === 'object' ? raw.review : (raw.review = {});
  const overrides = review.scope_overrides && typeof review.scope_overrides === 'object' ? review.scope_overrides : (review.scope_overrides = {});
  const done = [];
  const audit = [];
  const existing = recentDecisions(root, AUDIT_LIMIT);
  for (const row of Array.isArray(rows) ? rows : []) {
    const scope = String(row?.scope || '').trim();
    if (!scope) return { ok: false, error: '有一行没写 scope' };
    const tier = row.tier === 'fast' ? 'fast' : 'review';
    const key = keyOf(tier);
    const current = scopeQuota(root, scope, tier, budget, usage);
    const add = Number(row.add);
    const target = Number(row.target);
    let limit;
    if (Number.isFinite(target) && target > 0) limit = Math.floor(target);
    else if (Number.isFinite(add) && add > 0) limit = current.limit + Math.floor(add);
    else continue;
    if (limit > 10000) return { ok: false, error: `${scope}：上限太大（${limit}）` };
    if (limit <= current.used) return { ok: false, error: `${scope}：上限要大于已用 ${current.used} 次` };
    if (limit === current.limit) continue;
    const id = String(directiveId || '');
    if (id && existing.some((item) => item.directiveId === id && item.scope === scope && item.tier === tier)) continue;
    overrides[scope] = { ...(overrides[scope] || {}), [key]: limit };
    done.push({ scope, tier, key, from: current.limit, to: limit, used: current.used });
    audit.push({
      at: new Date().toISOString(),
      root,
      scope,
      tier,
      key,
      from: current.limit,
      to: limit,
      used: current.used,
      by,
      directiveId: id,
    });
  }
  if (!done.length) return { ok: true, changed: [], reason: '没有需要改的行' };
  review.scope_overrides = overrides;
  raw.review = review;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  appendAudit(root, audit);
  return { ok: true, changed: done, decisions: recentDecisions(root, 20) };
}
