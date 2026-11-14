#!/usr/bin/env node
// lit.mjs — 文献检索/管理内核（DSH × ARIS × Zotero）
// 零依赖，Node 18+（本机 v24）。所有外部请求用内置 fetch。
//
// 用法：
//   node bin/lit.mjs doctor
//   node bin/lit.mjs zot stats
//   node bin/lit.mjs zot search "变胞机构" --limit 20 [--collection KEY] [--json]
//   node bin/lit.mjs zot bib --out refs.bib [--collection KEY]
//   node bin/lit.mjs zot get <KEY>
//   node bin/lit.mjs zot add --doi 10.xxxx/yyy [--pdf f.pdf] [--collection KEY] [--tag t]
//   node bin/lit.mjs zot add --title "..." --authors "A B;C D" --year 2024 --venue "..." [--pdf f.pdf]
//   node bin/lit.mjs zot attach <PARENT_KEY> <file.pdf>
//   node bin/lit.mjs zot rm <KEY> [--yes]
//   node bin/lit.mjs zot auth [--force]           # 首次写入时弹 Zotero 授权
//   node bin/lit.mjs zot import <papers.json> [--pdf-dir DIR] [--collection KEY]
//   node bin/lit.mjs find "metamorphic mechanism" --sources arxiv,crossref,openalex --max 30 [--out papers.json]
//   node bin/lit.mjs index --project <dir> [--out index.json]
//   node bin/lit.mjs lit "<topic>" --project <dir> [--max 40] [--import]   # ARIS 底稿（检索+校验+papers.json）
//   node bin/lit.mjs verify papers.json [--out verified.json]              # 单独跑 verify_papers.py

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ZOTERO = process.env.LIT_ZOTERO_URL || 'http://127.0.0.1:23119';
const ENVFILE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.dsh', 'lit-env.json');
const ENV = (() => { try { return JSON.parse(fs.readFileSync(ENVFILE, 'utf8')); } catch { return {}; } })();
const MAILTO = process.env.LIT_MAILTO || process.env.OPENALEX_EMAIL || ENV.mailto || '';

// 密钥不进工作区文件：进程环境 → Windows 用户环境（HKCU\Environment）→ 旧版 env 文件字段（仅兼容）
function userEnvVar(name) {
  if (process.platform !== 'win32') return '';
  try {
    const r = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return '';
    const m = /REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/.exec(r.stdout || '');
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const REG_OPENALEX_KEY = process.env.OPENALEX_API_KEY ? '' : userEnvVar('OPENALEX_API_KEY');
const OPENALEX_KEY_SOURCE = process.env.OPENALEX_API_KEY ? 'env'
  : (REG_OPENALEX_KEY ? 'user-env' : (ENV.openalexApiKey ? 'file' : 'none'));
const OPENALEX_KEY = process.env.OPENALEX_API_KEY || REG_OPENALEX_KEY || ENV.openalexApiKey || '';

const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1];

function flag(name, def = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) return true;
  return v;
}
function positional(startIdx) {
  const out = [];
  for (let i = startIdx; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; }
    out.push(args[i]);
  }
  return out;
}
function die(msg, code = 1) { console.error(`lit: ${msg}`); process.exit(code); }
function j(obj) { return JSON.stringify(obj, null, 2); }
function nowIso() { return new Date().toISOString(); }

