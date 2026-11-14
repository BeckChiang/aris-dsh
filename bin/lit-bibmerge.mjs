#!/usr/bin/env node
/**
 * lit-bibmerge.mjs — 把 Zotero collection 的导出合并进项目已有 refs.bib
 *
 * 核心约束：项目 main.tex 里的 \cite 键不能变。所以旧条目的 key 一律保留，
 * 只把条目内容换成 Zotero 里的最新元数据；Zotero 里多出来的条目才新增。
 *
 * 用法：
 *   node bin/lit-bibmerge.mjs --bib <项目 intro/refs.bib> --collection "<Zotero collection 名>"
 *        [--out <输出路径>] [--dry-run] [--dupe-jaccard 0.7]
 *
 * 行为：
 *   1. 调 bin/lit.mjs zot bib 导出 collection（--no-file）
 *   2. 旧条目按 DOI → 归一化标题 与 Zotero 条目配对；命中则保留旧 key、换新字段
 *   3. Zotero 独有条目：若与某个保留旧条目近似重复（DOI 相同或标题 Jaccard ≥ 阈值），
 *      只把旧条目缺失的字段补过去，不新增键；否则新增
 *   4. 输出统计；--dry-run 只报告不落盘
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const has = (name) => process.argv.includes(`--${name}`);

const bibPath = arg('bib');
const collection = arg('collection');
if (!bibPath || !collection) {
  console.error('用法: node bin/lit-bibmerge.mjs --bib <refs.bib> --collection "<名称>" [--out ..] [--dry-run]');
  process.exit(1);
}
const outPath = arg('out', bibPath);
const jaccardMin = Number(arg('dupe-jaccard', '0.7'));

function cleanField(name, value) {
  // 导入脚本写进 note 的内部标记，不进最终参考文献
  if (name === 'note') {
    const junk = [
      /^\s*\[(下载|预印|本地|PDF|复制)/,
      /^first\/ref\d+/i,
      /^s\d+[，,]/i,
      /^arXiv:\s/i,
      /被引/,
    ];
    if (junk.some((re) => re.test(value))) return null;
  }
  if (!value) return null;
  let v = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
  // LaTeX 里裸 & 会报错，统一转义（已带反斜杠的不动）
  v = v.replace(/(^|[^\\])&/g, '$1\\&');
  return v;
}

function parseBib(text) {
  const entries = [];
  let i = 0;
  while ((i = text.indexOf('@', i)) !== -1) {
    const head = text.slice(i, text.indexOf('{', i));
    const type = (head.match(/@(\w+)/) || [])[1] || '';
    const start = text.indexOf('{', i);
    let depth = 0;
    let end = -1;
    for (let k = start; k < text.length; k++) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) break;
    const body = text.slice(start + 1, end);
    const key = (body.split(',')[0] || '').trim();
    const fields = {};
    const re = /(\w+)\s*=\s*/g;
    let m;
    while ((m = re.exec(body))) {
      const fname = m[1].toLowerCase();
      const pos = m.index + m[0].length;
      let val = '';
      if (body[pos] === '{') {
        let d = 0, e = -1;
        for (let k = pos; k < body.length; k++) {
          if (body[k] === '{') d++;
          else if (body[k] === '}') { d--; if (d === 0) { e = k; break; } }
        }
        val = body.slice(pos + 1, e);
        re.lastIndex = e + 1;
      } else if (body[pos] === '"') {
        const e = body.indexOf('"', pos + 1);
        val = body.slice(pos + 1, e);
        re.lastIndex = e + 1;
      } else {
        const e = body.indexOf(',', pos);
        val = body.slice(pos, e < 0 ? undefined : e);
        re.lastIndex = e < 0 ? body.length : e + 1;
      }
      const cleaned = cleanField(fname, val.replace(/\s+/g, ' ').trim());
      if (cleaned !== null) fields[fname] = cleaned;
    }
    entries.push({ type: type.toLowerCase(), key, fields });
    i = end + 1;
  }
  return entries;
}

