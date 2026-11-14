#!/usr/bin/env node
// model-worker.mjs — 本机「多模型工人」替代品
//
// 上游 ARIS 技能里的 mcp__model-worker__worker 是「另起一个模型干粗活」的 MCP。
// DSH 不装那个 MCP，这里用 DeepSeek 平台 API 直接做同样的事：
//   node bin/model-worker.mjs worker --in draft.md --role reviewer --out review.md
//
// 也当 CLI 用：node bin/model-worker.mjs ask "把这段翻成英文" --max-tokens 800
//
// 密钥来源（按优先级）：进程环境 DEEPSEEK_API_KEY → ~/.dsh/.credentials.yaml → .dsh/model-worker.json
// 不打印密钥；--debug 只显示来源与长度。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROLES = {
  reviewer: '你是严格的同行评审人。只指出可验证的问题：逻辑漏洞、证据不足、与文献矛盾、过度声明。输出分级清单（blocking / major / minor），每条给出修改建议。不要复述原文，不要客套。',
  critic: '你是对抗性审查者。任务是找出让这篇工作被拒的最强理由（kill argument），按杀伤力排序，每条附上「如何补实验/补论证」。',
  writer: '你是学术写作助手。保持作者原有观点与术语，只改表达：压缩冗余、补主谓、统一术语。输出改后全文，不要解释。',
  planner: '你是实验规划者。把目标拆成可执行的步骤，每步写清输入、产出、验收标准与失败回退。不要写空话。',
  coder: '你是严谨的程序员。给出可直接运行的最小实现，标注依赖与边界条件，不要伪代码。',
  translator: '你是学术翻译。中文译英文时保留术语与公式编号，英文译中文时保持学术语体。只输出译文。',
};

function die(msg, code = 1) {
  console.error(`model-worker: ${msg}`);
  process.exit(code);
}

function readCredFile() {
  const p = path.join(os.homedir(), '.dsh', '.credentials.yaml');
  try {
    const t = fs.readFileSync(p, 'utf8');
    const m = /^\s*DEEPSEEK_API_KEY:\s*['"]?([A-Za-z0-9_\-]+)['"]?\s*$/m.exec(t);
    if (m) return { key: m[1], source: 'credentials.yaml' };
  } catch { /* ignore */ }
  const local = path.join(ROOT, '.dsh', 'model-worker.json');
  try {
    const j = JSON.parse(fs.readFileSync(local, 'utf8'));
    if (j.apiKey) return { key: j.apiKey, source: 'model-worker.json' };
  } catch { /* ignore */ }
  return null;
}

function resolveKey() {
  const env = process.env.DEEPSEEK_API_KEY || process.env.MODEL_WORKER_API_KEY;
  if (env) return { key: env.trim(), source: 'env' };
  const f = readCredFile();
  if (f) return f;
  die('未找到 DEEPSEEK_API_KEY（环境变量或 ~/.dsh/.credentials.yaml）');
}

function arg(name, dflt = '') {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}
function flag(name) { return process.argv.includes(`--${name}`); }

function readInput() {
  const inFile = arg('in');
  if (inFile) return fs.readFileSync(inFile, 'utf8');
  const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && arr[i - 1].startsWith('--')));
  if (positional.length) return positional.join(' ');
  if (!process.stdin.isTTY) {
    try { return fs.readFileSync(0, 'utf8'); } catch { /* ignore */ }
  }
  return '';
}

async function ask({ prompt, system, model, maxTokens, temperature }) {
  const { key, source } = resolveKey();
  const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  if (flag('debug')) console.error(`model-worker: key=${source} len=${key.length} model=${model}`);
  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    max_tokens: Number(maxTokens) || 2000,
    temperature: Number.isFinite(Number(temperature)) && temperature !== '' ? Number(temperature) : 0.3,
    stream: false,
  };
  const t0 = Date.now();
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  const text = await r.text();
  if (!r.ok) {
    const hint = r.status === 401 ? '（密钥无效或过期）' : r.status === 402 ? '（余额不足）' : r.status === 429 ? '（限流，稍后重试）' : '';
    die(`HTTP ${r.status} ${hint} ${text.slice(0, 300)}`);
  }
  let j;
  try { j = JSON.parse(text); } catch { die(`响应不是 JSON: ${text.slice(0, 200)}`); }
  const content = j.choices?.[0]?.message?.content || '';
  return { content, model: j.model || model, usage: j.usage || null, ms: Date.now() - t0 };
}

async function main() {
  const sub = process.argv[2];
  if (!sub || sub === '--help' || sub === 'help') {
    console.log(`用法:
  node bin/model-worker.mjs ask "<prompt>" [--role reviewer] [--model deepseek-chat] [--max-tokens 2000] [--temperature 0.3] [--out file]
  node bin/model-worker.mjs worker --in <file> [--role reviewer] [--out <file>]
  node bin/model-worker.mjs roles

角色: ${Object.keys(ROLES).join(', ')}
密钥: 环境变量 DEEPSEEK_API_KEY → ~/.dsh/.credentials.yaml`);
    return;
  }
  if (sub === 'roles') {
    for (const [k, v] of Object.entries(ROLES)) console.log(`${k}: ${v.slice(0, 40)}…`);
    return;
  }
  if (sub !== 'ask' && sub !== 'worker') die(`未知子命令 ${sub}（ask | worker | roles）`);

  const prompt = readInput();
  if (!prompt.trim()) die('输入为空：用 --in 文件、位置参数，或 stdin 传入');

  let system = arg('system');
  const role = arg('role');
  if (!system && role) {
    if (!ROLES[role]) die(`未知角色 ${role}（可选 ${Object.keys(ROLES).join(', ')}）`);
    if ((role === 'reviewer' || role === 'critic') && !flag('allow-same-family')) {
      die(
        '审查必须换模型：请用 Kimi 邮箱送审\n' +
        '  node bin/aris-review.mjs --project <项目> --target <稿.md> --slot <N> --enqueue\n' +
        '  node bin/aris-review.mjs --collect-all --mailbox "<MAILBOX>"\n' +
        '（确需同族模型自审时加 --allow-same-family，正式评审不要这么做）',
      );
    }
    if (role === 'reviewer' || role === 'critic') console.error('model-worker: 警告——同族模型自审，不能当正式评审');
    system = ROLES[role];
  }

  const res = await ask({
    prompt,
    system,
    model: arg('model', process.env.MODEL_WORKER_MODEL || 'deepseek-chat'),
    maxTokens: arg('max-tokens', '2000'),
    temperature: arg('temperature', '0.3'),
  });

  const out = arg('out');
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, res.content, 'utf8');
    console.error(`model-worker: 写入 ${out}（${res.content.length} 字，${res.ms}ms，model=${res.model}）`);
  } else {
    process.stdout.write(res.content.endsWith('\n') ? res.content : res.content + '\n');
  }
  if (flag('json')) console.error(JSON.stringify({ model: res.model, usage: res.usage, ms: res.ms }));
}

main().catch((e) => die(e?.message || String(e)));