// ---------- http ----------
async function getText(url, { timeout = 20000, headers = {} } = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  const text = await r.text();
  return { status: r.status, ok: r.ok, text, headers: r.headers };
}
async function getJson(url, opt) {
  const { status, ok, text } = await getText(url, opt);
  if (!ok) throw new Error(`HTTP ${status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ---------- Zotero ----------
async function zoteroUp() {
  try {
    const r = await getText(`${ZOTERO}/api/users/0/items?limit=1`, { timeout: 3000 });
    return r.ok;
  } catch { return false; }
}
function needZotero() {
  return zoteroUp().then((up) => {
    if (!up) die('Zotero 未运行或本地 API 不可用（设置→高级→杂项→允许其他应用通信）；请先打开 Zotero');
  });
}
function zotPath(p) { return `${ZOTERO}/api/users/0/${p}`; }

async function zotAll(kind, query = '', extra = {}) {
  const limit = 100;
  let start = 0, all = [];
  for (;;) {
    const q = new URLSearchParams({ limit: String(limit), start: String(start), ...query, ...extra });
    const batch = await getJson(zotPath(`${kind}?${q}`));
    if (!Array.isArray(batch) || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < limit) break;
    start += limit;
  }
  return all;
}
function zotToRecord(it) {
  const d = it.data || {};
  const creators = (d.creators || []).map((c) => c.lastName || c.name || '');
  return {
    id: it.key,
    title: d.title || '',
    authors: creators,
    year: (d.date || '').match(/\d{4}/)?.[0] || '',
    type: d.itemType || '',
    venue: d.publicationTitle || d.proceedingsTitle || d.university || d.repo || '',
    doi: d.DOI || '',
    url: d.url || '',
    abstract: (d.abstractNote || '').slice(0, 1200),
    collections: d.collections || [],
    tags: (d.tags || []).map((t) => t.tag),
  };
}

// ---------- Zotero 写入通道 ----------
// 本地 API 默认只读；写入需先 POST /api/local/authorize 由用户在 Zotero 弹窗里授权，
// 拿到 key 后所有写请求带 Zotero-API-Key + Zotero-Server-ID。
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KEYFILE = path.join(ROOT, '.dsh', 'lit-local-key.json'); // 仅存迁移标记，凭据放用户环境变量
const ZOT_KEY_ENV = 'LIT_ZOTERO_KEY';
const ZOT_SID_ENV = 'LIT_ZOTERO_SERVER_ID';

function setUserEnv(name, value) {
  if (process.platform !== 'win32') return false;
  const r = spawnSync('reg', ['add', 'HKCU\\Environment', '/v', name, '/t', 'REG_SZ', '/d', value, '/f'],
    { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

function readCred() {
  const key = process.env[ZOT_KEY_ENV] || userEnvVar(ZOT_KEY_ENV);
  const serverId = process.env[ZOT_SID_ENV] || userEnvVar(ZOT_SID_ENV);
  if (key && serverId) return { key, serverId, remember: true, source: 'user-env' };
  // 兼容旧版：文件里若还有真凭据就继续用（下一次授权会自动迁走）
  try {
    const legacy = JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
    if (legacy?.key && legacy?.serverId) return { ...legacy, source: 'file' };
  } catch { /* ignore */ }
  return null;
}
async function zotAuth(force = false) {
  let cred = force ? null : readCred();
  if (cred?.key && cred?.serverId) return cred;
  const r = await getText(`${ZOTERO}/api/users/0/items?limit=1`, { timeout: 5000 });
  const serverId = r.headers.get('zotero-server-id');
  if (!r.ok || !serverId) throw new Error('拿不到 Zotero-Server-ID：Zotero 是否运行、本地 API 是否开启？');
  process.stderr.write('  → 正在请求 Zotero 授权，请在弹窗中选「始终允许」…\n');
  const a = await fetch(`${ZOTERO}/api/local/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Zotero-Server-ID': serverId },
    body: JSON.stringify({ appName: 'DSH lit.mjs（文献检索内核）' }),
  });
  const text = await a.text();
  if (!a.ok) throw new Error(`授权失败 HTTP ${a.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text);
  cred = { key: body.key, remember: !!body.remember, serverId, savedAt: nowIso() };
  const saved = setUserEnv(ZOT_KEY_ENV, cred.key) && setUserEnv(ZOT_SID_ENV, cred.serverId);
  if (saved) {
    fs.mkdirSync(path.dirname(KEYFILE), { recursive: true });
    fs.writeFileSync(KEYFILE, j({ movedTo: 'HKCU\\Environment（LIT_ZOTERO_KEY / LIT_ZOTERO_SERVER_ID）', savedAt: cred.savedAt }), 'utf8');
    process.stderr.write(`  ✓ 已授权，凭据写入用户环境变量（${ZOT_KEY_ENV} / ${ZOT_SID_ENV}）\n`);
  } else {
    fs.mkdirSync(path.dirname(KEYFILE), { recursive: true });
    fs.writeFileSync(KEYFILE, j(cred), 'utf8');
    process.stderr.write(`  ⚠ 写用户环境变量失败，退回文件保存（${KEYFILE}）\n`);
  }
  return cred;
}
async function zotHeaders() {
  const cred = await zotAuth();
  return { 'Zotero-API-Key': cred.key, 'Zotero-Server-ID': cred.serverId };
}
async function zotWrite(p, { method = 'POST', body, headers = {}, raw, timeout = 90000 } = {}) {
  const h = { ...(await zotHeaders()), ...headers };
  let payload = raw;
  if (body !== undefined) { h['Content-Type'] = h['Content-Type'] || 'application/json'; payload = JSON.stringify(body); }
  let r;
  try {
    r = await fetch(zotPath(p), { method, headers: h, body: payload, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new Error(`Zotero 写请求超时/失败（${timeout}ms）: ${e.message}`);
  }
  return { status: r.status, ok: r.ok, text: await r.text() };
}

function creatorList(authors) {
  const arr = Array.isArray(authors) ? authors : String(authors || '').split(/[;；,、]/);
  return arr.map((a) => String(a).trim()).filter(Boolean).map((name) => {
    const parts = name.split(/\s+/);
    if (parts.length === 1) return { creatorType: 'author', name };
    return { creatorType: 'author', firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
  });
}
const TYPE_MAP = {
  'journal-article': 'journalArticle', 'proceedings-article': 'conferencePaper',
  'posted-content': 'preprint', 'book-chapter': 'bookSection', dissertation: 'thesis',
  report: 'report', book: 'book', 'reference-entry': 'bookSection',
};
function toZotItem(rec, opts = {}) {
  const item = {
    itemType: opts.type || TYPE_MAP[rec.type] || 'journalArticle',
    title: rec.title || '',
    creators: creatorList(rec.authors),
    date: rec.date || (rec.year ? String(rec.year) : ''),
    DOI: rec.doi || '',
    url: rec.url || '',
    abstractNote: rec.abstract || '',
  };
  const venue = rec.venue || rec.publicationTitle || rec.proceedingsTitle || '';
  if (venue) {
    if (item.itemType === 'conferencePaper') item.proceedingsTitle = venue;
    else if (item.itemType === 'bookSection') item.bookTitle = venue;
    else item.publicationTitle = venue;
  }
  if (opts.collection) item.collections = [opts.collection];
  const tags = opts.tags || rec.tags || [];
  if (tags.length) item.tags = tags.map((t) => ({ tag: String(t) }));
  if (rec.language) item.language = rec.language;
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}
async function findCreatedItem(item) {
  // scihub 等插件会在建条目后自动抓 PDF，写响应可能超时；条目通常已落库，用 DOI/标题回查。
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    try {
      let recs = [];
      if (item.DOI) {
        recs = (await zotAll('items', { q: item.DOI })).filter((i) => normDoi(i.data.DOI || '') === normDoi(item.DOI));
      }
      if (!recs.length && item.title) {
        recs = (await zotAll('items', { q: item.title.slice(0, 120) })).filter((i) => normTitle(i.data.title || '') === normTitle(item.title));
      }
      const hit = recs.find((i) => i.data.itemType !== 'attachment');
      if (hit) return { key: hit.key, version: hit.version, recovered: true };
    } catch { /* 回查失败，继续重试 */ }
  }
  return null;
}
async function zotCreateItem(item) {
  try {
    const r = await zotWrite('items', { body: [item] });
    if (!r.ok) throw new Error(`建条目失败 HTTP ${r.status}: ${r.text.slice(0, 400)}`);
    const ok = JSON.parse(r.text).successful;
    const first = Object.values(ok)[0];
    if (!first) throw new Error(`建条目失败: ${r.text.slice(0, 400)}`);
    return first;
  } catch (err) {
    const found = await findCreatedItem(item);
    if (found) {
      console.error(`  ! 写响应超时，但条目已落库（${found.key}）`);
      return found;
    }
    throw err;
  }
}
async function crossrefByDoi(doi) {
  const clean = String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  const headers = MAILTO ? { 'User-Agent': `lit.mjs/0.1 (mailto:${MAILTO})` } : {};
  const d = await getJson(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, { headers });
  const m = d.message || {};
  return {
    title: (m.title || [''])[0],
    authors: (m.author || []).map((a) => (a.family ? `${a.given || ''} ${a.family}`.trim() : a.name)).filter(Boolean),
    year: String(m.issued?.['date-parts']?.[0]?.[0] || ''),
    venue: (m['container-title'] || [''])[0],
    doi: clean,
    url: m.URL || '',
    type: m.type,
  };
}
async function zotGet(key) {
  return getJson(zotPath(`items/${key}`));
}
async function zotDelete(key) {
  const it = await zotGet(key);
  const version = it.version ?? it.data?.version;
  const r = await fetch(zotPath(`items/${key}`), {
    method: 'DELETE',
    headers: { ...(await zotHeaders()), 'If-Unmodified-Since-Version': String(version) },
  });
  const text = await r.text();
  if (!r.ok && r.status !== 204) throw new Error(`删除失败 HTTP ${r.status}: ${text.slice(0, 300)}`);
  return r.status;
}
async function zotAttach(parentKey, pdfPath) {
  const abs = path.resolve(String(pdfPath));
  if (!fs.existsSync(abs)) throw new Error(`PDF 不存在: ${abs}`);
  const buf = fs.readFileSync(abs);
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  const mtime = Math.round(fs.statSync(abs).mtimeMs);
  const filename = path.basename(abs);
  // 1) 建 attachment 条目
  const att = await zotCreateItem({
    itemType: 'attachment', linkMode: 'imported_file', parentItem: parentKey,
    title: 'Full Text PDF', contentType: 'application/pdf', filename, md5, mtime,
  });
  // 2) 申请上传
  const form = new URLSearchParams({ md5, filename, filesize: String(buf.length), mtime: String(mtime), contentType: 'application/pdf' });
  const a = await zotWrite(`items/${att.key}/file`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'If-None-Match': '*' },
    raw: form.toString(),
  });
  if (!a.ok) throw new Error(`上传授权失败 HTTP ${a.status}: ${a.text.slice(0, 300)}`);
  const up = JSON.parse(a.text);
  if (up.exists) return { attachment: att.key, uploaded: false, note: 'Zotero 已有同 md5 文件' };
  // 3) 传字节
  const body = Buffer.concat([Buffer.from(up.prefix || ''), buf, Buffer.from(up.suffix || '')]);
  const u = await fetch(up.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) },
    body,
  });
  if (!u.ok) throw new Error(`传字节失败 HTTP ${u.status}: ${(await u.text()).slice(0, 300)}`);
  // 4) 注册（Zotero 把暂存文件 move 进 storage/<KEY>/）
  const reg = new URLSearchParams({ upload: up.uploadKey, md5, filename, filesize: String(buf.length), mtime: String(mtime) });
  const rg = await zotWrite(`items/${att.key}/file`, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'If-None-Match': '*' },
    raw: reg.toString(),
  });
  if (!rg.ok) throw new Error(`注册上传失败 HTTP ${rg.status}: ${rg.text.slice(0, 300)}`);
  return { attachment: att.key, uploaded: true, bytes: buf.length };
}

// ---------- PDF 批量入库 ----------
function pdfFirstPageText(file) {
  const bin = process.env.LIT_PDFTOTEXT || 'pdftotext';
  const r = spawnSync(bin, ['-f', '1', '-l', '1', '-q', file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.error || !r.stdout) return '';
  return r.stdout.replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
}
async function crossrefBiblio(text, rows = 8) {
  const q = new URLSearchParams({ 'query.bibliographic': text.slice(0, 1200), rows: String(rows) });
  if (MAILTO) q.set('mailto', MAILTO);
  const url = `https://api.crossref.org/works?${q}`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const d = await getJson(url);
      return (d.message?.items || []).map((m) => ({
        title: decodeEntities((m.title || [''])[0] || ''),
        authors: (m.author || []).map((a) => (a.family ? `${a.given || ''} ${a.family}`.trim() : a.name || '')).filter(Boolean),
        year: String(m.issued?.['date-parts']?.[0]?.[0] || ''),
        venue: (m['container-title'] || [''])[0] || '',
        doi: m.DOI || '', url: m.URL || '', type: m.type || '',
      })).filter((c) => c.title);
    } catch (e) {
      lastErr = e;
      if (!/HTTP (429|500|502|503)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}
const TITLE_STOP = new Set(['the', 'and', 'for', 'with', 'via', 'its', 'from', 'into', 'based', 'using', 'towards', 'toward', 'of', 'in', 'on', 'a', 'an', 'to', 'by', 'as', 'at']);
function titleVariants(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  const out = [t];
  const head = t.split(/[:：]/)[0].trim();
  if (head.length >= 20 && head !== t) out.push(head);
  const words = t.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !TITLE_STOP.has(w.toLowerCase()));
  if (words.length >= 3) out.push(words.slice(0, 6).join(' '));
  return [...new Set(out.filter(Boolean))];
}
async function arxivTitleSearch(title) {
  const seen = new Set();
  const out = [];
  for (const v of titleVariants(title).slice(0, 3)) {
    const q = new URLSearchParams({ search_query: `ti:"${String(v).replace(/"/g, ' ').slice(0, 180)}"`, max_results: '6' });
    let xml = '';
    try {
      const r = await fetch(`https://export.arxiv.org/api/query?${q}`, { headers: { 'user-agent': UA } });
      if (!r.ok) throw new Error(`arXiv HTTP ${r.status}`);
      xml = await r.text();
    } catch { continue; }
    for (const e of xml.split('<entry>').slice(1)) {
      const pick = (tag) => decodeEntities(((new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)).exec(e) || [])[1] || '').replace(/\s+/g, ' ').trim();
      const link = pick('id');
      const id = (link.match(/abs\/([^v]+)/) || [])[1] || '';
      const key = id || pick('title');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ title: pick('title'), authors: [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1].trim()), year: (pick('published') || '').slice(0, 4), venue: 'arXiv', doi: '', url: link, arxivId: id });
    }
    if (out.length) break;
  }
  return out;
}
async function ensureCollection(name) {
  const cols = await getJson(zotPath('collections?limit=100'));
  const hit = cols.find((c) => c.data?.name === name);
  if (hit) return hit.key;
  const r = await zotWrite('collections', { body: [{ name }] });
  if (!r.ok) throw new Error(`建 collection 失败 HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  return Object.values(JSON.parse(r.text).successful)[0].key;
}
function titleFromFilename(f) {
  return path.basename(f, path.extname(f)).split('_').filter(Boolean).slice(1).join(' ').replace(/\s+/g, ' ').trim();
}

function parseMapFile(p) {
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const map = new Map();
  for (const l of lines) {
    const m = /^\|\s*([SC]\d+)\s*\|\s*([^|]+?)\s*\|/.exec(l);
    if (!m) continue;
    const cell = m[2].trim();
    if (!cell || cell === '文献' || cell === '---') continue;
    if (/^同["“]/.test(cell)) { if (!map.has(m[1])) map.set(m[1], ''); continue; }
    if (!map.get(m[1])) map.set(m[1], cell);
  }
  return map;
}
function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function splitCitation(cell) {
  const raw = String(cell);
  const year = (raw.match(/(19|20)\d{2}/g) || []).at(-1) || '';
  const s = raw.replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ');
  let segs = s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
  let venue = '';
  if (segs.length >= 2) {
    const last = segs.at(-1);
    if (/^(19|20)\d{2}$/.test(last)) {
      if (segs.length >= 3) { venue = segs.at(-2); segs = segs.slice(0, -2); } else segs = segs.slice(0, -1);
    } else if (/(19|20)\d{2}$/.test(last) && last.split(/\s+/).length <= 5 && segs.length >= 3) {
      venue = last.replace(/\s*(19|20)\d{2}$/, '').trim();
      segs = segs.slice(0, -1);
    }
  }
  const authish = /^(et al\.?|[A-Z][a-z]+( et al\.)?|[A-Z]\.\s*[A-Z][a-z]+|[\u4e00-\u9fa5]{2,4}等?)$/;
  while (segs.length > 1 && authish.test(segs[0])) segs.shift();
  return { title: segs.join(', ').trim(), year, venue: venue.replace(/\s*(19|20)\d{2}$/, '').trim() };
}
function overlapRatio(candTitle, text) {
  const tok = (s) => new Set((s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').split(' ').filter((w) => w.length >= 3));
  const a = tok(candTitle), b = tok(text);
  if (!a.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}

async function importPdfs() {
  const dir = flag('dir');
  if (!dir) die('用法: lit.mjs zot import-pdfs --dir <PDF 目录> [--map references/README.md] [--collection 名称] [--dry-run] [--report out.json]');
  const abs = path.resolve(String(dir));
  if (!fs.existsSync(abs)) die(`目录不存在: ${abs}`);
  const collName = String(flag('collection', 'second｜可重构机构（迁移）'));
  const dry = Boolean(flag('dry-run'));
  const reportPath = path.resolve(String(flag('report', path.join(abs, '..', 'import-report.json'))));
  const mapFile = flag('map') ? path.resolve(String(flag('map'))) : null;
  const citeMap = mapFile && fs.existsSync(mapFile) ? parseMapFile(mapFile) : new Map();
  const files = fs.readdirSync(abs).filter((f) => /\.pdf$/i.test(f)).sort();
  const collKey = dry ? null : await ensureCollection(collName);
  const existing = await zotAll('items', {});
  const compact = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
  const seenDoi = new Set(existing.map((i) => (i.data?.DOI || '').toLowerCase().replace(/^https?:\/\/doi\.org\//, '')).filter(Boolean));
  const seenTitle = new Set(existing.map((i) => compact(i.data?.title)));

  const report = [];
  for (const f of files) {
    const full = path.join(abs, f);
    const id = f.split('_')[0];
    const cell = /^同["“]/.test(citeMap.get(id) || '') ? '' : citeMap.get(id) || '';
    const parsed = cell ? splitCitation(cell) : { title: '', year: '', venue: '' };
    const page = pdfFirstPageText(full);
    let chosen = null, reason = '';

    const query = cell || page;
    if (query) {
      try {
        const cands = await crossrefBiblio(query);
        const ref = compact(cell) || compact(page);
        for (const c of cands) {
          const t = compact(c.title);
          if (t.length >= 20 && ref.includes(t.slice(0, Math.min(t.length, 50)))) { chosen = c; reason = 'citation-match'; break; }
        }
        if (!chosen) {
          const best = cands.map((c) => ({ c, r: overlapRatio(c.title, cell || page) })).sort((a, b) => b.r - a.r)[0];
          if (best && best.r >= 0.8) { chosen = best.c; reason = 'title-overlap'; }
        }
      } catch (e) { reason = `crossref-fail:${e.message.slice(0, 60)}`; }
    }
    if (!chosen && parsed.title) {
      try {
        const cands = await arxivTitleSearch(parsed.title);
        const best = cands.map((c) => ({ c, r: overlapRatio(c.title, parsed.title) })).sort((a, b) => b.r - a.r)[0];
        if (best && best.r >= 0.85) { chosen = best.c; reason = 'arxiv-match'; }
      } catch { /* 忽略 arXiv 失败，保留 map-only */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!reason) reason = cell ? 'map-only' : page ? 'page-only' : 'no-text';

    let title = chosen?.title || parsed.title || titleFromFilename(f);
    if (chosen?.title && parsed.title && compact(parsed.title).includes(compact(chosen.title))) title = parsed.title;
    const dupDoi = chosen?.doi && seenDoi.has(chosen.doi.toLowerCase());
    const dupTitle = seenTitle.has(compact(title));
    const entry = {
      file: f, id, title, doi: chosen?.doi || '',
      year: chosen?.year || parsed.year, venue: chosen?.venue || parsed.venue,
      authors: chosen?.authors || [],
      match: reason, duplicate: dupDoi ? 'doi' : dupTitle ? 'title' : null, zoteroKey: null, attachmentKey: null,
    };
    if (!dry && !entry.duplicate) {
      try {
        const item = toZotItem(
          { ...(chosen || {}), title, authors: chosen?.authors || [], year: entry.year, venue: entry.venue },
          { collection: collKey, tags: reason === 'map-only' || reason === 'page-only' || reason === 'no-text' ? ['lit-import', 'needs-review'] : ['lit-import'] },
        );
        const created = await zotCreateItem(item);
        const att = await zotAttach(created.key, full);
        entry.zoteroKey = created.key;
        entry.attachmentKey = att.attachment;
        if (chosen?.doi) seenDoi.add(chosen.doi.toLowerCase());
        seenTitle.add(compact(title));
      } catch (e) {
        entry.match = `create-fail:${e.message.slice(0, 120)}`;
      }
    }
    report.push(entry);
    const mark = entry.duplicate ? '·' : reason.startsWith('citation') || reason === 'title-overlap' || reason === 'arxiv-match' ? '✓' : '?';
    console.error(`  ${mark} ${id} ${(title || '').slice(0, 70)}  [${reason}]`);
    await new Promise((r) => setTimeout(r, 120));
  }
  const verifiedSet = new Set(['citation-match', 'title-overlap', 'arxiv-match']);
  const summary = {
    generatedAt: nowIso(), dir: abs, collection: collName, collectionKey: collKey,
    total: report.length,
    imported: report.filter((r) => r.zoteroKey).length,
    verified: report.filter((r) => verifiedSet.has(r.match)).length,
    unverified: report.filter((r) => !verifiedSet.has(r.match) && !r.duplicate && r.zoteroKey).length,
    duplicates: report.filter((r) => r.duplicate).length,
    failed: report.filter((r) => r.match.startsWith('create-fail')).length,
    files: report,
  };
  fs.writeFileSync(reportPath, j(summary), 'utf8');
  console.log(j({ ...summary, files: undefined, report: reportPath }));
}

// ---------- normalizers ----------
function normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
}
function keyOf(r) {
  if (r.doi) return `doi:${r.doi.toLowerCase().replace(/^https?:\/\/doi.org\//, '')}`;
  if (r.arxivId) return `arxiv:${r.arxivId}`;
  return `title:${normTitle(r.title)}`;
}

// ---------- sources ----------
async function srcArxiv(query, max) {
  const q = `search_query=all:${encodeURIComponent(query)}&start=0&max_results=${max}`;
  const { text } = await getText(`http://export.arxiv.org/api/query?${q}`);
  const out = [];
  for (const m of text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const pick = (tag) => (e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
    const idUrl = pick('id');
    out.push({
      title: pick('title'),
      authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((x) => x[1].trim()),
      year: (pick('published').match(/\d{4}/) || [''])[0],
      venue: 'arXiv',
      arxivId: idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, ''),
      doi: pick('arxiv:doi'),
      url: idUrl,
      abstract: pick('summary').slice(0, 1200),
      sources: ['arxiv'],
    });
  }
  return out;
}

async function srcCrossref(query, max) {
  const q = new URLSearchParams({ query, rows: String(max) });
  if (MAILTO) q.set('mailto', MAILTO);
  const data = await getJson(`https://api.crossref.org/works?${q}`);
  return (data.message?.items || []).map((it) => ({
    title: (it.title || [''])[0],
    authors: (it.author || []).map((a) => [a.family, a.given].filter(Boolean).join(' ')),
    year: (it.issued?.['date-parts']?.[0]?.[0] || '') + '',
    venue: (it['container-title'] || [''])[0] || it.publisher || '',
    doi: it.DOI || '',
    url: it.URL || '',
    abstract: (it.abstract || '').replace(/<[^>]+>/g, ' ').slice(0, 1200),
    citations: it['is-referenced-by-count'] ?? null,
    sources: ['crossref'],
  }));
}

function abstractFromInverted(idx) {
  if (!idx || typeof idx !== 'object') return '';
  const slots = [];
  for (const [word, poss] of Object.entries(idx)) for (const p of poss) slots[p] = word;
  return slots.filter(Boolean).join(' ').slice(0, 1600);
}

async function srcOpenAlex(query, max) {
  const q = new URLSearchParams({ search: query, 'per-page': String(Math.min(max, 50)) });
  if (MAILTO) q.set('mailto', MAILTO);
  if (OPENALEX_KEY) q.set('api_key', OPENALEX_KEY);
  const data = await getJson(`https://api.openalex.org/works?${q}`);
  const notice = data.meta?.notice;
  if (notice) console.error(`  ! openalex: ${notice}`);
  return (data.results || []).map((w) => ({
    title: w.title || w.display_name || '',
    authors: (w.authorships || []).map((a) => a.author?.display_name || ''),
    year: (w.publication_year || '') + '',
    venue: w.primary_location?.source?.display_name || '',
    doi: (w.doi || '').replace(/^https?:\/\/doi.org\//, ''),
    url: w.doi || w.id || '',
    abstract: w.abstract_inverted_index ? abstractFromInverted(w.abstract_inverted_index) : '',
    citations: w.cited_by_count ?? null,
    openAccess: w.open_access?.is_oa ?? null,
    sources: ['openalex'],
    _openalexId: w.id,
  }));
}

async function srcDblp(query, max) {
  const q = new URLSearchParams({ q: query, format: 'json', h: String(Math.min(max, 100)) });
  const data = await getJson(`https://dblp.org/search/publ/api?${q}`);
  const hits = data.result?.hits?.hit || [];
  return hits.map((h) => {
    const info = h.info || {};
    const authors = info.authors?.author;
    const list = Array.isArray(authors) ? authors : (authors ? [authors] : []);
    const ee = Array.isArray(info.ee) ? info.ee[0] : info.ee;
    return {
      title: String(info.title || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
      authors: list.map((a) => (typeof a === 'string' ? a : a?.text || '')).filter(Boolean),
      year: String(info.year || ''),
      venue: String(info.venue || ''),
      doi: String(info.doi || ''),
      url: String(info.url || ee || ''),
      abstract: '',
      citations: null,
      sources: ['dblp'],
    };
  }).filter((r) => r.title);
}

async function srcPubmed(query, max) {
  const n = Math.min(max, 50);
  const s = new URLSearchParams({ db: 'pubmed', term: query, retmode: 'json', retmax: String(n), sort: 'relevance' });
  if (MAILTO) s.set('email', MAILTO);
  const search = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${s}`);
  const ids = search.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const d = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' });
  if (MAILTO) d.set('email', MAILTO);
  const sum = await getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${d}`);
  const out = [];
  for (const id of ids) {
    const it = sum.result?.[id];
    if (!it) continue;
    const doi = (it.articleids || []).find((a) => a.idtype === 'doi')?.value || '';
    out.push({
      title: String(it.title || '').replace(/<[^>]+>/g, '').replace(/\.$/, '').trim(),
      authors: (it.authors || []).map((a) => a.name || '').filter(Boolean),
      year: (String(it.pubdate || '').match(/\d{4}/) || [''])[0],
      venue: String(it.fulljournalname || it.source || ''),
      doi,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      abstract: '',
      citations: null,
      sources: ['pubmed'],
    });
  }
  return out.filter((r) => r.title);
}

const SOURCES = { arxiv: srcArxiv, crossref: srcCrossref, openalex: srcOpenAlex, dblp: srcDblp, pubmed: srcPubmed };

// ---------- commands ----------
// 从 Zotero 的 prefs.js 读 dataDir（Zotero 运行时也可读，prefs 是明文 js）
function zoteroDataDir() {
  const base = path.join(process.env.APPDATA || '', 'Zotero', 'Zotero', 'Profiles');
  try {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'prefs.js');
      if (!fs.existsSync(p)) continue;
      const m = fs.readFileSync(p, 'utf8')
        .match(/"extensions\.zotero\.dataDir"\s*,\s*"((?:[^"\\]|\\.)*)"/);
      if (m) return m[1].replace(/\\\\/g, '\\');
    }
  } catch { /* ignore */ }
  return null;
}

