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
          round: rec.round || 0,
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
        source: 'md',
      });
    }
  }

  items.sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
  const byVerdict = { accept: 0, revise: 0, reject: 0, unknown: 0 };
  const byChannel = { kimi: 0, gpt: 0, direct: 0, other: 0 };
  for (const it of items) {
    byVerdict[it.verdict] = (byVerdict[it.verdict] || 0) + 1;
    byChannel[it.channel] = (byChannel[it.channel] || 0) + 1;
  }
  const latest = items.find((it) => it.verdict !== 'unknown') || items[0] || null;

  return {
    total: items.length,
    byVerdict,
    byChannel,
    latest: latest
      ? { at: latest.at, name: latest.name, channel: latest.channel, verdict: latest.verdict, score: latest.score, rel: latest.rel }
      : null,
    items: items.slice(0, limit),
    truncated: items.length > limit,
  };
}
