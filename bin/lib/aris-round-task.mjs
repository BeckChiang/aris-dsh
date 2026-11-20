import fs from 'node:fs';
import path from 'node:path';
import { readConfig, detectDriver } from './aris-registry.mjs';
import { quotaGate, reviewQuotaTasks } from './codex-review.mjs?v=10';
import { effectiveReviewer } from './review-route.mjs?v=5';
import { readReviewBudget, physicalUsage, scopeQuota } from './aris-review-quota.mjs';

function json(file, missing) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return missing;
    throw error;
  }
}

function scopeFromPackage(file) {
  return path.parse(file).name.replace(/^review_package_/, '').split(/_r\d+(?:_|$)/)[0].replace(/^_+|_+$/g, '') || path.basename(path.dirname(file));
}

function taskOf(item) {
  const text = typeof item === 'string' ? item : item?.text || item?.summary;
  if (!text || /^\s*✅/.test(text) || item?.done || item?.status === 'done') return null;
  const legacyScope = /^([\w-]+)_review_r\d+\b/i.exec(text)?.[1];
  const packageName = /review_package_[\w-]+(?:_r\d+)?\.md/i.exec(text)?.[0];
  const review = item.kind === 'review' || (item.kind !== 'local' &&
    (legacyScope || /^(?:review\b|review_|送审|复审|外审)/i.test(text) ||
      /^(?!.*(?:本地|自检|构建|草拟)).*(?:送审|复审)/.test(text)));
  return {
    text, id: item.id, dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn : [],
    review, target: item.target || packageName,
    scope: item.scope || /\bscope\s*=\s*([\w-]+)/i.exec(text)?.[1] || legacyScope || (packageName ? scopeFromPackage(packageName) : ''),
    tier: item.tier === 'fast' || /\breview_L1\b/i.test(text) ? 'fast' : 'review',
    explicitReviewer: item.reviewer,
  };
}

export function physicalBlock(root, task) {
  if (!task.scope) return null;
  let quota;
  try {
    quota = scopeQuota(root, task.scope, task.tier, readReviewBudget(root), physicalUsage(root));
  } catch (error) {
    throw new Error('无法核对物理送审预算或次数账本：' + String((error && error.message) || error).slice(0, 80));
  }
  return quota.limit > 0 && quota.used >= quota.limit ? {
    kind: 'physical-cap',
    human: true,
    scope: quota.scope,
    tier: quota.tier,
    key: quota.key,
    used: quota.used,
    limit: quota.limit,
    reason: `物理送审次数 ${quota.used}/${quota.limit} 已封顶，需人工裁决（${quota.scope}）`,
  } : null;
}

// Read-only selection used by automatic starts, manual starts and both panels.
export function chooseRoundTask(workspace, root, config = readConfig(root)) {
  const driver = config.driver === 'auto' ? detectDriver(root).driver : config.driver;
  const file = driver === 'frrs' ? (config.frrs?.state || 'pipeline/state.json') : path.join(config.aris?.stateDir || '.aris', 'state.json');
  let state;
  try {
    state = json(path.join(root, file), null);
  } catch {
    return { ok: false, task: null, blocked: [], reason: '任务状态文件不可读' };
  }
  const stage = state?.state || state?.phase;
  const todo = (state?.states || state?.phases)?.[stage]?.todo;
  if (!Array.isArray(todo)) {
    // 通用 ARIS 可以没有 todo 列表：审稿阶段合成一条，其余阶段交给模型自己推进。
    if (driver !== 'frrs') {
      if (stage === 'review') {
        return select(workspace, root, [taskOf({ kind: 'review', text: 'ARIS 审稿阶段' })]);
      }
      return { ok: true, task: null, blocked: [] };
    }
    // frrs 没有 todo 说明 state.json 和流水线模板对不上：这时起轮等于空跑，
    // headless 进程会自己找活干，把轮次和送审次数一起打穿。宁可停下等人检查。
    return {
      ok: false,
      task: null,
      blocked: [],
      reason: '阶段「' + (stage || '未命名') + '」没有 todo 列表（' + file + '），需人工检查流水线状态文件',
    };
  }
  return select(workspace, root, todo.map(taskOf).filter(Boolean));
}

function select(workspace, root, tasks) {
  const route = effectiveReviewer(workspace, root);
  const deferred = reviewQuotaTasks(workspace, root);
  const ids = new Set(tasks.map(task => task.id).filter(Boolean));
  let gate;
  let selected = null;
  const blocked = [];
  const parked = new Set();
  for (const task of tasks) {
    const match = deferred.find(item => (task.target && item.target.replaceAll('\\', '/').endsWith('/' + path.basename(task.target))) ||
      item.target === task.target || item.task === task.text ||
      (task.scope && scopeFromPackage(item.target) === task.scope));
    if (match) parked.add(match.target);
    if (task.dependsOn.some(id => ids.has(id))) continue;
    let block = null;
    if (task.review || match) {
      try {
        block = physicalBlock(root, { ...task, scope: task.scope || (match && scopeFromPackage(match.target)) });
      } catch (error) {
        block = { kind: 'physical-ledger', human: true, reason: error.message };
      }
      if (!block && route !== 'kimi' && (route === 'gpt' || !task.explicitReviewer || task.explicitReviewer === 'gpt' || match)) {
        gate ||= quotaGate(workspace);
        if (gate.blocked) block = { kind: 'gpt-quota', reason: gate.reason, freeAt: gate.freeAt };
      }
    }
    if (block) blocked.push({ ...block, task: task.text, scope: task.scope });
    else if (!selected) selected = task.text;
  }
  for (const item of deferred) {
    if (!parked.has(item.target) && item.blocked) blocked.push({ ...item, kind: 'gpt-quota' });
  }
  return { ok: !!selected, task: selected, blocked, reason: blocked[0]?.reason || '当前阶段没有可执行任务' };
}