function inspectDataDir(dir, live = false) {
  const issues = [];
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (!/^zotero\.sqlite-(journal|wal)$/.test(f)) continue;
    const sz = fs.statSync(path.join(dir, f)).size;
    if (live) continue;
    if (f.endsWith('journal') || sz > 0) issues.push(`${f} 非空，库未干净关闭（Zotero 可能正在运行，关掉再查）`);
  }
  const bad = files.filter((f) => /Conflict.*\.sqlite$|\.damaged$/.test(f));
  if (bad.length) issues.push(`${bad.length} 个损坏/冲突库未隔离`);
  if (/OneDrive|SynologyDrive|Dropbox|GoogleDrive|坚果云|Nutstore/i.test(dir)) {
    issues.push('数据目录在同步盘/云盘下，字节级复制会写坏 SQLite');
  }
  let attachments = 0, bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else { attachments++; try { bytes += fs.statSync(fp).size; } catch { /* placeholder */ } }
    }
  };
  const storage = path.join(dir, 'storage');
  if (fs.existsSync(storage)) walk(storage);
  return { issues, attachments, storageMB: +(bytes / 1048576).toFixed(1) };
}

async function doctor() {
  const report = { time: nowIso(), node: process.version, checks: [] };
  const push = (name, ok, detail, soft) => report.checks.push({ name, ok, detail, ...(soft ? { soft: true } : {}) });

  const zup = await zoteroUp();
  const dataDir = zoteroDataDir();
  if (!dataDir) push('zotero-data', false, 'prefs.js 中未找到 dataDir');
  else {
    try {
      const r = inspectDataDir(dataDir, zup);
      push('zotero-data', r.issues.length === 0,
        `${dataDir} | 附件 ${r.attachments} 个 / ${r.storageMB} MB` +
        (r.issues.length ? ` | 问题: ${r.issues.join('; ')}` : ''));
    } catch (e) { push('zotero-data', false, `${dataDir}: ${e.message}`); }
  }

  push('zotero-local-api', zup, zup ? `${ZOTERO} 可读` : '不可读（Zotero 未运行或本地 API 关闭）');

  if (zup) {
    try {
      const items = await getJson(zotPath('items?limit=1'));
      const total = (await getText(zotPath('items?limit=1'))).headers.get('total-results');
      const cols = await getJson(zotPath('collections?limit=100'));
      push('zotero-library', true, `items=${total ?? '?'} collections=${cols.length}`);
    } catch (e) { push('zotero-library', false, e.message); }
  }

  try {
    const c = readCred();
    push('zotero-key', !!c, c ? `${c.source} | ${String(c.key).slice(0, 6)}…` : '未授权（首次写入时 Zotero 会弹窗）');
  } catch (e) { push('zotero-key', false, e.message); }

  for (const [name, fn, q, soft] of [
    ['arxiv', srcArxiv, 'reconfigurable robot'],
    ['crossref', srcCrossref, 'reconfigurable robot'],
    ['openalex', srcOpenAlex, 'reconfigurable robot'],
    ['dblp', srcDblp, 'reconfigurable modular robot', true],
    ['pubmed', srcPubmed, 'modular robot'],
  ]) {
    try {
      const t0 = Date.now();
      const r = await fn(q, 2);
      push(`source-${name}`, r.length > 0, `${r.length} 条 / ${Date.now() - t0}ms`, soft);
    } catch (e) { push(`source-${name}`, false, e.message.slice(0, 160), soft); }
  }

  const keyDetail = OPENALEX_KEY_SOURCE === 'none'
    ? '未配置（走 OpenAlex 共享额度 $0.10/天/IP）'
    : `${OPENALEX_KEY_SOURCE} | ${OPENALEX_KEY.slice(0, 4)}****（长度 ${OPENALEX_KEY.length}）`;
  push('openalex-key', OPENALEX_KEY_SOURCE !== 'file', keyDetail);

  const py = (() => {
    try { return fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.dsh', 'skills', 'aris', 'tools')); } catch { return false; }
  })();
  push('aris-tools', py, py ? '.dsh/skills/aris/tools 存在' : '未找到');

  console.log(j(report));
  const bad = report.checks.filter((c) => !c.ok && !c.soft);
  process.exit(bad.length ? 2 : 0);
}

async function zot() {
  await needZotero();
  if (sub === 'stats') {
    const total = (await getText(zotPath('items?limit=1'))).headers.get('total-results');
    const cols = await getJson(zotPath('collections?limit=100'));
    const items = await zotAll('items', {});
    const byType = {};
    for (const it of items) { const t = it.data.itemType; byType[t] = (byType[t] || 0) + 1; }
    console.log(j({ total: Number(total), collections: cols.map((c) => ({ key: c.key, name: c.data.name, parent: c.data.parentCollection || null })), byType }));
    return;
  }
  if (sub === 'search') {
    const q = positional(2).join(' ');
    if (!q) die('用法: lit.mjs zot search "<query>"');
    const limit = Number(flag('limit', 20));
    const collection = flag('collection');
    const params = { q, limit: String(limit) };
    if (collection) params['collection'] = collection;
    const items = await getJson(zotPath(`items?${new URLSearchParams(params)}`));
    const recs = items.filter((i) => i.data.itemType !== 'attachment').map(zotToRecord);
    if (flag('json')) { console.log(j(recs)); return; }
    for (const r of recs) console.log(`${r.year || '????'}  ${r.title}\n        ${r.venue || '—'}  ${r.doi || r.url || ''}`);
    console.error(`\n${recs.length} 条`);
    return;
  }
  if (sub === 'bib') {
    const out = String(flag('out', 'refs.bib'));
    const collection = flag('collection');
    let collKey = null;
    if (collection) {
      const cols = await getJson(zotPath('collections?limit=100'));
      collKey = (cols.find((c) => c.key === collection || c.data?.name === collection) || {}).key || null;
      if (!collKey) die(`找不到 collection: ${collection}`);
    }
    const items = await zotAll(collKey ? `collections/${collKey}/items` : 'items', {});
    const keys = items.filter((i) => i.data.itemType !== 'attachment').map((i) => i.key);
    let bib = '';
    for (let i = 0; i < keys.length; i += 50) {
      const chunk = keys.slice(i, i + 50);
      const r = await getText(zotPath(`items?itemKey=${chunk.join(',')}&format=bibtex&limit=100`));
      if (!r.ok) throw new Error(`bibtex HTTP ${r.status}: ${r.text.slice(0, 200)}`);
      bib += r.text + '\n';
    }
    if (flag('no-file')) bib = bib.replace(/^\s*file = \{.*\},?\r?\n/gm, '');
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, bib, 'utf8');
    console.error(`写入 ${out}（${keys.length} 条）`);
    return;
  }
  if (sub === 'auth') {
    const cred = await zotAuth(Boolean(flag('force')));
    console.log(j({ ok: true, keyPrefix: cred.key.slice(0, 6) + '…', remember: cred.remember, serverId: cred.serverId, source: cred.source || 'user-env' }));
    return;
  }
  if (sub === 'get') {
    const key = positional(2)[0];
    if (!key) die('用法: lit.mjs zot get <KEY>');
    const it = await zotGet(key);
    console.log(j({ key: it.key, version: it.version, data: it.data }));
    return;
  }
  if (sub === 'patch') {
    const mf = flag('manifest');
    if (!mf) die('用法: lit.mjs zot patch --manifest patch.json [--dry-run]\n  清单格式: [{ key, authors?: [...], patch: { publicationTitle, volume, issue, pages, DOI, date, language, extra } }]');
    const doc = JSON.parse(fs.readFileSync(path.resolve(String(mf)), 'utf8'));
    const list = Array.isArray(doc) ? doc : (doc.items || []);
    const dry = Boolean(flag('dry-run'));
    let ok = 0, fail = 0;
    for (const e of list) {
      const key = e.key || e.zoteroKey;
      if (!key) { console.error('跳过一条：缺少 key'); fail++; continue; }
      const it = await zotGet(key);
      const base = it.data;
      const patch = { ...(e.patch || {}) };
      if (e.authors) patch.creators = creatorList(e.authors);
      const body = { ...base };
      for (const [f, v] of Object.entries(patch)) { if (v === null) delete body[f]; else body[f] = v; }
      delete body.key; delete body.version;
      if (dry) { console.log(`${key}  ${String(base.title || '').slice(0, 50)}\n   → ${JSON.stringify(patch).slice(0, 240)}`); ok++; continue; }
      const r = await zotWrite(`items/${key}`, {
        method: 'PUT', body, headers: { 'If-Unmodified-Since-Version': String(it.version) },
      });
      if (r.ok) { ok++; console.log(`✓ ${key}  ${String(base.title || '').slice(0, 50)}`); }
      else { fail++; console.error(`✗ ${key} HTTP ${r.status} ${r.text.slice(0, 200)}`); }
    }
    console.log(`patched ${ok} / failed ${fail}`);
    if (fail) process.exit(2);
    return;
  }
  if (sub === 'rm' || sub === 'del') {
    const key = positional(2)[0];
    if (!key) die('用法: lit.mjs zot rm <KEY> [--yes]');
    if (!flag('yes')) {
      const it = await zotGet(key);
      console.error(`将删除 ${key}  ${it.data?.itemType}  ${it.data?.title || it.data?.filename || ''}`);
      die('加 --yes 确认删除（进 Zotero 回收站，不是永久删除）');
    }
    const status = await zotDelete(key);
    console.log(`已删除 ${key}（HTTP ${status}，进回收站）`);
    return;
  }
  if (sub === 'dedupe') {
    const reportPath = flag('report');
    const coll = flag('collection');
    if (!reportPath && !coll) die('用法: lit.mjs zot dedupe --report import-report.json [--dry-run] | --collection <名称> [--dry-run]');
    let keep = new Map(), collKey = null;
    if (reportPath) {
      const rep = JSON.parse(fs.readFileSync(path.resolve(String(reportPath)), 'utf8'));
      const list = rep.files || rep.items || (Array.isArray(rep) ? rep : []);
      for (const e of list) if (e.zoteroKey && e.attachmentKey) keep.set(e.zoteroKey, e.attachmentKey);
    }
    if (coll) {
      const cols = await getJson(zotPath('collections?limit=100'));
      collKey = (cols.find((c) => c.data?.name === String(coll)) || {}).key || null;
      if (!collKey) die(`找不到 collection: ${coll}`);
    }
    const all = await zotAll(collKey ? `collections/${collKey}/items` : 'items', {});
    const byParent = new Map();
    for (const i of all) {
      if (i.data.itemType !== 'attachment' || !i.data.parentItem) continue;
      const p = i.data.parentItem;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(i);
    }
    const dry = Boolean(flag('dry-run'));
    let removed = 0;
    const targets = keep.size ? [...byParent.entries()].filter(([p]) => keep.has(p)) : [...byParent.entries()];
    for (const [parent, atts] of targets) {
      if (atts.length < 2) continue;
      const want = keep.get(parent);
      const keeper = want ? atts.find((a) => a.key === want) : atts.find((a) => /^[A-Za-z0-9]/.test(a.data.filename || ''));
      if (!keeper) { console.error(`  ? ${parent} 无法判定保留哪个，跳过`); continue; }
      for (const a of atts) {
        if (a.key === keeper.key) continue;
        if (dry) { console.error(`  · ${parent} 将删 ${a.key} ${(a.data.filename || '').slice(0, 50)}`); removed++; continue; }
        await zotDelete(a.key);
        console.error(`  - ${parent} 删除重复附件 ${a.key} ${(a.data.filename || '').slice(0, 50)}`);
        removed++;
      }
    }
    console.log(j({ dryRun: dry, parentsWithDuplicate: [...byParent.values()].filter((v) => v.length > 1).length, removed }));
    return;
  }
  if (sub === 'attach') {
    const [parentKey, pdf] = positional(2);
    if (!parentKey || !pdf) die('用法: lit.mjs zot attach <PARENT_KEY> <file.pdf>');
    const r = await zotAttach(parentKey, pdf);
    console.log(j({ parent: parentKey, ...r }));
    return;
  }
  if (sub === 'add') {
    const doi = flag('doi');
    const pdf = flag('pdf');
    const collection = flag('collection');
    const tags = flag('tag') ? [].concat(flag('tag')) : [];
    let rec;
    if (doi) {
      rec = await crossrefByDoi(String(doi));
      console.error(`  crossref: ${rec.title || '(无题)'} ${rec.year} ${rec.venue || ''}`);
    } else {
      rec = {
        title: flag('title'), authors: flag('authors'), year: flag('year'),
        venue: flag('venue'), doi: '', url: flag('url'), type: flag('type'),
      };
      if (!rec.title) die('用法: lit.mjs zot add --doi <DOI> [--pdf f.pdf] | --title "..." [--authors "A B;C D"] [--year 2024] [--venue "..."]');
    }
    if (flag('title')) rec.title = flag('title');
    if (flag('authors')) rec.authors = String(flag('authors'));
    if (flag('year')) rec.year = String(flag('year'));
    if (flag('venue')) rec.venue = flag('venue');
    const item = toZotItem(rec, { type: flag('type'), collection, tags });
    const created = await zotCreateItem(item);
    const out = { key: created.key, version: created.version, title: item.title, type: item.itemType, collection: collection || null };
    if (pdf) out.attachment = await zotAttach(created.key, String(pdf));
    console.log(j(out));
    return;
  }
  if (sub === 'import') {
    const file = positional(2)[0];
    if (!file) die('用法: lit.mjs zot import <papers.json> [--pdf-dir DIR] [--collection KEY]');
    const payload = JSON.parse(fs.readFileSync(path.resolve(String(file)), 'utf8'));
    const recs = Array.isArray(payload) ? payload : payload.records || [];
    const collection = flag('collection');
    const pdfDir = flag('pdf-dir');
    const dry = Boolean(flag('dry-run'));
    let ok = 0, fail = 0, attached = 0;
    for (const rec of recs) {
      try {
        if (dry) { console.error(`  [dry] ${rec.title}`); ok++; continue; }
        const created = await zotCreateItem(toZotItem(rec, { collection, tags: ['lit-import'] }));
        ok++;
        const cand = rec.pdfPath || (pdfDir ? path.join(String(pdfDir), `${rec.key || ''}.pdf`) : null);
        if (cand && fs.existsSync(cand)) {
          await zotAttach(created.key, cand);
          attached++;
        }
        console.error(`  ✓ ${created.key}  ${(rec.title || '').slice(0, 70)}`);
      } catch (e) {
        fail++;
        console.error(`  ✗ ${(rec.title || '').slice(0, 60)} — ${e.message.slice(0, 120)}`);
      }
    }
    console.log(j({ total: recs.length, created: ok, attached, failed: fail }));
    return;
  }
  if (sub === 'import-pdfs') { await importPdfs(); return; }
  die('用法: lit.mjs zot <stats|search|bib|get|add|attach|rm|import|import-pdfs|auth>');
}

