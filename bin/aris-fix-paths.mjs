// DSH 移植版路径修正：技能正文里的 `skills/<name>/...` 实际位于 `references/skills/<name>/...`。
// 上游仓库布局是 skills/ 在根，移植版多了一层 references/，所以只改 DSH 树，不改上游副本。
// 用法：node bin/aris-fix-paths.mjs [--tree <ARIS 根>] [--apply]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : (args[i + 1] ?? true); };
const apply = args.includes('--apply');

const tree = path.resolve(String(flag('tree', path.join(process.cwd(), '.dsh', 'skills', 'aris'))));
const skillsRoot = [path.join(tree, 'references', 'skills'), path.join(tree, 'skills')].find((p) => fs.existsSync(p));
if (!skillsRoot) { console.error(`找不到 skills 目录：${tree}`); process.exit(1); }
if (path.basename(path.dirname(skillsRoot)) !== 'references') {
  console.error('这不是移植版布局（skills/ 直接在根），不需要修正');
  process.exit(0);
}

const names = fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const set = new Set(names);

let changed = 0;
let total = 0;
for (const name of names) {
  const file = path.join(skillsRoot, name, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  let hits = 0;
  const resolve1 = (target) => set.has(target) && fs.existsSync(path.join(skillsRoot, target));
  // 1) $ARIS_HOME/skills/<name>/... → $ARIS_HOME/references/skills/<name>/...
  let next = text.replace(/(\$ARIS_HOME\/)skills\/([a-z0-9-]+)\//g, (m, pre, target) => {
    if (!resolve1(target)) return m;
    hits += 1;
    return `${pre}references/skills/${target}/`;
  });
  // 2) 裸 skills/<name>/...（前面不是 references/ 或路径字符）→ references/skills/<name>/...
  next = next.replace(/(?<!references\/)(?<![a-z0-9/-])skills\/([a-z0-9-]+)\//g, (m, target) => {
    if (!resolve1(target)) return m;
    hits += 1;
    return `references/skills/${target}/`;
  });
  if (hits) {
    total += hits;
    changed += 1;
    console.log(`${apply ? '' : '[dry] '}${name}: ${hits} 处`);
    if (apply) fs.writeFileSync(file, next, 'utf8');
  }
}
console.log(`\n${apply ? '已改' : '可改'} ${changed} 个文件 / ${total} 处（${tree}）`);