const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();const normDoi = (s) => String(s || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/[^a-z0-9./-]/g, '');
const toks = (s) => new Set(normTitle(s).split(' ').filter(Boolean));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const tmpZot = path.join(ROOT, 'tmp', `bibmerge-${Date.now()}.bib`);
fs.mkdirSync(path.dirname(tmpZot), { recursive: true });
execFileSync(process.execPath, [path.join(ROOT, 'bin/lit.mjs'), 'zot', 'bib', '--collection', collection, '--out', tmpZot, '--no-file'], { stdio: 'inherit' });

const oldEntries = parseBib(fs.readFileSync(bibPath, 'utf8'));
const zotEntries = parseBib(fs.readFileSync(tmpZot, 'utf8'));
fs.rmSync(tmpZot, { force: true });

const zotByDoi = new Map();
const zotByTitle = new Map();
for (const z of zotEntries) {
  const d = normDoi(z.fields.doi);
  if (d) zotByDoi.set(d, z);
  const t = normTitle(z.fields.title);
  if (t) zotByTitle.set(t, z);
}

const usedZot = new Set();
const merged = [];
let replaced = 0;
for (const o of oldEntries) {
  const d = normDoi(o.fields.doi);
  const t = normTitle(o.fields.title);
  const z = (d && zotByDoi.get(d)) || (t && zotByTitle.get(t)) || null;
  if (z && !usedZot.has(z.key)) {
    usedZot.add(z.key);
    merged.push({ ...z, key: o.key });
    replaced++;
  } else {
    merged.push(o);
  }
}

const dupes = [];
const kept = [];
for (const z of zotEntries.filter((x) => !usedZot.has(x.key))) {
  const tz = toks(z.fields.title);
  let hit = null;
  for (const o of merged) {
    if (o.zotKey === z.key || usedZot.has(o.key)) continue;
    const do1 = normDoi(o.fields.doi), do2 = normDoi(z.fields.doi);
    if (do1 && do1 === do2) { hit = o; break; }
    if (jaccard(tz, toks(o.fields.title)) >= jaccardMin) { hit = o; break; }
  }
  if (!hit) { kept.push(z); continue; }
  const filled = [];
  for (const f of ['doi', 'url', 'journal', 'booktitle', 'volume', 'number', 'pages', 'publisher', 'year', 'author', 'isbn', 'issn']) {
    if (!hit.fields[f] && z.fields[f]) { hit.fields[f] = z.fields[f]; filled.push(f); }
  }
  // 旧条目 author 写成标题（历史脏数据）时，用 Zotero 的整组书目字段覆盖
  const oldAuthor = normTitle(hit.fields.author);
  const oldTitle = normTitle(hit.fields.title);
  if (oldAuthor && oldTitle && (oldAuthor === oldTitle || oldAuthor.includes(oldTitle))) {
    for (const f of ['author', 'title', 'journal', 'booktitle', 'year', 'volume', 'number', 'pages', 'publisher', 'doi', 'url']) {
      if (z.fields[f]) { hit.fields[f] = z.fields[f]; filled.push(`fix:${f}`); }
    }
  }
  dupes.push({ dropped: z.key, into: hit.key, filled });
}

const result = [...merged, ...kept];
const text = result.map((e) => `@${e.type}{${e.key},\n${Object.entries(e.fields).map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`).join('\n\n') + '\n';

const stats = {
  oldEntries: oldEntries.length,
  zotEntries: zotEntries.length,
  merged: result.length,
  replacedWithZotero: replaced,
  keptOld: oldEntries.length - replaced,
  added: kept.length,
  foldedDuplicates: dupes,
};
console.log(JSON.stringify(stats, null, 2));

if (!has('dry-run')) {
  if (outPath !== bibPath) fs.copyFileSync(bibPath, `${bibPath}.bak-${new Date().toISOString().slice(0, 10)}`);
  fs.writeFileSync(outPath, text, 'utf8');
  console.log(`写入 ${outPath}（${result.length} 条）`);
} else {
  console.log('dry-run：未写文件');
}