// ---------- 检索：领域画像、过滤、打分 ----------
const PROFILES = {
  robot: {
    label: '机器人 / 机构学',
    require: ['robot', 'mechanism', 'modular', 'reconfigur', 'metamorph', 'morpholog', 'manipulat',
      'actuator', 'kinematic', 'tensegrity', 'gripper', 'self-assembl', 'swarm', 'locomotion',
      '机器人', '构型', '机构', '重构', '模块化'],
    exclude: ['software testing', 'test oracle', 'mutation testing', 'program repair', 'compiler testing'],
  },
};
function termRe(t) {
  return new RegExp(`(^|[^a-z0-9])${String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}
function termHits(text, terms) {
  let n = 0;
  for (const t of terms) if (termRe(t).test(text)) n++;
  return n;
}
function scoreRec(r) {
  const cit = Math.log1p(Number(r.citations) || 0) / Math.log(1000);
  const yr = Number(r.year) || 0;
  const rec = yr ? Math.max(0, Math.min(1, (yr - 2000) / 26)) : 0;
  const src = Math.min(1, (r.sources || []).length / 3);
  return Number((0.5 * src + 0.35 * Math.min(cit, 1.5) + 0.15 * rec).toFixed(3));
}
function mergeInto(prev, r) {
  prev.sources = [...new Set([...prev.sources, ...(r.sources || [])])];
  for (const f of ['doi', 'arxivId', 'abstract', 'url', 'venue']) if (!prev[f] && r[f]) prev[f] = r[f];
  if (!prev.year && r.year) prev.year = r.year;
  if ((prev.citations == null) && r.citations != null) prev.citations = r.citations;
  if ((r.citations || 0) > (prev.citations || 0)) prev.citations = r.citations;
  if ((r.authors || []).length > (prev.authors || []).length) prev.authors = r.authors;
  if (!prev.title && r.title) prev.title = r.title;
  return prev;
}

async function runSearch(cfg) {
  const {
    q, variants = [], list = ['arxiv', 'crossref', 'openalex'], max = 30,
    profName = 'none', require: requireList = [], exclude: excludeList = [],
    yearMin = 0, minScore = 0, top = 0, quiet = false,
  } = cfg;
  const say = (m) => { if (!quiet) process.stderr.write(m); };
  const runs = [q, ...variants];
  const merged = new Map();
  const sourceErrors = [];
  for (const name of list) {
    const fn = SOURCES[name];
    if (!fn) { console.error(`  ! 未知源 ${name}`); continue; }
    for (const [qi, query] of runs.entries()) {
      say(`  → ${name}${qi ? ` (变体${qi}: ${query.slice(0, 24)}…)` : ''} … `);
      try {
        const recs = await fn(query, max);
        let added = 0;
        for (const r of recs) {
          const k = keyOf(r);
          if (merged.has(k)) mergeInto(merged.get(k), r);
          else { merged.set(k, r); added++; }
        }
        say(`${recs.length} 条（新增 ${added}）\n`);
      } catch (e) { say(`失败: ${e.message.slice(0, 160)}\n`); sourceErrors.push({ source: name, query, message: String(e.message).slice(0, 200) }); }
    }
  }

  const seen = new Set();
  const deduped = [...merged.values()].filter((r) => {
    const t = normTitle(r.title);
    if (!t || seen.has(t)) return false;
    seen.add(t); return true;
  });

  let droppedIrrelevant = 0;
  let droppedYear = 0;
  const scored = [];
  for (const r of deduped) {
    const text = `${r.title || ''} ${r.abstract || ''}`;
    if (requireList.length && termHits(text, requireList) === 0) { droppedIrrelevant++; continue; }
    if (excludeList.length && termHits(text, excludeList) > 0) { droppedIrrelevant++; continue; }
    if (yearMin && Number(r.year || 0) < yearMin) { droppedYear++; continue; }
    r.score = scoreRec(r);
    if (r.score < minScore) continue;
    scored.push(r);
  }
  scored.sort((a, b) => b.score - a.score || (b.citations || 0) - (a.citations || 0));
  const records = top > 0 ? scored.slice(0, top) : scored;

  say(`  画像 ${profName} | 原始 ${merged.size} → 去重 ${deduped.length} → 过滤 -${droppedIrrelevant} 不相关 / -${droppedYear} 年份 → 保留 ${scored.length}\n`);
  return {
    payload: {
      query: q, expanded: variants, profile: profName, retrievedAt: nowIso(), sources: list, sourceErrors,
      total: records.length, scanned: deduped.length,
      records,
    },
    stats: { raw: merged.size, deduped: deduped.length, droppedIrrelevant, droppedYear, scored: scored.length },
  };
}

async function find() {
  const q = positional(1).join(' ');
  if (!q) die('用法: lit.mjs find "<query>" [--sources arxiv,crossref,openalex] [--profile robot|none|auto] [--require a,b] [--exclude a,b] [--expand "变体1;变体2"] [--year-min 2015] [--min-score 0.3] [--top 20]');
  const list = String(flag('sources', 'arxiv,crossref,openalex')).split(',').map((s) => s.trim()).filter(Boolean);
  const max = Number(flag('max', 30));
  const out = flag('out');
  let profName = String(flag('profile', 'auto')).toLowerCase();
  if (profName === 'auto') profName = /robot|mechanism|modular|reconfigur|morpholog|机器人|机构|重构/i.test(q) ? 'robot' : 'none';
  const prof = PROFILES[profName] || null;
  if (profName !== 'auto' && profName !== 'none' && !prof) die(`未知画像 ${profName}（可选 ${Object.keys(PROFILES).join('/')}/none/auto）`);
  const requireList = [...(prof?.require || []), ...String(flag('require', '')).split(',').map((s) => s.trim()).filter(Boolean)];
  const excludeList = [...(prof?.exclude || []), ...String(flag('exclude', '')).split(',').map((s) => s.trim()).filter(Boolean)];
  const yearMin = Number(flag('year-min', 0)) || 0;
  const minScore = Number(flag('min-score', 0)) || 0;
  const variants = String(flag('expand', '')).split(';').map((s) => s.trim()).filter(Boolean);
  const { payload } = await runSearch({
    q, variants, list, max, profName, require: requireList, exclude: excludeList,
    yearMin, minScore, top: Number(flag('top', 0)) || 0,
  });
  if (out) { fs.writeFileSync(String(out), j(payload), 'utf8'); console.error(`写入 ${out}（${payload.total} 条）`); }
  else console.log(j(payload));
}

async function index() {
  const project = path.resolve(String(flag('project', '.')));
  const out = String(flag('out', path.join(project, 'references', 'index.json')));
  if (!fs.existsSync(project)) die(`项目目录不存在: ${project}`);
  const refs = path.join(project, 'references');
  const pdfs = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.pdf$/i.test(e.name)) {
        const st = fs.statSync(p);
        pdfs.push({ file: path.relative(project, p).replaceAll('\\', '/'), size: st.size, mtime: st.mtime.toISOString() });
      }
    }
  };
  walk(refs);
  let zitems = [];
  if (await zoteroUp()) {
    const items = await zotAll('items', {});
    zitems = items.filter((i) => i.data.itemType !== 'attachment').map(zotToRecord);
  }
  const zByTitle = new Map(zitems.map((z) => [normTitle(z.title), z]));
  const zById = new Map(zitems.map((z) => [z.id, z]));
  const repPath = path.join(refs, 'import-report.json');
  const byFile = new Map();
  if (fs.existsSync(repPath)) {
    try {
      const rep = JSON.parse(fs.readFileSync(repPath, 'utf8'));
      for (const e of rep.files || rep.items || []) if (e.file && e.zoteroKey) byFile.set(e.file, e);
    } catch { /* 报告损坏就退回标题匹配 */ }
  }
  for (const p of pdfs) {
    const base = path.basename(p.file, '.pdf').replace(/^S\d+_/, '').replace(/[_-]+/g, ' ');
    p.titleGuess = base;
    const rep = byFile.get(path.basename(p.file));
    if (rep) { p.zoteroKey = rep.zoteroKey; p.attachmentKey = rep.attachmentKey; p.match = rep.match; p.doi = rep.doi || ''; }
    else p.zoteroKey = zByTitle.get(normTitle(base))?.id || null;
    const live = p.zoteroKey ? zById.get(p.zoteroKey) : null;
    if (live) {
      p.title = live.title; p.authors = live.authors; p.year = live.year;
      p.venue = live.venue; p.doi = live.doi || p.doi || ''; p.itemType = live.type;
    }
  }
  const payload = {
    generatedAt: nowIso(),
    project,
    zotero: { available: zitems.length > 0, items: zitems.length },
    pdfs: { total: pdfs.length, linked: pdfs.filter((p) => p.zoteroKey).length },
    files: pdfs,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, j(payload), 'utf8');
  console.log(`index → ${out}\n  PDF ${payload.pdfs.total} 篇，已匹配 Zotero ${payload.pdfs.linked} 篇`);
}

// ---------- BibTeX 解析与对账 ----------
function parseBibFields(body) {
  const out = {};
  let i = 0;
  while (i < body.length) {
    const fm = /([a-zA-Z]+)\s*=\s*/y;
    fm.lastIndex = i;
    const mm = fm.exec(body);
    if (!mm) { i++; continue; }
    i = fm.lastIndex;
    let val = '';
    if (body[i] === '{') {
      const s = i; let depth = 0;
      do { if (body[i] === '{') depth++; else if (body[i] === '}') depth--; i++; } while (i < body.length && depth > 0);
      val = body.slice(s + 1, i - 1);
    } else if (body[i] === '"') {
      const s = ++i;
      while (i < body.length && body[i] !== '"') i++;
      val = body.slice(s, i); i++;
    } else {
      const s = i;
      while (i < body.length && !/[,\n]/.test(body[i])) i++;
      val = body.slice(s, i);
    }
    out[mm[1].toLowerCase()] = val.replace(/\s+/g, ' ').trim();
  }
  return out;
}
function parseBib(text) {
  const entries = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 1, i = re.lastIndex;
    while (i < text.length && depth > 0) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; i++; }
    const body = text.slice(re.lastIndex, i - 1);
    entries.push({ type: m[1].toLowerCase(), key: m[2], ...parseBibFields(body) });
    re.lastIndex = i;
  }
  return entries;
}
function cleanTex(s) {
  return String(s || '').replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, '').replace(/~/g, ' ');
}
function normDoi(d) {
  return String(d || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/[?#].*$/, '').trim();
}

async function reconcile() {
  const bibPath = flag('bib');
  if (!bibPath) die('用法: lit.mjs reconcile --bib refs.bib --collection <名|KEY> [--out 报告.md] [--miss-out miss.json]');
  const coll = String(flag('collection', ''));
  if (!coll) die('reconcile 需要 --collection（Zotero collection 名或 key）');
  const items = await zotAll('items', {});
  const cols = await getJson(zotPath('collections?limit=100'));
  const collKey = (cols.find((c) => c.key === coll || c.data?.name === coll) || {}).key;
  if (!collKey) die(`找不到 collection: ${coll}`);
  const inColl = items.filter((i) => i.data.itemType !== 'attachment' && (i.data.collections || []).includes(collKey));
  const zot = inColl.map((i) => ({ ...zotToRecord(i), itemKey: i.key }));
  const zDoi = new Map(zot.filter((z) => z.doi).map((z) => [normDoi(z.doi), z]));
  const zTitle = new Map(zot.map((z) => [normTitle(cleanTex(z.title)), z]));

  const bib = parseBib(fs.readFileSync(String(bibPath), 'utf8'));
  const used = new Set();
  const rows = bib.map((b) => {
    const title = cleanTex(b.title);
    const doi = normDoi(b.doi);
    let hit = doi ? zDoi.get(doi) : null;
    let how = hit ? 'doi' : '';
    if (!hit) {
      hit = zTitle.get(normTitle(title)) || null;
      if (hit) how = 'title';
    }
    if (hit) used.add(hit.itemKey);
    return { key: b.key, title: title.slice(0, 120), year: b.year || '', doi, zoteroKey: hit?.itemKey || null, how };
  });
  const missing = rows.filter((r) => !r.zoteroKey);
  const unused = zot.filter((z) => !used.has(z.itemKey));

  const report = {
    generatedAt: nowIso(), bib: path.resolve(String(bibPath)), collection: { name: coll, key: collKey },
    summary: { bibEntries: bib.length, matched: bib.length - missing.length, missingInZotero: missing.length, inCollectionNotCited: unused.length },
    missing, inCollectionNotCited: unused.map((z) => ({ itemKey: z.itemKey, title: z.title, year: z.year, doi: z.doi })),
  };
  const missOut = flag('miss-out');
  if (missOut) { fs.mkdirSync(path.dirname(path.resolve(String(missOut))), { recursive: true }); fs.writeFileSync(String(missOut), j(missing), 'utf8'); }
  const out = flag('out');
  if (out) {
    const md = [
      `# 文献对账：${path.basename(String(bibPath))} ↔ ${coll}`, '',
      `生成于 ${report.generatedAt}`,
      `- bib 条目：${bib.length}`,
      `- 已对上：${bib.length - missing.length}`,
      `- bib 有、库中没有：${missing.length}`,
      `- 库中有、bib 未引用：${unused.length}`, '',
      '## bib 有、库中没有', '',
      ...(missing.length ? missing.map((r) => `- ${r.year} ${r.title}${r.doi ? `（${r.doi}）` : ''}`) : ['（无）']),
      '', '## 库中有、bib 未引用', '',
      ...(unused.length ? unused.map((z) => `- ${z.year} ${z.title}`) : ['（无）']),
    ].join('\n');
    fs.mkdirSync(path.dirname(path.resolve(String(out))), { recursive: true });
    fs.writeFileSync(String(out), md + '\n', 'utf8');
  }
  console.log(j({ ...report.summary, report: out || null, missingList: missOut || null }));
}

