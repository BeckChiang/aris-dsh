#!/usr/bin/env node
// lit-gold.mjs — 为某个项目构建检索评估用的「金标准题录集」
//
// 输入：<项目>/references/index.json（PDF ↔ Zotero 对账表）+ <项目>/intro/refs.bib（如有）
// 输出：<项目>/references/gold.json（[{title, year, src, lang}]，按标题归一化去重）
//
// 用法：node bin/lit-gold.mjs --project "C:\path\to\project" [--out references/gold.json]

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

const project = flag('project');
if (!project || project === true) {
  console.error('用法: node bin/lit-gold.mjs --project <项目目录> [--out references/gold.json]');
  process.exit(1);
}
const outRel = flag('out', 'references/gold.json');
const out = path.resolve(String(project), String(outRel));

const gold = [];
const seen = new Set();
const add = (title, year, src) => {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return;
  const k = t.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();
  if (!k || seen.has(k)) return;
  seen.add(k);
  gold.push({ title: t, year: year || '', src, lang: /[\u4e00-\u9fff]/.test(t) ? 'zh' : 'en' });
};

const idxPath = path.resolve(String(project), 'references/index.json');
if (fs.existsSync(idxPath)) {
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  for (const r of idx.files || []) add(r.title, r.year, 'library');
} else {
  console.error(`  ! 没有 ${idxPath}，只从 bib 取`);
}

const bibPath = path.resolve(String(project), 'intro/refs.bib');
if (fs.existsSync(bibPath)) {
  const bib = fs.readFileSync(bibPath, 'utf8');
  const titleRe = /(?:^|[,\n{]\s*)title\s*=\s*/g;
  let m;
  while ((m = titleRe.exec(bib))) {
    const brace = bib.indexOf('{', m.index + m[0].length - 1);
    if (brace < 0) break;
    let depth = 0;
    let end = -1;
    for (let k = brace; k < bib.length; k++) {
      if (bib[k] === '{') depth++;
      else if (bib[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) break;
    const raw = bib.slice(brace + 1, end).replace(/[{}]/g, '').replace(/\\[a-zA-Z]+/g, '');
    const year = (bib.slice(Math.max(0, m.index - 200), end + 300).match(/\byear\s*=\s*[{"']?\s*(\d{4})/) || [])[1] || '';
    add(raw, year, 'refs.bib');
    titleRe.lastIndex = end;
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(gold, null, 2), 'utf8');
console.log(JSON.stringify({ out, total: gold.length, zh: gold.filter((g) => g.lang === 'zh').length, fromBib: gold.filter((g) => g.src === 'refs.bib').length }));
