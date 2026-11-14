// 给 ARIS 技能树打「DSH 本机覆盖」横幅（幂等：先删旧横幅再插新的）。
// 用法：node bin/aris-sync-lit.mjs [--tree <ARIS 根>] [--dry-run]
//   ARIS 根 = 含 skills/ 的目录（上游仓库）或含 references/skills/ 的目录（DSH 移植版）。
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : (args[i + 1] ?? true); };
const dry = args.includes('--dry-run');

const tree = path.resolve(String(flag('tree', path.join(process.cwd(), '.dsh', 'skills', 'aris'))));
const skillsRoot = [path.join(tree, 'skills'), path.join(tree, 'references', 'skills')].find((p) => fs.existsSync(p));
if (!skillsRoot) { console.error(`找不到 skills 目录：${tree}`); process.exit(1); }

const BANNERS = {
  'research-lit': [
    '> **DSH 本机覆盖（有内核时优先；没有就忽略本横幅）**：若工作区存在 `bin/lit.mjs`，取数一律走',
    '> `node bin/lit.mjs lit "<topic>" --project <项目> --max 40 [--import]`，产物在',
    '> `<项目>/literature/<slug>/{papers.json,papers.md,review.md}`，条目已过 `verify_papers.py`；',
    '> 正文只引用 `papers.json` 里的条目。本机没有该脚本时（非 DSH 环境），按下文原有流程执行。',
    '> 全文拿不到时不要静默跳过：`node bin/lit.mjs gaps --project <项目>` 出人工下载清单；',
    '> 下载的 PDF 放进 `<项目>/references/inbox/`，跑 `node bin/lit.mjs inbox --dir <项目>/references/inbox --project <项目> --create` 认身份入库。',
  ],
  'novelty-check': [
    '> **DSH 本机覆盖（有内核时优先；没有就忽略本横幅）**：prior-art 检索用',
    '> `node bin/lit.mjs lit "<idea 关键词>" --project <项目> --max 40` 出底稿，标题级查重读 `papers.json`；',
    '> `verdict=BLOCKED` 时先剔除未核实条目再判新。无 `bin/lit.mjs` 时按下文流程执行。',
    '> 全文拿不到时不要静默跳过：`node bin/lit.mjs gaps --project <项目>` 出人工下载清单；',
    '> 下载的 PDF 放进 `<项目>/references/inbox/`，跑 `node bin/lit.mjs inbox --dir <项目>/references/inbox --project <项目> --create` 认身份入库。',
  ],
  'idea-creator': [
    '> **DSH 本机覆盖（有内核时优先；没有就忽略本横幅）**：文献依据取自',
    '> `node bin/lit.mjs lit "<方向>" --project <项目>` 的 `literature/<slug>/review.md`，',
    '> 条目必须能在 `papers.json` 找到。无 `bin/lit.mjs` 时按下文流程执行。',
    '> 全文拿不到时不要静默跳过：`node bin/lit.mjs gaps --project <项目>` 出人工下载清单；',
    '> 下载的 PDF 放进 `<项目>/references/inbox/`，跑 `node bin/lit.mjs inbox --dir <项目>/references/inbox --project <项目> --create` 认身份入库。',
  ],
  'citation-audit': [
    '> **DSH 本机覆盖（有内核时优先；没有就忽略本横幅）**：先',
    '> `node bin/lit.mjs reconcile --bib <refs.bib> --collection "<名称>"` 对账，再',
    '> `node bin/lit.mjs verify <papers.json> --out verified.json` 逐条查真；未通过 verify 的按幻觉处理。',
    '> 无 `bin/lit.mjs` 时按下文流程执行。',
    '> 全文拿不到时不要静默跳过：`node bin/lit.mjs gaps --project <项目>` 出人工下载清单；',
    '> 下载的 PDF 放进 `<项目>/references/inbox/`，跑 `node bin/lit.mjs inbox --dir <项目>/references/inbox --project <项目> --create` 认身份入库。',
  ],
};

const families = ['', 'skills-codex', 'skills-codex-claude-review', 'skills-codex-gemini-review'];
let changed = 0;
let missing = 0;

for (const [skill, banner] of Object.entries(BANNERS)) {
  for (const fam of families) {
    const file = path.join(skillsRoot, fam, skill, 'SKILL.md');
    if (!fs.existsSync(file)) { if (fam === '') missing += 1; continue; }
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    // 1) 删掉旧横幅：从 '> **DSH 本机覆盖' 起连续 '>' 行 + 紧邻的一个空行
    const start = lines.findIndex((l) => l.startsWith('> **DSH 本机覆盖'));
    if (start >= 0) {
      let end = start;
      while (end < lines.length && lines[end].startsWith('>')) end += 1;
      if (lines[end] === '') end += 1;
      lines.splice(start, end - start);
    }

    // 2) 找 frontmatter 结束行，插在它后面
    let seen = 0; let fmEnd = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].trim() === '---') { seen += 1; if (seen === 2) { fmEnd = i; break; } }
    }
    if (fmEnd < 0) { console.error(`skip（frontmatter 未闭合）：${file}`); continue; }
    lines.splice(fmEnd + 1, 0, '', ...banner, '');

    const next = lines.join('\n');
    if (!dry) fs.writeFileSync(file, next, 'utf8');
    changed += 1;
    console.log(`${dry ? '[dry] ' : ''}patched ${path.relative(tree, file)}`);
  }
}
console.log(`\n${dry ? '可改' : '已改'} ${changed} 个文件；主技能缺失 ${missing} 个（${tree}）`);