function jaccard(a, b) {
  const A = new Set(normTitle(cleanTex(a)).split(' ').filter(Boolean));
  const B = new Set(normTitle(cleanTex(b)).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function titleMatch(a, b) {
  const A = new Set(normTitle(cleanTex(a)).split(' ').filter(Boolean));
  const B = new Set(normTitle(cleanTex(b)).split(' ').filter(Boolean));
  if (!A.size || !B.size) return { ok: false, score: 0, shared: 0 };
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  const jac = shared / (A.size + B.size - shared);
  const cov = shared / Math.min(A.size, B.size);
  const score = Math.max(jac, cov);
  return { ok: jac >= 0.85 || (cov >= 0.9 && shared >= 4), score, shared };
}

async function resolveOne(entry) {
  const title = cleanTex(entry.title || '');
  const year = Number(entry.year) || 0;
  const out = { inputKey: entry.key || '', title, year, doi: normDoi(entry.doi), source: '', score: 0, record: null };
  const yearOk = (cand, sc) => !year || Math.abs((Number(cand.year) || 0) - year) <= (sc >= 0.95 ? 2 : 1);
  if (out.doi) {
    try {
      const rec = await crossrefByDoi(out.doi);
      if (rec && rec.title) { out.record = rec; out.source = 'doi'; out.score = 1; out.matched = rec.title; return out; }
    } catch { /* DOI 查不到就退回标题检索 */ }
  }
  let best = null;
  const variants = titleVariants(title);
  for (const v of variants) {
    try {
      for (const c of await crossrefBiblio(v, 5)) {
        const m = titleMatch(title, c.title);
        if (m.ok && yearOk(c, m.score) && (!best || m.score > best.score)) best = { ...c, score: m.score };
      }
    } catch { /* 忽略，试下一变体 */ }
    if (best) { out.source = 'crossref'; break; }
  }
  if (!best) {
    for (const v of variants) {
      try {
        for (const c of await srcOpenAlex(v, 5)) {
          const m = titleMatch(title, c.title);
          if (m.ok && yearOk(c, m.score) && (!best || m.score > best.score)) best = { ...c, score: m.score };
        }
      } catch { /* 无 OpenAlex 结果 */ }
      if (best) { out.source = 'openalex'; break; }
    }
  }
  if (!best) {
    try {
      for (const a of await arxivTitleSearch(title)) {
        const m = titleMatch(title, a.title);
        if (m.ok && yearOk(a, m.score)) {
          best = { ...a, sources: ['arxiv'], score: m.score };
          out.source = 'arxiv';
          break;
        }
      }
    } catch { /* 无 arXiv 记录 */ }
  }
  if (best) { out.record = best; out.matched = best.title; out.score = Number((best.score || 0).toFixed(3)); if (!out.source) out.source = 'crossref'; }
  return out;
}

async function fill() {
  const input = flag('bib-missing') || flag('input');
  if (!input) die('用法: lit.mjs fill --bib-missing bib-missing.json --collection <名|key> [--tags lit-fill] [--max 50] [--import] [--report out.json]');
  const collName = flag('collection');
  if (!collName) die('fill 需要 --collection（Zotero collection 名或 key）');
  const doImport = Boolean(flag('import'));
  const max = Number(flag('max', 50)) || 50;
  const entries = JSON.parse(fs.readFileSync(String(input), 'utf8'));
  const list = (Array.isArray(entries) ? entries : entries.missing || []).slice(0, max);
  const cols = await getJson(zotPath('collections?limit=100'));
  const collKey = (cols.find((c) => c.key === collName || c.data?.name === collName) || {}).key;
  if (!collKey) die(`找不到 collection: ${collName}`);
  const existing = (await zotAll('items', {})).filter((i) => i.data.itemType !== 'attachment');
  const haveDoi = new Set(existing.filter((i) => i.data.DOI).map((i) => normDoi(i.data.DOI)));
  const haveTitle = new Set(existing.map((i) => normTitle(i.data.title || '')));

  const resolved = [];
  const unresolved = [];
  const skipped = [];
  for (const [i, e] of list.entries()) {
    process.stderr.write(`  [${i + 1}/${list.length}] ${String(e.title).slice(0, 48)} … `);
    let r;
    try { r = await resolveOne(e); } catch (err) { r = { ...e, source: 'error', error: err.message.slice(0, 120) }; }
    if (!r.record) { unresolved.push({ key: r.inputKey, title: r.title, year: r.year, reason: r.error || 'not-found' }); console.error('未找到'); continue; }
    const dup = (r.record.doi && haveDoi.has(normDoi(r.record.doi))) || haveTitle.has(normTitle(r.record.title));
    if (dup) { skipped.push({ key: r.inputKey, title: r.record.title, reason: 'already-in-library' }); console.error(`已在库（${r.source}）`); continue; }
    if (doImport) {
      try {
        const tags = [String(flag('tags', 'lit-fill'))];
        if (r.score < 0.9) tags.push('needs-review');
        const item = toZotItem(r.record, { collection: collKey, tags });
        const created = await zotCreateItem(item);
        r.zoteroKey = created.key;
        if (r.record.doi) haveDoi.add(normDoi(r.record.doi));
        haveTitle.add(normTitle(r.record.title));
      } catch (err) { r.importError = err.message.slice(0, 160); }
    }
    resolved.push(r);
    console.error(r.zoteroKey ? `✓ ${r.zoteroKey}` : `可补（${r.source} ${r.score}）`);
  }
  const report = {
    generatedAt: nowIso(), dryRun: !doImport, collection: { name: collName, key: collKey },
    summary: { input: list.length, resolved: resolved.length, imported: resolved.filter((r) => r.zoteroKey).length, skipped: skipped.length, unresolved: unresolved.length },
    resolved: resolved.map((r) => ({ key: r.inputKey, title: r.record.title, year: r.record.year, doi: r.record.doi || '', venue: r.record.venue || '', source: r.source, score: r.score, zoteroKey: r.zoteroKey || null, importError: r.importError || null })),
    skipped, unresolved,
  };
  const out = flag('report');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(String(out))), { recursive: true }); fs.writeFileSync(String(out), j(report), 'utf8'); }
  console.log(j({ ...report.summary, report: out || null }));
}

