// 审核结果汇总：把各流水线 `.aris/reviews/` 下的审稿产物读成一份统一清单。
// 两个来源：
//   *.json  —— aris-review 写的结构化记录（有 backend/model/verdict/score/summary）
//   *-codex-*.md —— 面板手动派单写的 markdown（无 json，从正文里抠结论）
// 只读，不改任何文件；供面板「审核结果」分组按结论分类展示。
import fs from 'node:fs';
import path from 'node:path';
import { readRegistry } from './aris-registry.mjs';

const VERDICTS = ['accept', 'revise', 'reject', 'unknown'];

function normVerdict(v) {
  const s = String(v || '').trim().toLowerCase();
  return VERDICTS.includes(s) ? s : 'unknown';
}

function channelOf(backend, hint) {
  const b = String(backend || '').toLowerCase();
  const h = String(hint || '').toLowerCase();
  if (b === 'codex') return 'gpt';
  // 改派记录：邮箱通道送进去、其实是 GPT 答的（本项目 2026-11-18 起有这种）
  if ((b === 'mailbox' || b === 'kimi-mailbox' || b === 'kimi') && /codex|gpt|openai/.test(h)) return 'gpt';
  if (b === 'mailbox' || b === 'kimi-mailbox' || b === 'kimi') return 'kimi';
  if (b === 'direct') return 'direct';
  // 老记录没写 backend：按审稿人自报的身份猜一把，猜不出就归 other
  if (/kimi|moonshot/.test(h)) return 'kimi';
  if (/codex|gpt|openai/.test(h)) return 'gpt';
  return 'other';
}

function isoOf(value) {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : 0;
}

