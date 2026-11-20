/**
 * 每轮开始前给执行者看的「现状摘要 + 计划索引」。
 *
 * 目的：以前提示词让模型直接读 pipeline/state.json（几百 KB、含整段验收文字），每轮都要付
 * 一遍 token，还要被 done 明细分散注意力。这里生成两个便宜视图：
 *   - renderSnapshot()：5–8 行纯文本，直接塞进提示词「现状」段，模型据此判断该不该干活；
 *   - pipeline/PLAN-INDEX.json：每阶段一行摘要（状态 / 待做数 / 已完成数 / 首个待做项），
 *     模型要看全局时读它，只有真要改某个子项才回去读 state.json 的对应阶段。
 *
 * 本模块只读 state.json，只写 PLAN-INDEX.json，不碰任何审核/送审数据，失败一律降级为空。
 */
import fs from 'fs';
import path from 'path';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function stateFileOf(root, driver = 'frrs', config = {}) {
  if (driver === 'frrs') return path.join(root, config.frrs?.state || 'pipeline/state.json');
  return path.join(root, config.aris?.stateDir || '.aris', 'state.json');
}

export function indexFileOf(root) {
  return path.join(root, 'pipeline', 'PLAN-INDEX.json');
}

/** todo 条目既可能是字符串，也可能是 {text, done} 对象。 */
const itemText = (t) => (typeof t === 'string' ? t : String((t && (t.text || t.task || t.name)) || ''));
const oneLine = (text, max = 90) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** 生成索引对象；读不到 state 返回 null（调用方静默降级）。 */
export function buildPlanIndex(root, { driver = 'frrs', config = {}, stateFile = '' } = {}) {
  let st;
  try {
    st = readJson(stateFile || stateFileOf(root, driver, config));
  } catch {
    return null;
  }
  const stages = [];
  let pendingTotal = 0;
  for (const [id, s] of Object.entries(st.states || {})) {
    const todo = Array.isArray(s.todo) ? s.todo : [];
    const pending = todo.filter((t) => t && !t.done);
    const done = Array.isArray(s.done) ? s.done : [];
    const doneArchived = Number(s.doneArchived || 0);
    pendingTotal += pending.length;
    stages.push({
      id,
      status: String(s.status || ''),
      pending: pending.length,
      done: done.length + doneArchived,
      archived: doneArchived,
      first: pending.length ? oneLine(itemText(pending[0])) : '',
      note: s.exit_note ? oneLine(s.exit_note, 60) : '',
    });
  }
  return {
    at: new Date().toISOString(),
    status: String(st.status || ''),
    current: String(st.state || st.chain?.stage || ''),
    block: st.block ? { id: String(st.block.id || ''), reason: oneLine(st.block.reason, 160) } : null,
    gates: { done: Number(st.gates?.done || 0), total: Number(st.gates?.total || 0) },
    pendingTotal,
    stages,
  };
}

/** 原子写 PLAN-INDEX.json；内容没变就不写（每拍调用也不产生 IO 抖动）。 */
const withoutAt = (idx) => {
  const { at, ...rest } = idx || {};
  return JSON.stringify(rest);
};

export function writePlanIndex(root, opts = {}) {
  try {
    const idx = buildPlanIndex(root, opts);
    if (!idx) return null;
    const file = indexFileOf(root);
    let old = null;
    try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* 还没有索引 */ }
    // 内容没变就不写（at 每次都会变，不参与比较），避免每个节拍重写文件。
    if (old && withoutAt(old) === withoutAt(idx)) return old;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(idx), 'utf8');
    fs.renameSync(tmp, file);
    return idx;
  } catch {
    return null;
  }
}

/** 提示词里注入的现状摘要：纯文本、最多 8 行。 */
export function renderSnapshot(idx, { todoLimit = 3 } = {}) {
  if (!idx) return '';
  const lines = [];
  lines.push(`- 状态：${idx.status || '未知'}${idx.current ? `（当前 ${idx.current}）` : ''}；门禁 ${idx.gates.done}/${idx.gates.total}`);
  if (idx.block) lines.push(`- 阻塞：${idx.block.id} — ${idx.block.reason}`);
  const active = idx.stages.filter((s) => s.pending > 0);
  const shown = active.slice(0, 4).map((s) => `${s.id}[${s.pending}待做]`).join('、');
  lines.push(`- 有未完成项的阶段：${shown || '无'}`);
  const todoLines = idx.stages
    .filter((s) => s.first)
    .slice(0, todoLimit)
    .map((s) => `  · ${s.id} 下一项：${s.first}`);
  if (todoLines.length) lines.push('- 待做示例（详见 PLAN-INDEX.json）：', ...todoLines);
  return lines.join('\n');
}