async function unpaywall(doi) {
  const email = MAILTO || 'dsh@example.com';
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function oaFromOpenAlex(doi) {
  const u = new URL(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
  if (OPENALEX_KEY) u.searchParams.set('api_key', OPENALEX_KEY);
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  const w = await r.json();
  const locs = [w.best_oa_location, w.primary_location, ...(w.locations || [])].filter(Boolean);
  for (const l of locs) if (l.pdf_url) return { url: l.pdf_url, host: l.source?.display_name || l.landing_page_url || 'openalex', version: l.version || '' };
  for (const l of locs) if (l.is_oa && l.landing_page_url) return { url: l.landing_page_url, host: l.source?.display_name || 'openalex', version: l.version || '', landing: true };
  return null;
}

async function oaFromCrossref(doi) {
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': `DSH-lit/1.0 (mailto:${MAILTO || 'dsh@example.com'})` } });
  if (!r.ok) return null;
  const w = (await r.json()).message || {};
  for (const l of w.link || []) if (/pdf/i.test(l['content-type'] || '')) return { url: l.URL, host: 'crossref-link', version: '' };
  return null;
}

async function resolveOa(doi) {
  const errs = [];
  for (const [name, fn] of [['openalex', oaFromOpenAlex], ['crossref', oaFromCrossref]]) {
    try { const hit = await fn(doi); if (hit) return hit; } catch (e) { errs.push(`${name}:${e.message.slice(0, 60)}`); }
  }
  try { const up = await unpaywall(doi); const hit = pdfUrlOf(up); if (hit) return hit; if (up && up.is_oa === false) return { closed: true }; } catch (e) { errs.push(`unpaywall:${e.message.slice(0, 60)}`); }
  return { error: errs.join(' | ') || 'no-oa' };
}

function pdfUrlOf(up) {
  const locs = [up.best_oa_location, ...(up.oa_locations || [])].filter(Boolean);
  for (const l of locs) {
    const u = l.url_for_pdf || l.url;
    if (u && /\.pdf(\?|$)/i.test(u)) return { url: u, host: l.host_type || '', version: l.version || '' };
  }
  for (const l of locs) if (l.url_for_pdf) return { url: l.url_for_pdf, host: l.host_type || '', version: l.version || '' };
  return null;
}

async function downloadPdf(url, dest) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DSH-lit/1.0)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(`不是 PDF（${buf.subarray(0, 16).toString('latin1').replace(/[^\x20-\x7e]/g, '.')}）`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// ---------- PDF 身份校验（思路移植自 ego-literature-download/verify_pdf.py，改用 pdftotext） ----------
const DOI_RE = /10\.\d{4,9}\/[^\s<>"“”]+/gi;
const DOI_LABEL_RE = /^\s*(?:doi\s*[:：]?\s*)?(?:https?:\/\/(?:dx\.)?doi\.org\/)?\s*$/i;
const DOI_RESOLVER_RE = /https?:\/\/(?:dx\.)?doi\.org\/\s*$/i;
const REFS_HEAD_RE = /^\s*(?:\d+[.\s]+)?(?:references(?:\s+and\s+notes)?|bibliography|literature cited|参考文献)\s*[:：]?\s*$/i;

function cleanDoi(v) {
  let s = String(v || '').trim().replace(/[.,;:\]}]+$/, '');
  while (s.endsWith(')') && (s.split(')').length - 1) > (s.split('(').length - 1)) s = s.slice(0, -1);
  return s.toLowerCase();
}
function normText(s) {
  return String(s || '').normalize('NFKC').replace(/[\u200b\u00ad\ufeff]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}
function pdfRun(args, file) {
  const bin = process.env.LIT_PDFTOTEXT || 'pdftotext';
  const r = spawnSync(bin, [...args, file, '-'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });
  if (r.error || !r.stdout) return '';
  return r.stdout.replace(/\r/g, '');
}
function pdfPageCount(file) {
  const bin = process.env.LIT_PDFINFO || 'pdfinfo';
  const r = spawnSync(bin, [file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const m = String(r.stdout || '').match(/^Pages:\s+(\d+)/m);
  return m ? Number(m[1]) : null;
}
function pdfIdentityText(file) {
  let text = pdfRun(['-f', '1', '-l', '2', '-q'], file);
  if (!text.trim()) text = pdfRun(['-q'], file);
  text = text.normalize('NFKC').replace(/[\u200b\u00ad\ufeff]/g, '');
  text = text.replace(/(10\.\d{4,9}\/)\s*\n\s*(\S+)/g, '$1$2');
  text = text.replace(/(https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/[^\s<>"“”]*\.)\s*\n\s*([A-Za-z0-9][^\s<>"“”]*)/gi, '$1$2');
  return text;
}
// 返回 {validPdf, pages, sha256, primaryDois, doiMatch, titleMatch, identityMatch, identityStatus, evidence}
function verifyPdfIdentity(file, { doi, title } = {}) {
  const out = {
    file: path.resolve(file), bytes: 0, sha256: null, validPdf: false, pages: null,
    primaryDois: [], doiEvidence: [], doiMatch: null, titleMatch: null,
    identityMatch: null, identityStatus: 'unresolved', error: null,
  };
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { out.error = e.message; out.identityStatus = 'invalid'; return out; }
  out.bytes = buf.length;
  out.sha256 = createHash('sha256').update(buf).digest('hex');
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') { out.error = '缺少 %PDF- 文件头'; out.identityStatus = 'invalid'; return out; }
  out.pages = pdfPageCount(file);
  if (!out.pages) { out.error = 'PDF 无有效页面'; out.identityStatus = 'invalid'; return out; }

  const text = pdfIdentityText(file);
  const lines = text.split('\n');
  const body = [];
  const evidence = [];
  let inRefs = false;
  for (const [idx, line] of lines.entries()) {
    if (REFS_HEAD_RE.test(line)) inRefs = true;
    if (!inRefs) body.push(line);
    DOI_RE.lastIndex = 0;
    let m;
    while ((m = DOI_RE.exec(line))) {
      const prefix = line.slice(0, m.index);
      const margin = idx < 6 || idx >= lines.length - 4;
      const resolver = DOI_RESOLVER_RE.test(prefix);
      const metaMarker = /plos one \||citation:|article doi/i.test(line);
      const primary = !inRefs && (DOI_LABEL_RE.test(prefix) || (margin && resolver) || (resolver && metaMarker));
      evidence.push({ doi: cleanDoi(m[0]), line: idx + 1, primary, inReferences: inRefs });
    }
  }
  const primaryDois = [...new Set(evidence.filter((e) => e.primary).map((e) => e.doi))];
  out.primaryDois = primaryDois;
  out.doiEvidence = evidence.slice(0, 40);
  out.validPdf = true;

  const compact = normText(body.join('\n'));
  const expDoi = doi ? cleanDoi(String(doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')) : null;
  const expTitle = title ? normText(title) : null;
  if (expDoi) out.doiMatch = primaryDois.includes(expDoi);
  if (expTitle) {
    const exact = expTitle.length >= 12 && compact.includes(expTitle);
    // 预印本与期刊版标题常不同（arXiv 版 vs IJRR 版），用词集 Jaccard 兜底
    const words = (s) => (String(s || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
      .filter((w) => w.length > 2 && !TITLE_STOP.has(w));
    const a = words(title), b = words(body.join(' '));
    const setB = new Set(b);
    const shared = a.filter((w) => setB.has(w)).length;
    // PDF 正文词量远大于标题，用"期望标题词被覆盖的比例"，不用 Jaccard
    const coverage = a.length ? shared / a.length : 0;
    out.titleCoverage = Number(coverage.toFixed(3));
    out.titleShared = shared;
    out.titleMatch = exact || (shared >= 5 && coverage >= 0.7);
  }

  if (expDoi && primaryDois.length && !out.doiMatch) {
    out.identityMatch = false; out.identityStatus = 'conflict';
    out.conflictDoi = primaryDois.find((d) => d !== expDoi) || primaryDois[0];
  } else if (out.doiMatch || out.titleMatch) {
    out.identityMatch = true; out.identityStatus = 'matched';
  } else if (expDoi && primaryDois.some((d) => d !== expDoi)) {
    out.identityStatus = 'ambiguous';
  }
  return out;
}

async function pdfFromLanding(url) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DSH-lit/1.0)' } });
  if (!r.ok) return null;
  if (/pdf/i.test(r.headers.get('content-type') || '')) return url;
  const html = await r.text();
  const m = html.match(/<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)/i)
    || html.match(/<meta[^>]+content=["']([^"']+\.pdf[^"']*)["'][^>]+name=["']citation_pdf_url["']/i)
    || html.match(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i);
  return m ? new URL(m[1], url).href : null;
}

async function openAccess() {
  const doAttach = Boolean(flag('attach'));
  const dry = Boolean(flag('dry-run'));
  const max = Number(flag('max', 100)) || 100;
  const outDir = String(flag('out-dir', path.join(ROOT, 'tmp', 'lit-oa')));
  const collName = flag('collection');
  const all = await zotAll('items', {});
  let targets = all.filter((i) => i.data.itemType !== 'attachment');
  if (collName) {
    const cols = await getJson(zotPath('collections?limit=100'));
    const coll = cols.find((c) => c.key === collName || c.data?.name === collName);
    if (!coll) die(`找不到 collection: ${collName}`);
    const ids = new Set((await zotAll(`collections/${coll.key}/items`, {})).map((i) => i.key));
    targets = targets.filter((i) => ids.has(i.key));
  }
  const hasPdf = new Set(all.filter((i) => i.data.itemType === 'attachment' && /pdf/i.test(i.data.contentType || '') && i.data.parentItem).map((i) => i.data.parentItem));
  const only = flag('only');
  targets = targets.filter((i) => !hasPdf.has(i.key) && i.data.DOI && (!only || i.key === only)).slice(0, max);
  console.error(`  目标：${targets.length} 条无 PDF 且有 DOI`);

  const rows = [];
  for (const [n, it] of targets.entries()) {
    const doi = normDoi(it.data.DOI);
    const title = String(it.data.title || '').slice(0, 60);
    process.stderr.write(`  [${n + 1}/${targets.length}] ${title} … `);
    const row = { key: it.key, title: it.data.title, doi, url: null, file: null, bytes: 0, attached: false, error: null };
    const cands = [];
    try {
      const hit = await resolveOa(doi);
      if (hit && hit.closed) row.error = 'closed';
      else if (hit && hit.error) row.error = hit.error;
      else if (hit && hit.url) {
        row.host = hit.host; row.version = hit.version;
        if (hit.landing) {
          try { const pdf = await pdfFromLanding(hit.url); if (pdf) cands.push(pdf); else row.error = 'landing-page'; } catch (e) { row.error = `landing:${e.message.slice(0, 60)}`; }
        } else cands.push(hit.url);
      }
    } catch (e) { row.error = e.message.slice(0, 120); }

    try {
      const titleStr = String(it.data.title || '');
      const found = await arxivTitleSearch(titleStr);
      for (const c of found) {
        if (titleMatch(titleStr, c.title).ok && c.arxivId) { cands.push(`https://arxiv.org/pdf/${c.arxivId}.pdf`); row.arxiv = c.arxivId; break; }
      }
    } catch { /* arXiv 不可用就算了 */ }

    if (!cands.length) { console.error(row.error || 'no-oa'); rows.push(row); continue; }
    if (flag('debug')) console.error(`\n      cands: ${cands.join(' | ')}`);
    if (dry) { row.url = cands[0]; console.error(`可下（${row.arxiv ? 'arxiv' : row.host || 'oa'}）`); rows.push(row); continue; }
    const safe = `${String(it.data.title || doi).replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80)}.pdf`;
    const dest = path.join(outDir, safe);
    for (const u of cands) {
      try {
        row.bytes = await downloadPdf(u, dest);
        const v = verifyPdfIdentity(dest, { doi, title: it.data.title });
        row.verify = v.identityStatus;
        row.pages = v.pages;
        if (v.identityStatus === 'conflict') {
          fs.rmSync(dest, { force: true });
          row.bytes = 0;
          throw new Error(`PDF 身份冲突（文中 DOI 为 ${v.conflictDoi || v.primaryDois[0]}）`);
        }
        row.url = u; row.file = dest;
        if (doAttach) { const att = await zotAttach(it.key, dest); row.attached = true; row.attachmentKey = att; }
        row.error = null;
        console.error(`✓ ${(row.bytes / 1024).toFixed(0)} KB${v.pages ? ` / ${v.pages} 页` : ''}${v.identityStatus === 'matched' ? ' 身份已核' : ' 身份待核'}${row.attached ? ' 已挂附件' : ''}`);
        break;
      } catch (e) { row.error = e.message.slice(0, 140); }
    }
    if (!row.file) console.error(`失败: ${row.error}`);
    rows.push(row);
    await new Promise((r) => setTimeout(r, 300));
  }
  const report = {
    generatedAt: nowIso(), dryRun: dry, collection: collName || null,
    summary: { targets: targets.length, downloaded: rows.filter((r) => r.file).length, attached: rows.filter((r) => r.attached).length, failed: rows.filter((r) => r.error).length },
    rows,
  };
  const out = flag('report');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(String(out))), { recursive: true }); fs.writeFileSync(String(out), j(report), 'utf8'); }
  console.log(j({ ...report.summary, report: out || null }));
}

async function evaluate() {
  const goldPath = flag('gold');
  if (!goldPath) die('用法: lit.mjs eval --gold gold.json --queries queries.json [--sources arxiv,crossref,openalex] [--max 100] [--report recall.json] [--gaps gaps.md]');
  const rawGold = JSON.parse(fs.readFileSync(String(goldPath), 'utf8'));
  const gold = (Array.isArray(rawGold) ? rawGold : rawGold.gold || [])
    .map((g) => (typeof g === 'string' ? { title: g } : g))
    .filter((g) => g && g.title);
  if (!gold.length) die('gold 文件里没有 title');
  const qPath = flag('queries');
  let queries;
  if (qPath) {
    const raw = JSON.parse(fs.readFileSync(String(qPath), 'utf8'));
    queries = Array.isArray(raw) ? raw : raw.queries || [];
  } else queries = positional(1);
  if (!queries.length) die('eval 需要至少一条查询（--queries 文件或位置参数）');

  const list = String(flag('sources', 'arxiv,crossref,openalex')).split(',').map((s) => s.trim()).filter(Boolean);
  const max = Number(flag('max', 100)) || 100;
  const profName = String(flag('profile', 'robot')).toLowerCase();
  const prof = PROFILES[profName] || null;
  const require = [...(prof?.require || []), ...String(flag('require', '')).split(',').map((s) => s.trim()).filter(Boolean)];
  const exclude = [...(prof?.exclude || []), ...String(flag('exclude', '')).split(',').map((s) => s.trim()).filter(Boolean)];
  const yearMin = Number(flag('year-min', 0)) || 0;

  const hitBy = new Map();
  const perQuery = [];
  for (const q of queries) {
    const merged = new Map();
    for (const name of list) {
      const fn = SOURCES[name];
      if (!fn) continue;
      process.stderr.write(`  → ${name} «${String(q).slice(0, 30)}» … `);
      try {
        const recs = await fn(q, max);
        for (const r of recs) {
          const k = keyOf(r);
          if (merged.has(k)) mergeInto(merged.get(k), r); else merged.set(k, r);
        }
        console.error(`${recs.length} 条`);
      } catch (e) { console.error(`失败: ${e.message.slice(0, 120)}`); }
    }
    const seen = new Set();
    const kept = [];
    for (const r of merged.values()) {
      const t = normTitle(r.title);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const text = `${r.title || ''} ${r.abstract || ''}`;
      if (require.length && termHits(text, require) === 0) continue;
      if (exclude.length && termHits(text, exclude) > 0) continue;
      if (yearMin && Number(r.year || 0) < yearMin) continue;
      r.score = scoreRec(r);
      kept.push(r);
    }
    kept.sort((a, b) => b.score - a.score || (b.citations || 0) - (a.citations || 0));
    const before = hitBy.size;
    for (const [gi, g] of gold.entries()) {
      if (hitBy.has(gi)) continue;
      let best = null;
      for (const r of kept) {
        const m = titleMatch(g.title, r.title);
        if (m.ok && (!best || m.score > best.score)) best = { r, m };
      }
      if (best) hitBy.set(gi, { query: q, found: best.r.title, doi: best.r.doi || '', score: best.m.score });
    }
    perQuery.push({ query: q, scanned: merged.size, kept: kept.length, newHits: hitBy.size - before, cumulative: hitBy.size, recall: Number((hitBy.size / gold.length).toFixed(3)) });
    console.error(`  保留 ${kept.length} / 扫描 ${merged.size} → 新命中 ${hitBy.size - before}，累计召回 ${hitBy.size}/${gold.length}`);
  }

  const misses = gold.map((g, i) => ({ i, title: g.title, year: g.year || '', lang: g.lang || '' })).filter((x) => !hitBy.has(x.i));
  const report = {
    generatedAt: nowIso(), sources: list, profile: profName, max,
    gold: gold.length, recalled: hitBy.size, recall: Number((hitBy.size / gold.length).toFixed(3)),
    perQuery,
    hits: gold.map((g, i) => ({ title: g.title, ...(hitBy.get(i) || { found: null }) })).filter((x) => x.found),
    misses,
  };
  const out = flag('report');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(String(out))), { recursive: true }); fs.writeFileSync(String(out), j(report), 'utf8'); }
  const gaps = flag('gaps');
  if (gaps) {
    const md = [
      '# 检索缺口（gaps）', '',
      `- 生成时间：${report.generatedAt}`,
      `- 源：${list.join(' / ')}｜画像：${profName}｜每查询上限：${max}`,
      `- 金标准：${gold.length} 条｜召回：${report.recalled} 条（${(report.recall * 100).toFixed(1)}%）`,
      '', '## 每轮召回', '',
      '| 查询 | 扫描 | 保留 | 新命中 | 累计召回 |', '| --- | --- | --- | --- | --- |',
      ...perQuery.map((p) => `| ${p.query} | ${p.scanned} | ${p.kept} | ${p.newHits} | ${p.cumulative} (${(p.recall * 100).toFixed(1)}%) |`),
      '', '## 未召回', '',
      '| # | 标题 | 年份 |', '| --- | --- | --- |',
      ...misses.map((m, k) => `| ${k + 1} | ${String(m.title).replace(/\|/g, '\\|')} | ${m.year} |`),
      '', '> 中文条目本就不在 arXiv/Crossref/OpenAlex 覆盖内，属预期缺口；其余缺口需换检索式、加源或人工补。',
    ].join('\n');
    fs.mkdirSync(path.dirname(path.resolve(String(gaps))), { recursive: true });
    fs.writeFileSync(String(gaps), md + '\n', 'utf8');
  }
  console.log(j({ gold: report.gold, recalled: report.recalled, recall: report.recall, report: out || null, gaps: gaps || null }));
}

