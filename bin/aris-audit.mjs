// ARIS 技能树「在 DSH 里能不能跑」体检：工具面、悬空引用、嵌套调用。
// 用法：node bin/aris-audit.mjs [--tree <ARIS 根>] [--out <dir>] [--json]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : (args[i + 1] ?? true); };

const tree = path.resolve(String(flag('tree', path.join(process.cwd(), '.dsh', 'skills', 'aris'))));
const outDir = path.resolve(String(flag('out', path.join('work', '2026-11-07-aris-audit'))));
const skillsRoot = [path.join(tree, 'references', 'skills'), path.join(tree, 'skills')]
  .find((p) => fs.existsSync(p));
if (!skillsRoot) { console.error(`找不到 skills 目录：${tree}`); process.exit(1); }

// allowed-tools → DSH 实际可用的工具
const TOOLMAP = {
  Bash: 'pwsh', Read: 'read', Write: 'write', Edit: 'edit', Glob: 'glob', Grep: 'grep',
  WebSearch: 'web_search', WebFetch: 'web_fetch', Task: 'subagent', Agent: 'subagent',
  TodoWrite: 'todo_write', NotebookEdit: null, Skill: 'read（读 SKILL.md）', SlashCommand: null,
  KillShell: 'job_kill', BashOutput: 'job_output', MultiEdit: 'edit',
};
const MCP_AVAILABLE = new Set(); // 本机没有装任何 MCP server

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (mm) data[mm[1]] = mm[2].trim();
  }
  return { data, body: text.slice(m[0].length) };
}

function splitTools(v) {
  if (!v) return [];
  const out = []; let depth = 0; let cur = '';
  for (const ch of v) {
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const skillDirs = fs.readdirSync(skillsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('skills-'))
  .map((d) => d.name);
const skillSet = new Set(skillDirs);

const rows = [];
const danglingAll = [];
const edges = [];

for (const name of skillDirs) {
  const file = path.join(skillsRoot, name, 'SKILL.md');
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(text);

  const rawTools = splitTools(data['allowed-tools']);
  const tools = rawTools.map((t) => {
    const base = t.replace(/\(.*$/, '').trim();
    if (base.startsWith('mcp__')) {
      const server = base.split('__')[1] || '?';
      return { token: t, kind: 'mcp', server, ok: MCP_AVAILABLE.has(server), mapped: null };
    }
    const mapped = Object.prototype.hasOwnProperty.call(TOOLMAP, base) ? TOOLMAP[base] : undefined;
    return { token: t, kind: 'builtin', ok: mapped !== undefined && mapped !== null, mapped, base };
  });
  const badTools = tools.filter((t) => !t.ok);
  const mcpServers = [...new Set(tools.filter((t) => t.kind === 'mcp').map((t) => t.server))];

  // 悬空引用：$ARIS_HOME/...、references/...、tools/*.py
  const dangling = [];
  const checkPath = (rel) => {
    const clean = rel.replace(/[)`'"，。；:,]+$/, '').replace(/,+$/, '');
    if (!clean || clean.includes('<') || clean.includes('*')) return;
    if (!fs.existsSync(path.join(tree, clean))) dangling.push(clean);
  };
  for (const m of body.matchAll(/\$ARIS_HOME\/([^\s`'"()]+)/g)) checkPath(m[1]);
  for (const m of body.matchAll(/references\/skills\/([a-z0-9-]+)\/SKILL\.md/g)) {
    if (!skillSet.has(m[1])) dangling.push(`skill:${m[1]}`);
  }
  for (const m of body.matchAll(/tools\/([a-z0-9_.-]+\.py)/g)) checkPath(`tools/${m[1]}`);
  const uniq = [...new Set(dangling)];
  if (uniq.length) danglingAll.push({ skill: name, paths: uniq });

  // 嵌套技能引用
  const refs = new Set();
  for (const other of skillSet) {
    if (other === name) continue;
    const re = new RegExp(`(^|[^a-z0-9-])${other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9-]|$)`, 'i');
    if (re.test(body)) refs.add(other);
  }
  for (const r of refs) edges.push({ from: name, to: r });

  rows.push({
    name,
    bytes: text.length,
    tools: tools.map((t) => t.token),
    badTools,
    mcpServers,
    dangling: uniq,
    nested: [...refs].sort(),
  });
}

const referenced = new Set(edges.map((e) => e.to));
const orphans = rows.filter((r) => !referenced.has(r.name)).map((r) => r.name);
const withBadTools = rows.filter((r) => r.badTools.length);
const withMcp = rows.filter((r) => r.mcpServers.length);
const withDangling = rows.filter((r) => r.dangling.length);

const summary = {
  tree,
  skills: rows.length,
  badToolsSkills: withBadTools.length,
  mcpSkills: withMcp.length,
  danglingSkills: withDangling.length,
  edges: edges.length,
  orphans: orphans.length,
};

const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const lines = [];
lines.push(`# ARIS 技能树体检：${tree}`);
lines.push('');
lines.push(`- 技能 ${summary.skills} 个；工具面有缺口 ${summary.badToolsSkills}；引用 MCP ${summary.mcpSkills}；悬空引用 ${summary.danglingSkills}；嵌套边 ${summary.edges}；无人引用 ${summary.orphans}`);
lines.push('');
lines.push('## 工具面缺口（按缺得多的排）');
for (const r of withBadTools.sort((a, b) => b.badTools.length - a.badTools.length)) {
  const list = r.badTools.map((t) => `${t.token}${t.kind === 'mcp' ? `(无 MCP:${t.server})` : (t.mapped === null ? '(无替代)' : '')}`).join(', ');
  lines.push(`- **${r.name}**：${list}`);
}
lines.push('');
lines.push('## 悬空引用');
for (const d of withDangling) lines.push(`- **${d.name}**：${d.dangling.join(', ')}`);
lines.push('');
lines.push('## 无人引用的技能（入口/孤立）');
lines.push(orphans.join(', ') || '（无）');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify({ summary, rows }, null, 1), 'utf8');
fs.writeFileSync(path.join(outDir, 'audit.md'), lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
console.log(`\n已写：${path.join(outDir, 'audit.json')} / audit.md`);