// 从 `2026-11-18T07-38-51-codex-format_check.md` 里回推时间与任务分类
function parseManualName(file) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-codex-([a-z_]+)\.md$/i.exec(file);
  if (!m) return { at: 0, task: '' };
  const [, y, mo, d, h, mi, s, task] = m;
  return { at: Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}`), task };
}

// 手动派单的 md：首行「第三方审稿人（gpt-6-luna，思考强度 low）」，正文有 VERDICT / Score
function parseManualMd(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const head = (/第三方审稿人（([^，]+)，思考强度\s*([^）]+)）/).exec(text);
  const verdict = (/VERDICT:\s*(accept|revise|reject)/i.exec(text) || [])[1] || '';
  const scoreRaw = (/Score:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i.exec(text) || [])[1] || '';
  const summary = (/##\s*摘要\s*\n+([\s\S]{0,400})/.exec(text) || [])[1] || '';
  return {
    model: head ? head[1].trim() : '',
    effort: head ? head[2].trim() : '',
    verdict: normVerdict(verdict),
    score: scoreRaw ? Number(scoreRaw) : null,
    summary: summary.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

// 从 `dataset_gen/review_package_gold_r5.md` 里取 scope 与回合数
function parseTarget(target) {
  const base = String(target || '').replace(/\\/g, '/').split('/').pop();
  const m = /^review_package_(.+?)_r(\d+)\.md$/i.exec(base);
  if (!m) return { scope: '', round: 0 };
  return { scope: m[1], round: Number(m[2]) };
}

// 从审稿 md 里抠 `## MUST` 段的前几条，给「需要人处理」用
function mustLines(file, max = 4) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const seg =
    (/^##+\s*MUST\b([\s\S]*?)(?=^##+\s|\Z)/im.exec(text) || [])[1] ||
    (/^##+\s*主要问题\s*\n([\s\S]*?)(?=^##+\s|\Z)/im.exec(text) || [])[1] ||
    (/^##+\s*结论\s*\n([\s\S]*?)(?=^##+\s|\Z)/im.exec(text) || [])[1] ||
    '';
  return seg
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l && !/^```/.test(l))
    .slice(0, max);
}

// 需要人处理的事：封顶转人工、状态机 blocked_on_user、连败停摆、退回
function humanActionsOf(workspace, groups) {
  const out = [];
  const entries = readRegistry(workspace) || [];
  for (const entry of entries) {
    const root = entry && entry.root;
    if (!root) continue;
    const name = entry.name || path.basename(root);
    const capFile = path.join(root, '.aris', 'review-cap.json');
    if (fs.existsSync(capFile)) {
      let cap = null;
      try {
        cap = JSON.parse(fs.readFileSync(capFile, 'utf8'));
      } catch {}
      out.push({
        kind: 'cap',
        level: 'bad',
        name,
        root,
        title: '审查封顶，转人工',
        detail: cap
          ? `${cap.scope || '?'} 已送审 ${cap.used || '?'}/${cap.cap || '?'} 次仍未通过`
          : '同一稿子送审次数到顶仍未通过',
        at: (cap && cap.at) || '',
        file: cap && cap.human ? cap.human : '',
      });
    }
    // 流水线自己的阻塞（frrs 的 pipeline/state.json 才是权威；runtime.json 只反映起轮器）
    let st = null;
    try {
      st = JSON.parse(fs.readFileSync(path.join(root, 'pipeline', 'state.json'), 'utf8'));
    } catch {}
    if (st && st.block) {
      const checklist = String(st.block.manual_checklist || st.block.checklist || '');
      out.push({
        kind: 'cap',
        level: 'bad',
        name,
        root,
        title: `审查封顶转人工 · ${st.block.scope || '?'}`,
        detail: String(st.block.reason || '').replace(/\s+/g, ' ').slice(0, 240),
        at: st.block.at || st.block.created_at || '',
        file: checklist,
        checklist: checklist,
      });
    } else if (st && String(st.status || '') === 'blocked_on_user' && !st.block) {
      out.push({ kind: 'blocked', level: 'bad', name, root, title: '流水线等待人工', detail: 'pipeline/state.json 里 status = blocked_on_user', at: '', file: '' });
    }

    let rt = null;
    try {
      rt = JSON.parse(fs.readFileSync(path.join(root, '.aris-run', 'runtime.json'), 'utf8'));
    } catch {}
    if (rt && rt.status === 'blocked_on_user') {
      out.push({ kind: 'blocked', level: 'bad', name, root, title: '流水线等待人工', detail: rt.blockedReason || rt.note || 'state 置为 blocked_on_user', at: rt.updatedAt || rt.at || '', file: '' });
    }
    let cfg = null;
    try {
      cfg = JSON.parse(fs.readFileSync(path.join(root, '.aris-run', 'config.json'), 'utf8'));
    } catch {}
    if (cfg && cfg.enabled === false && (!rt || rt.status !== 'running')) {
      out.push({ kind: 'stopped', level: 'warn', name, root, title: '流水线已停用', detail: '自动起轮关闭，需要人决定是否恢复', at: '', file: '' });
    }
  }
  for (const g of groups) {
    const latest = g.latest;
    if (!latest) continue;
    if (latest.verdict === 'reject') {
      out.push({ kind: 'reject', level: 'bad', name: latest.name, root: latest.root, title: `退回：${latest.scope || g.key}`, detail: latest.summary || '审稿人判 reject', at: latest.at, file: latest.rel });
    }
    const capped = out.some((a) => a.kind === 'cap' && a.name === latest.name);
    if (latest.verdict === 'revise' && g.rounds >= 5 && !capped) {
      out.push({ kind: 'manyrounds', level: 'warn', name: latest.name, root: latest.root, title: `${latest.scope || g.key} 已改 ${g.rounds} 轮`, detail: '同一稿子反复退回，建议人看一眼是不是方向性问题', at: latest.at, file: latest.rel });
    }
  }
  return out;
}

/** 汇总全部流水线的审稿结果，按时间倒序。 */
export function collectReviewResults(workspace, opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 100;
  const entries = readRegistry(workspace) || [];
  const items = [];

  for (const entry of entries) {
    const root = entry && entry.root;
    if (!root) continue;
    const dir = path.join(root, '.aris', 'reviews');
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const label = entry.name || path.basename(root);
    for (const file of names) {
      if (!/\.(json|md)$/i.test(file)) continue;
      const abs = path.join(dir, file);
      const rel = path.join('.aris', 'reviews', file).replace(/\\/g, '/');

      if (/\.json$/i.test(file)) {
        let rec = null;
        try {
          rec = JSON.parse(fs.readFileSync(abs, 'utf8'));
        } catch {
          continue;
        }
        if (!rec || !rec.verdict) continue;
        const manual = parseManualName(file.replace(/\.json$/i, '.md'));
        const tgt = parseTarget(rec.target);
        items.push({
          key: `json:${abs}`,
          at: rec.created_at || '',
          atMs: isoOf(rec.created_at),
          project: path.basename(root),
          name: label,
          root,
          rel,
          mdRel: path.join('.aris', 'reviews', file.replace(/\.json$/i, '.md')).replace(/\\/g, '/'),
          channel: channelOf(rec.backend, `${rec.identity || ''} ${rec.reported_model || ''} ${rec.model || ''}`),
          backend: rec.backend || '',
          model: rec.reported_model || rec.model || '',
          identity: rec.identity || '',
          verdict: normVerdict(rec.verdict),
          score: Number.isFinite(Number(rec.score)) ? Number(rec.score) : null,
          summary: String(rec.summary || '').replace(/\s+/g, ' ').trim().slice(0, 240),
          task: manual.task || '',
          slot: rec.slot || 0,
          tier: rec.tier || '',
          round: rec.round || tgt.round || 0,
          scope: tgt.scope || '',
          target: rec.target || '',
          source: 'json',
        });
        continue;
      }

      // 只收没有配套 json 的 md（面板手动派单产物）
      if (file.endsWith('.json')) continue;
      const stem = file.replace(/\.md$/i, '');
      if (names.includes(`${stem}.json`)) continue;
      if (!/-codex-[a-z_]+\.md$/i.test(file)) continue;
      const parsed = parseManualMd(abs);
      if (!parsed) continue;
      const meta = parseManualName(file);
      items.push({
        key: `md:${abs}`,
        at: new Date(meta.at || Date.now()).toISOString(),
        atMs: meta.at || 0,
        project: path.basename(root),
        name: label,
        root,
        rel,
        mdRel: rel,
        channel: 'gpt',
        backend: 'codex-manual',
        model: parsed.model,
        identity: '',
        verdict: parsed.verdict,
        score: parsed.score,
        summary: parsed.summary,
        task: meta.task,
        slot: 0,
        tier: '',
        round: 0,
        scope: '',
        target: '',
        source: 'md',
      });
    }
  }

  items.sort((a, b) => (b.atMs || 0) - (a.atMs || 0));

  // 按「项目 + scope」归组：一份稿子的多轮审核 = 一个组，只有最新一轮是待办
  const buckets = new Map();
  for (const it of items) {
    const fallback = String(it.target || it.task || '').replace(/^.*\//, '').replace(/_r\d+\.md$/i, '').replace(/\.md$/i, '');
    const key = `${it.name}|${it.scope || fallback || ''}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const groups = [];
  for (const [key, list] of buckets) {
    list.sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
    const latest = list[0];
    const rounds = Math.max(...list.map((x) => x.round || 0), list.length);
    // 只给「最新且未通过」的那条抠 MUST，免得读一堆历史文件
    let must = [];
    if (latest.verdict === 'revise' || latest.verdict === 'reject') {
      must = mustLines(path.join(latest.root, latest.mdRel || latest.rel));
    }
    groups.push({
      key,
      name: latest.name,
      project: latest.project,
      root: latest.root,
      scope: latest.scope || latest.task || '',
      latest,
      rounds,
      history: list.slice(1),
      latestCount: list.length,
      must,
    });
  }
  groups.sort((a, b) => (b.latest.atMs || 0) - (a.latest.atMs || 0));

  const latestItems = groups.map((g) => g.latest);
  const historyItems = items.filter((it) => !latestItems.includes(it));

  const byVerdict = { accept: 0, revise: 0, reject: 0, unknown: 0 };
  const byChannel = { kimi: 0, gpt: 0, direct: 0, other: 0 };
  for (const it of items) {
    byVerdict[it.verdict] = (byVerdict[it.verdict] || 0) + 1;
    byChannel[it.channel] = (byChannel[it.channel] || 0) + 1;
  }
  // 最新一轮的口径：这才是「现在欠几件」
  const byLatest = { accept: 0, revise: 0, reject: 0, unknown: 0 };
  for (const it of latestItems) byLatest[it.verdict] = (byLatest[it.verdict] || 0) + 1;

  const humanActions = humanActionsOf(workspace, groups);
  humanActions.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));

  const latest = latestItems.find((it) => it.verdict !== 'unknown') || latestItems[0] || null;
  const ordered = [...groups.map((g) => g.latest), ...historyItems].slice(0, limit);

  return {
    total: items.length,
    byVerdict,
    byChannel,
    byLatest,
    groups: groups.map((g) => ({
      key: g.key,
      name: g.name,
      project: g.project,
      scope: g.scope,
      rounds: g.rounds,
      historyCount: g.history.length,
      latest: g.latest,
      must: g.must,
      history: g.history.slice(0, 20),
    })),
    latestTotal: latestItems.length,
    humanActions,
    latest: latest
      ? { at: latest.at, name: latest.name, channel: latest.channel, verdict: latest.verdict, score: latest.score, rel: latest.rel }
      : null,
    items: ordered,
    truncated: items.length > limit,
  };
}