// ---------- main ----------
// ---------- ARIS 适配：一次检索 → 校验 → 底稿 ----------
// 把「research-lit / novelty-check / idea-creator / citation-audit」的取数统一到 verify_papers.py 背书的一份底稿。
const ARIS_HOME = path.join(ROOT, '.dsh', 'skills', 'aris');
const VERIFY_PY = path.join(ARIS_HOME, 'tools', 'verify_papers.py');

function slugify(s) {
  const out = String(s).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || 'topic';
}

async function verifyRecords(records) {
  if (!fs.existsSync(VERIFY_PY)) throw new Error(`找不到 ${VERIFY_PY}`);
  const dir = path.join(ROOT, 'tmp', `lit-verify-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const input = records.map((r, i) => ({
    id: `p${i + 1}`,
    arxiv_id: r.arxivId || null,
    doi: r.doi || null,
    title: r.title || null,
  }));
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(input, null, 2), 'utf8');
  const py = process.env.LIT_PYTHON || 'python';
  const r = spawnSync(py, [VERIFY_PY, '--input', path.join(dir, 'in.json'), '--output', path.join(dir, 'out.json')], {
    encoding: 'utf8', timeout: 300000,
  });
  let out = null;
  try { out = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')); } catch { /* 下面统一报错 */ }
  const detail = (r.stderr || '').trim() || (r.stdout || '').trim();
  fs.rmSync(dir, { recursive: true, force: true });
  if (!out) throw new Error(`verify_papers 失败（exit ${r.status}）：${detail.slice(0, 300)}`);
  return out;
}

function annotateVerification(records, verdict) {
  const byId = new Map((verdict.papers || []).map((p) => [p.id, p]));
  records.forEach((r, i) => {
    const v = byId.get(`p${i + 1}`);
    if (v) r.verify = { status: v.status, method: v.method, confidence: v.confidence, reason: v.reason };
  });
}

function mdEsc(s) { return String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim(); }

function papersTable(doc) {
  const head = '| # | 年 | 标题 | 作者 | 来源 | 引用 | DOI | 校验 |\n|---:|---:|---|---|---|---:|---|---|\n';
  const rows = doc.records.map((r, i) => {
    const authors = (r.authors || []).map((a) => String(a).trim()).filter(Boolean);
    const au = authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' 等' : '');
    const src = (r.sources || []).join('+') || '';
    const v = r.verify ? (r.verify.status === 'verified' ? `✅ ${r.verify.method || ''}` : r.verify.status) : '—';
    const doi = r.doi ? `[${mdEsc(r.doi)}](https://doi.org/${String(r.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')})` : '';
    return `| ${i + 1} | ${r.year || ''} | ${mdEsc(r.title)} | ${mdEsc(au)} | ${mdEsc(src)} | ${r.citations ?? ''} | ${doi} | ${mdEsc(v)} |`;
  });
  return head + rows.join('\n') + '\n';
}

function reviewSkeleton(doc) {
  const v = doc.verdict;
  const vline = v
    ? `**${v.verdict}**（幻觉率 ${(v.hallucinationRate * 100).toFixed(1)}%，待核 ${(v.pendingRate * 100).toFixed(1)}%${v.warnings?.length ? `，警告：${v.warnings.join(', ')}` : ''}）`
    : '未校验（`--no-verify`）';
  const per = doc.records.map((r, i) => {
    const authors = (r.authors || []).slice(0, 8).join(', ');
    const meta = [
      r.year && `年份 ${r.year}`,
      r.venue && `出处 ${r.venue}`,
      r.citations != null && `引用 ${r.citations}`,
      r.doi && `DOI [${r.doi}](https://doi.org/${r.doi})`,
      r.arxivId && `arXiv [${r.arxivId}](https://arxiv.org/abs/${r.arxivId})`,
      r.url && !r.doi && !r.arxivId && `链接 ${r.url}`,
      r.verify && `校验 ${r.verify.status}${r.verify.method ? `/${r.verify.method}` : ''}`,
    ].filter(Boolean);
    const abs = r.abstract ? String(r.abstract).replace(/\s+/g, ' ').slice(0, 520).trim() : '（无摘要）';
    return `### ${i + 1}. ${r.title || '(无标题)'}\n\n- ${meta.join(' · ') || '（元数据缺失）'}\n${authors ? `- 作者：${authors}\n` : ''}- 摘要：${abs}${String(r.abstract || '').length > 520 ? ' …' : ''}\n`;
  }).join('\n');
  return `# ${doc.query} —— 文献底稿

> 由 \`node bin/lit.mjs lit\` 生成。**引用只允许来自本文件或同目录 papers.json**；补充条目请重跑命令，不要凭记忆添加。
> 校验由 ARIS \`tools/verify_papers.py\` 完成（arXiv API → CrossRef DOI → Semantic Scholar 标题匹配）。

## 0. 检索元信息

- 时间：${doc.retrievedAt}
- 检索式：\`${doc.query}\`${doc.expanded?.length ? `；扩展：${doc.expanded.map((x) => `\`${x}\``).join('、')}` : ''}
- 源：${(doc.sources || []).join(', ')}；画像：${doc.profile}
- 条数：保留 ${doc.total} / 去重后 ${doc.scanned}
- 校验：${vline}
${doc.sourceErrors?.length ? `- 源异常：${[...new Set(doc.sourceErrors.map((e) => e.source))].join(', ')}（${doc.sourceErrors.length} 次，结果可能不完整）\n` : ''}

## 1. 概览

${papersTable(doc)}
## 2. 研究脉络（待写）

> 按时间/技术路线串一条主线：问题如何被提出、哪几篇是关键节点、当前主流做法是什么。

## 3. 主题聚类（待写）

> 把上面的条目按 3–5 个主题分组，每组一句话概括共识与分歧。

## 4. 逐篇要点

${per}
## 5. 研究空白与可做的问题（待写）

> 结合本项目的目标，指出 2–4 个尚未被覆盖的角度，并注明依据（哪几篇的哪句结论）。

## 6. 与本项目的关系（待写）

> 这些工作里哪些可复用（方法/指标/数据集）、哪些是直接竞争。
`;
}

async function cmdLit() {
  const q = positional(1).join(' ');
  if (!q) die('用法: lit.mjs lit "<topic>" --project <dir> [--max 40] [--sources arxiv,crossref,openalex] [--profile robot|none|auto] [--expand "变体1;变体2"] [--year-min 2015] [--no-verify] [--import] [--collection 名] [--slug x]');
  const project = path.resolve(String(flag('project', process.cwd())));
  const list = String(flag('sources', 'arxiv,crossref,openalex')).split(',').map((s) => s.trim()).filter(Boolean);
  const max = Number(flag('max', 40));
  let profName = String(flag('profile', 'auto')).toLowerCase();
  if (profName === 'auto') profName = /robot|mechanism|modular|reconfigur|morpholog|机器人|机构|重构/i.test(q) ? 'robot' : 'none';
  const prof = PROFILES[profName] || null;
  if (profName !== 'none' && !prof) die(`未知画像 ${profName}`);
  const requireList = [...(prof?.require || []), ...String(flag('require', '')).split(',').map((s) => s.trim()).filter(Boolean)];
  const excludeList = [...(prof?.exclude || []), ...String(flag('exclude', '')).split(',').map((s) => s.trim()).filter(Boolean)];
  const variants = String(flag('expand', '')).split(';').map((s) => s.trim()).filter(Boolean);

  const { payload } = await runSearch({
    q, variants, list, max, profName, require: requireList, exclude: excludeList,
    yearMin: Number(flag('year-min', 0)) || 0, minScore: Number(flag('min-score', 0)) || 0,
    top: Number(flag('top', 0)) || 0,
  });
  if (!payload.records.length) die('没有检索到条目（检查网络/代理，或放宽 --profile/--year-min）');
  if (payload.sourceErrors?.length) {
    const bad = [...new Set(payload.sourceErrors.map((e) => e.source))].join(', ');
    console.error(`  ! 源异常 ${payload.sourceErrors.length} 次（${bad}）——结果可能不完整，可重跑或 --sources 换源`);
  }

  let verdict = null;
  if (!flag('no-verify')) {
    process.stderr.write('  → verify_papers.py 校验 … ');
    verdict = await verifyRecords(payload.records);
    annotateVerification(payload.records, verdict);
    console.error(`${verdict.verdict}（幻觉率 ${(verdict.hallucination_rate * 100).toFixed(1)}%，待核 ${(verdict.pending_rate * 100).toFixed(1)}%）`);
    if (verdict.verdict === 'BLOCKED') console.error('  ! 幻觉率超阈值：写作前必须人工剔除未核实条目');
  }

  const slug = String(flag('slug', '') || slugify(q));
  const dir = path.join(project, 'literature', slug);
  fs.mkdirSync(dir, { recursive: true });
  const doc = {
    ...payload,
    retrievedAt: `${payload.retrievedAt}（本地 ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}）`,
    verdict: verdict ? {
      verdict: verdict.verdict,
      hallucinationRate: verdict.hallucination_rate,
      pendingRate: verdict.pending_rate,
      warnings: verdict.warnings || [],
    } : null,
  };
  fs.writeFileSync(path.join(dir, 'papers.json'), j(doc), 'utf8');
  fs.writeFileSync(path.join(dir, 'papers.md'), papersTable(doc), 'utf8');
  fs.writeFileSync(path.join(dir, 'review.md'), reviewSkeleton(doc), 'utf8');
  console.error(`  写入 ${dir}（papers.json / papers.md / review.md）`);

  let imported = null;
  if (flag('import')) {
    const collName = String(flag('collection', `lit｜${slug}`));
    const collKey = await ensureCollection(collName);
    const existing = (await zotAll('items')).map(zotToRecord);
    const haveDoi = new Set(existing.map((e) => normDoi(e.doi)).filter(Boolean));
    const haveTitle = new Set(existing.map((e) => normTitle(e.title)).filter(Boolean));
    let created = 0; let skipped = 0;
    for (const r of payload.records) {
      if (r.verify && r.verify.status === 'unverified') { skipped++; continue; }
      const doi = normDoi(r.doi || '');
      const t = normTitle(r.title || '');
      if ((doi && haveDoi.has(doi)) || (!doi && t && haveTitle.has(t))) { skipped++; continue; }
      try {
        await zotCreateItem(toZotItem(r, { collection: collKey, tags: ['lit-aris'] }));
        created++;
        if (doi) haveDoi.add(doi); if (t) haveTitle.add(t);
      } catch (e) {
        console.error(`  ! 建条目失败 ${String(r.title).slice(0, 48)}：${e.message.slice(0, 120)}`);
        skipped++;
      }
    }
    imported = { collection: collName, key: collKey, created, skipped };
    console.error(`  Zotero：${collName} 新增 ${created} / 跳过 ${skipped}`);
  }

  console.log(j({
    dir, total: payload.total, scanned: payload.scanned,
    verdict: doc.verdict, imported,
  }));
}

async function verifyCommand() {
  const file = positional(1)[0];
  if (!file) die('用法: lit.mjs verify <papers.json> [--out <file>]');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const records = Array.isArray(raw) ? raw : (raw.records || raw.papers || []);
  if (!records.length) die('文件里没有可校验的条目（需要 records[] 或 direct array）');
  const verdict = await verifyRecords(records);
  annotateVerification(records, verdict);
  const out = flag('out');
  if (out) {
    const merged = Array.isArray(raw) ? { records, verdict } : { ...raw, records, verdict };
    fs.writeFileSync(String(out), j(merged), 'utf8');
    console.error(`写入 ${out}`);
  }
  console.log(j({ verdict: verdict.verdict, hallucinationRate: verdict.hallucination_rate, pendingRate: verdict.pending_rate, warnings: verdict.warnings || [], papers: verdict.papers }));
}

function portOpen(host, port, ms = 400) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; try { s.destroy(); } catch { /* 已断 */ } resolve(v); };
    s.setTimeout(ms, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

// 本机 Clash 在 7897 监听时，直连 arXiv/出版商会卡死；借 Node 24 的 NODE_USE_ENV_PROXY 走代理。
// 关掉 Clash 或设置 LIT_DIRECT=1 就退回直连。
async function viaProxyIfAvailable() {
  if (process.env.LIT_PROXY_USED || process.env.LIT_DIRECT || process.env.NODE_USE_ENV_PROXY) return;
  const proxy = process.env.LIT_PROXY || 'http://127.0.0.1:7897';
  let u;
  try { u = new URL(proxy); } catch { return; }
  if (!(await portOpen(u.hostname, Number(u.port || 80)))) return;
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    stdio: 'inherit',
    env: {
      ...process.env, NODE_USE_ENV_PROXY: '1', HTTP_PROXY: proxy, HTTPS_PROXY: proxy,
      NO_PROXY: '127.0.0.1,localhost,::1', LIT_PROXY_USED: proxy,
    },
  });
  process.exit(r.status ?? 1);
}

// 校验单个已下载 PDF 的完整性 + 身份（DOI 优先，标题兜底）
// ---------- 人工下载：收件箱入库 + 待下载清单 ----------
// 用途：出版社付费墙/中文库只能人工下载。人工下的 PDF 丢进 references/inbox/，
// 这里用 pdfcheck 认身份（DOI 优先、标题覆盖率兜底）再挂到 Zotero 对应条目上。
function wordsOf(s) {
  // 注意：不能用 normText——它会把所有分隔符删掉，整段变成一个 token。
  const raw = String(s || '').toLowerCase().replace(/<[^>]+>/g, ' ').normalize('NFKC');
  const out = new Set();
  for (const w of raw.split(/[^a-z0-9\u4e00-\u9fa5]+/)) {
    if (w.length > 2 && !TITLE_STOP.has(w)) out.add(w);
  }
  return out;
}

async function loadZotIndex() {
  const items = await zotAll('items');
  const entries = [];
  const attached = new Set();
  for (const it of items) {
    const d = it.data || {};
    if (d.deleted) continue;
    if (d.itemType === 'attachment') {
      if (d.parentItem) attached.add(d.parentItem);
      continue;
    }
    entries.push({
      key: it.key,
      title: d.title || '',
      doi: normDoi(d.DOI || ''),
      year: (d.date || '').match(/\d{4}/)?.[0] || '',
      venue: d.publicationTitle || d.proceedingsTitle || d.bookTitle || '',
      collections: d.collections || [],
      words: wordsOf(d.title),
    });
  }
  const byDoi = new Map();
  for (const e of entries) if (e.doi) byDoi.set(e.doi, [...(byDoi.get(e.doi) || []), e]);
  return { entries, attached, byDoi };
}

function bestTitleMatch(words, entries) {
  let best = null;
  for (const e of entries) {
    if (!e.words.size) continue;
    let shared = 0;
    for (const w of e.words) if (words.has(w)) shared++;
    const coverage = shared / e.words.size;
    if (!best || coverage > best.coverage) best = { entry: e, coverage, shared };
  }
  return best;
}

function listPdfs(dir) {
  const out = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (e.isFile() && /\.pdf$/i.test(e.name)) out.push(p);
    }
  };
  walk(dir, 0);
  return out.sort();
}

async function inbox() {
  const dir = flag('dir');
  if (!dir || dir === true) die('用法: lit inbox --dir <PDF 目录> [--project <项目>] [--collection 名] [--create] [--dry-run] [--report 文件]');
  const absDir = path.resolve(String(dir));
  if (!fs.existsSync(absDir)) die(`目录不存在：${absDir}`);
  const dry = flag('dry-run') !== undefined;
  const create = flag('create') !== undefined;
  const project = flag('project') && flag('project') !== true ? path.resolve(String(flag('project'))) : '';
  const collection = flag('collection') && flag('collection') !== true ? String(flag('collection')) : '';
  const files = listPdfs(absDir);
  if (!files.length) die(`目录里没有 PDF：${absDir}`);
  needZotero();
  console.log(`扫描 ${files.length} 个 PDF：${absDir}${dry ? '（dry-run，不写库）' : ''}`);
  const { entries, attached, byDoi } = await loadZotIndex();
  const collKey = create && collection ? await ensureCollection(collection) : '';
  const results = [];
  let cursor = 0;
  for (const file of files) {
    cursor++;
    const name = path.relative(absDir, file);
    const row = { file: name, bytes: fs.existsSync(file) ? fs.statSync(file).size : 0, pages: 0, dois: [], status: '', item: null, via: '', coverage: null, detail: '' };
    const id = verifyPdfIdentity(file, {});
    row.pages = id.pages;
    row.dois = id.primaryDois || [];
    row.coverage = Number.isFinite(id.titleCoverage) ? Number(id.titleCoverage.toFixed(3)) : null;
    if (!id.validPdf) {
      row.status = 'invalid';
      row.detail = '不是可解析的 PDF（无 %PDF- 头或 0 页）';
      results.push(row);
      console.log(`✗ [${cursor}/${files.length}] ${name}: 无效 PDF`);
      continue;
    }
    let matched = [];
    for (const doi of row.dois) {
      const hit = byDoi.get(normDoi(doi));
      if (hit?.length) { matched = hit; row.via = 'doi'; break; }
    }
    if (!matched.length) {
      const pageText = pdfFirstPageText(file) || '';
      const words = wordsOf(pageText);
      const best = bestTitleMatch(words, entries);
      if (process.env.LIT_DEBUG) console.error('[debug] pageChars=' + pageText.length + ' words=' + words.size + ' best=' + JSON.stringify(best && { key: best.entry.key, coverage: best.coverage, shared: best.shared, entries: entries.length }));
      if (best && best.shared >= 5 && best.coverage >= 0.7) {
        matched = [best.entry];
        row.via = 'title';
        row.coverage = Number(best.coverage.toFixed(3));
      }
    }
    if (matched.length > 1) {
      row.status = 'ambiguous';
      row.detail = matched.map((e) => `${e.key} ${e.title}`).join(' | ');
      results.push(row);
      console.log(`? [${cursor}/${files.length}] ${name}: 命中 ${matched.length} 条，需人工指定`);
      continue;
    }
    if (matched.length === 1) {
      const e = matched[0];
      row.item = { key: e.key, title: e.title, doi: e.doi };
      if (attached.has(e.key)) {
        row.status = 'already';
        console.log(`= [${cursor}/${files.length}] ${name}: 已在库（${e.key}）已有 PDF，跳过`);
      } else if (dry) {
        row.status = 'would-attach';
        console.log(`+ [${cursor}/${files.length}] ${name}: 将挂到 ${e.key}「${e.title.slice(0, 48)}」`);
      } else {
        try {
          const a = await zotAttach(e.key, file);
          row.status = 'attached';
          row.attachment = a.attachment;
          console.log(`✓ [${cursor}/${files.length}] ${name}: 挂到 ${e.key}（附件 ${a.attachment}${a.uploaded ? `，${Math.round(a.bytes / 1024)} KB` : '，Zotero 已有同文件'}）`);
        } catch (err) {
          row.status = 'error';
          row.detail = err.message;
          console.log(`✗ [${cursor}/${files.length}] ${name}: 挂附件失败 ${err.message}`);
        }
      }
      results.push(row);
      continue;
    }
    if (create && row.dois.length) {
      try {
        const rec = await crossrefByDoi(row.dois[0]);
        if (rec) {
          if (dry) {
            row.status = 'would-create';
            row.item = { key: '(dry-run)', title: rec.title, doi: rec.doi };
            console.log(`+ [${cursor}/${files.length}] ${name}: 将新建「${String(rec.title).slice(0, 48)}」`);
          } else {
            const item = toZotItem(rec, { collection: collKey, tags: ['lit-inbox'] });
            const created = await zotCreateItem(item);
            let att = null;
            try { att = await zotAttach(created.key, file); } catch (err) { row.detail = `附件失败 ${err.message}`; }
            row.status = 'created';
            row.item = { key: created.key, title: rec.title, doi: rec.doi };
            row.attachment = att?.attachment || '';
            console.log(`+ [${cursor}/${files.length}] ${name}: 新建 ${created.key}「${String(rec.title).slice(0, 48)}」${att ? '，已挂 PDF' : ''}`);
          }
          results.push(row);
          continue;
        }
      } catch (err) {
        row.detail = err.message;
      }
    }
    row.status = 'no-match';
    results.push(row);
    console.log(`? [${cursor}/${files.length}] ${name}: 库里没有对应条目${row.dois.length ? `（文中 DOI ${row.dois[0]}）` : '（未识别到 DOI）'}`);
  }
  const counts = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const order = ['attached', 'created', 'would-attach', 'would-create', 'already', 'ambiguous', 'no-match', 'conflict', 'error', 'invalid'];
  console.log('汇总: ' + order.filter((k) => counts[k]).map((k) => `${k} ${counts[k]}`).join(' / '));
  const out = flag('report') && flag('report') !== true ? path.resolve(String(flag('report'))) : (project ? path.join(project, 'references', 'inbox-report.json') : '');
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, j({ dir: absDir, scanned: results.length, counts, results }), 'utf8');
    console.log(`报告 → ${out}`);
  }
  if (counts['no-match'] || counts.ambiguous) console.log('提示: 未挂上的 PDF 留在原处，可先 `lit gaps` 看清单，或人工确认后手动在 Zotero 里建条目。');
}

async function gaps() {
  const project = flag('project') && flag('project') !== true ? path.resolve(String(flag('project'))) : '';
  if (!project) die('用法: lit gaps --project <项目> [--collection 名] [--out 文件]');
  const collection = flag('collection') && flag('collection') !== true ? String(flag('collection')) : '';
  const { entries, attached } = await loadZotIndex();
  const missingFile = path.join(project, 'references', 'bib-missing.json');
  let missing = [];
  if (fs.existsSync(missingFile)) {
    try { missing = JSON.parse(fs.readFileSync(missingFile, 'utf8')); } catch { missing = []; }
    if (!Array.isArray(missing)) missing = [];
  }
  let inLib = entries.filter((e) => e.doi && !attached.has(e.key));
  if (collection) {
    const cols = await getJson(zotPath('collections?limit=100'));
    const hit = cols.find((c) => c.data?.name === collection || c.key === collection);
    if (hit) inLib = inLib.filter((e) => e.collections.includes(hit.key));
  }
  const noDoi = entries.filter((e) => !e.doi && !attached.has(e.key) && (!collection || true));
  const lines = [];
  lines.push(`# 待人工下载清单`, '');
  lines.push(`> 生成时间：${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}（本机时间）`);
  lines.push(`> 库内条目 ${entries.length} 条；有 DOI 无 PDF ${inLib.length} 条；bib 里没有的 ${missing.length} 条。`, '');
  lines.push('## A. 库里有条目、缺全文（可直接去出版社下）', '');
  if (inLib.length) {
    lines.push('| # | 标题 | 年 | 期刊/会议 | DOI |', '|---|---|---|---|---|');
    inLib.forEach((e, i) => lines.push(`| ${i + 1} | ${mdEsc(e.title)} | ${e.year} | ${mdEsc(e.venue)} | [${e.doi}](https://doi.org/${e.doi}) |`));
  } else lines.push('_无_');
  lines.push('', '## B. 引用里根本没有的条目（先找文献，再下载）', '');
  if (missing.length) {
    lines.push('| # | 标题 | 年 | DOI | 说明 |', '|---|---|---|---|---|');
    missing.forEach((m, i) => {
      const doi = m.doi ? `[${m.doi}](https://doi.org/${m.doi})` : '—';
      lines.push(`| ${i + 1} | ${mdEsc(m.title)} | ${m.year || ''} | ${doi} | ${m.doi ? '已定位，去出版社' : '四源未命中，需 Google Scholar / 出版社站内检索'} |`);
    });
  } else lines.push('_无_');
  lines.push('', '## 下载之后', '');
  lines.push('把 PDF 放进 `references/inbox/`，然后：', '');
  lines.push('```bash', 'node bin/lit.mjs inbox --dir "<项目>/references/inbox" --project "<项目>" --create', '```', '');
  lines.push('`--create` 只对带 DOI 的 PDF 生效（Crossref 取元数据新建条目）；识别不到 DOI 的会留在原地等人工处理。', '');
  const out = flag('out') && flag('out') !== true ? path.resolve(String(flag('out'))) : path.join(project, 'references', 'download-todo.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`库内 ${entries.length} 条 / 有 DOI 缺 PDF ${inLib.length} 条 / bib 缺 ${missing.length} 条`);
  console.log(`清单 → ${out}`);
}

function pdfCheck() {
  const file = positional(1)[0];
  if (!file) die('用法: lit.mjs pdfcheck <file.pdf> [--doi 10.xxxx/yyy] [--title "..."]');
  const doi = flag('doi');
  const title = flag('title');
  if (!doi && !title) die('pdfcheck 需要 --doi 或 --title 才能建立身份基准');
  const r = verifyPdfIdentity(file, { doi: doi && doi !== true ? String(doi) : '', title: title && title !== true ? String(title) : '' });
  console.log(j(r));
  if (!r.validPdf) process.exit(3);
  if (r.identityStatus === 'conflict') process.exit(2);
  process.exit(r.identityMatch === true ? 0 : 4);
}

const main = async () => {
  await viaProxyIfAvailable();
  if (!cmd) die('用法: lit.mjs <doctor|zot|find|index|reconcile|fill|eval|oa|lit|verify|pdfcheck|inbox|gaps>');
  if (cmd === 'doctor') return doctor();
  if (cmd === 'zot') return zot();
  if (cmd === 'find') return find();
  if (cmd === 'index') return index();
  if (cmd === 'reconcile') return reconcile();
  if (cmd === 'fill') return fill();
  if (cmd === 'eval') return evaluate();
  if (cmd === 'oa') return openAccess();
  if (cmd === 'lit') return cmdLit();
  if (cmd === 'verify') return verifyCommand();
  if (cmd === 'pdfcheck') return pdfCheck();
  if (cmd === 'inbox') return inbox();
  if (cmd === 'gaps') return gaps();
  die(`未知命令 ${cmd}`);
};
main().catch((e) => die(e.stack || e.message));
