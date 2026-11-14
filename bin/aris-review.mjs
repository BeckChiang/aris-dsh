#!/usr/bin/env node
/**
 * bin/aris-review.mjs — ARIS 跨模型审查桥（DSH 移植版）
 *
 * 把一份草稿/计划/实验说明交给独立审稿模型（默认本机 Ollama 的 OpenAI 兼容端点），
 * 取回结构化审查，原文与结构化结果一起落盘，并登记到项目状态里。
 *
 * ---------------------------------------------------------------------------
 * 审查 prompt 的组装规则（改动本文件时请一并更新这里）
 * ---------------------------------------------------------------------------
 * 1. 配置：命令行 > <project>/.aris/reviewer.json > 内置默认
 *    （backend=ollama, model=qwen3:8b, base-url=http://127.0.0.1:11434/v1）。
 * 2. system 段 =
 *      审查者角色 + ARIS 审查契约要点 + 逐字 scope-limits 禁止清单 + 输出格式。
 *    逐字清单的来源文件（运行时读取，读不到用内置副本）：
 *      .dsh/skills/aris/references/skills/shared-references/review-scope-limits.md
 *      （"## The block" 下的 fenced 段落，逐字嵌入，不改写）
 *    契约要点来源：
 *      .../shared-references/reviewer-backends.md（保存原始回复再解读、身份必须
 *      由回复自报、超时/截断/错误不是 verdict、同家族只能 provisional）
 * 3. user 段 = 轮次/时段标注 + 目标文件绝对路径 + 文件全文。
 *    文件全文是唯一证据，执行者的转述一律不算证据（reviewer-backends.md
 *    「Artifact-grounded reviews」）。文件过长时按 --max-chars 截断并标注。
 * 4. 输出约定：回复第一行 `Reviewer-Model: <标识>`（身份自报），正文里必须有
 *    `VERDICT: accept|revise|reject`。verdict 用宽松解析：先找显式标注，再退到
 *    关键字（reject > revise > accept 从严），都没有记 unknown。
 * 5. 传输：POST <base-url>/chat/completions，默认 180s 超时，失败重试一次
 *    （仅网络错误/408/429/5xx；4xx 鉴权与参数错误不重试）。
 * 6. 落盘：<project>/.aris/reviews/<ts>-slot<N>.md + 同名 .json；
 *    追加 <project>/.aris/meta/events.jsonl；state.json 存在时追加
 *    artifacts.reviews（不存在只提示，不伪造 state）。
 * 7. 退出码：0 成功（verdict=reject 也返回 0，流程由上层决定）；2 配置/网络错误。
 *
 * 用法：
 *   node bin/aris-review.mjs --project <dir> --target <file.md> --slot 1 --tier T1 \
 *     [--backend ollama|openai] [--base-url ...] [--model qwen3:8b] \
 *     [--api-key-env OLLAMA_API_KEY] [--round N] [--timeout 180] \
 *     [--max-chars 100000] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const REF_DIR = path.join(REPO_ROOT, '.dsh', 'skills', 'aris', 'references', 'skills', 'shared-references');

const DEFAULTS = {
  backend: 'ollama',
  model: 'qwen3:8b',
  baseUrl: 'http://127.0.0.1:11434/v1',
  timeoutSec: 180,
  maxChars: 100000,
  tier: 'T1',
  slot: 1,
  requesterFamily: 'DeepSeek（由 DSH 承载）',
};

const USAGE = `用法: node bin/aris-review.mjs --project <dir> --target <file.md> [选项]

必填:
  --project <dir>        项目根目录（.aris/ 与 .aris/reviewer.json 所在处）
  --target <file.md>     被审阅的目标文件（相对路径按 project 解析）

选项:
  --slot <N>             审查槽位编号，默认 1
  --tier <T1|T2|...>     审查深度档位，默认 T1
  --round <N>            第几轮（默认读 .aris/state.json 的 round，读不到为 1）
  --backend <name>       ollama | openai | openai-compatible（默认 ollama）
  --base-url <url>       OpenAI 兼容端点（默认 http://127.0.0.1:11434/v1）
  --model <name>         模型名（默认 qwen3:8b）
  --api-key-env <NAME>   API key 所在环境变量（默认 OLLAMA_API_KEY / OPENAI_API_KEY）
  --timeout <秒>         HTTP 超时，默认 180
  --max-chars <n>        目标文件最大字符数，默认 100000（0 = 不截断）
  --dry-run              只打印将发送的 prompt 与配置，不发请求
  --enqueue              邮箱模式：把请求写进 <mailbox>/in/，不调用任何后端（给人工/Kimi 定时任务取用）
  --collect              邮箱模式：收取 <mailbox>/out/*.reply.md，解析并入 <state>/reviews/
  --collect-all          邮箱模式：一次收取所有项目（按 projects.json 定位项目），需配 --mailbox
  --queue                邮箱模式：只重算 queue.md 索引（取件人入口），不投递不收集
  --mailbox <dir>        邮箱目录，默认 <project>/.aris/mailbox
  --state-dir <dir>      状态目录，默认 <project>/.aris（等价 ARIS_STATE_DIR）
                         项目在同步盘/Kimi 工作区时用它把状态留到 DSH 工作区
  --include <file>       邮箱模式：把该文件的绝对路径写进请求，取件人可直接打开核对
                         （可重复；只列路径与大小，不嵌入正文）
  --purge-trash [天数]   清空 <mailbox>/trash/ 里超过 N 天（默认 30）的归档，缺省不动
                         入账成功的请求/回复会被自动移到 trash/<base>/，不再留在 in/out
  --slots                只列出 reviewer.json 里配好的审查者（slot / via / 后端）后退出
  --reviewer <id>        按 reviewers[].id 指定审查者（默认按 --slot 匹配）
  -h, --help             显示本帮助

reviewer.json 支持两种写法（旧写法完全兼容）：
  1) 单后端扁平：{"backend":"ollama","model":"qwen3:8b","base_url":"…","tier":"T2"}
  2) 多审查者数组（按 slot 选，命令行参数仍可覆盖）：
     {"reviewers":[
        {"slot":1,"via":"kimi-mailbox","label":"Kimi 邮箱审稿","tier":"T2"},
        {"slot":2,"backend":"openai","model":"…","base_url":"…","label":"同机异模型"}
      ]}
     via=kimi-mailbox → 直接走邮箱（等价 --enqueue），不调用任何本地/远端后端；
     via 缺省为 direct（就是旧行为）。命令里显式给 --backend/--model/--base-url = 强制直连。

退出码: 0 成功（含 verdict=reject）；2 配置/网络错误。`;

// ---------------------------------------------------------------------------
// 参数与配置
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    let key, val;
    if (eq > -1) { key = a.slice(2, eq); val = a.slice(eq + 1); }
    else {
      key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { val = true; }
      else { val = next; i++; }
    }
    if (key === 'include') {
      if (val !== true) { out.include = out.include || []; out.include.push(val); }
      continue;
    }
    out[key] = val;
  }
  return out;
}

/** 命令行 > .aris/reviewer.json > 默认 */
function resolveConfig(args) {
  const cfg = { ...DEFAULTS };
  const sources = {};

  // 项目配置
  const project = path.resolve(args.project || '.');
  // `.aris` 状态根：--state-dir > 环境变量 ARIS_STATE_DIR > <project>/.aris
  // 项目放在同步盘 / Kimi 工作区、状态要留在 DSH 工作区时用前两者。
  const stateArg = args['state-dir'];
  const stateEnv = process.env.ARIS_STATE_DIR;
  const stateDir = stateArg && stateArg !== true
    ? path.resolve(project, String(stateArg))
    : (stateEnv && stateEnv.trim() ? path.resolve(project, stateEnv.trim()) : path.join(project, '.aris'));
  cfg.stateDir = stateDir;
  const cfgPath = path.join(stateDir, 'reviewer.json');
  let fileCfg = {};
  if (fs.existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(stripBom(fs.readFileSync(cfgPath, 'utf8')));
      if (!fileCfg || typeof fileCfg !== 'object' || Array.isArray(fileCfg)) throw new Error('不是一个 JSON 对象');
    } catch (e) {
      fail(`配置文件 ${cfgPath} 解析失败：${e.message}。请修正或删除该文件。`);
    }
  }
  const fileMap = {
    backend: fileCfg.backend,
    model: fileCfg.model,
    baseUrl: fileCfg.base_url ?? fileCfg.baseUrl ?? fileCfg['base-url'],
    timeoutSec: fileCfg.timeout ?? fileCfg.timeout_sec,
    maxChars: fileCfg.max_chars ?? fileCfg.maxChars,
    tier: fileCfg.tier,
    apiKeyEnv: fileCfg.api_key_env ?? fileCfg.apiKeyEnv,
    round: fileCfg.round,
    requesterFamily: fileCfg.requester_family ?? fileCfg.requesterFamily,
  };
  for (const [k, v] of Object.entries(fileMap)) {
    if (v !== undefined && v !== null && v !== '') { cfg[k] = v; sources[k] = '.aris/reviewer.json'; }
  }

  // 命令行
  const cliMap = {
    backend: args.backend,
    model: args.model,
    baseUrl: args['base-url'] ?? args.baseUrl,
    timeoutSec: args.timeout,
    maxChars: args['max-chars'],
    tier: args.tier,
    apiKeyEnv: args['api-key-env'],
    slot: args.slot,
    round: args.round,
    requesterFamily: args['requester-family'],
  };
  for (const [k, v] of Object.entries(cliMap)) {
    if (v !== undefined && v !== null && v !== '') { cfg[k] = v; sources[k] = '命令行'; }
  }

  // reviewers[]：按 slot 选审查者（多后端扇出）。没有这个数组就退回上面的单后端扁平配置。
  const reviewers = Array.isArray(fileCfg.reviewers)
    ? fileCfg.reviewers.filter((r) => r && typeof r === 'object')
    : null;
  cfg.reviewers = reviewers;
  if (reviewers && reviewers.length) {
    const slotNo = Number(cfg.slot);
    const picked = (args.reviewer
      && reviewers.find((r) => String(r.id ?? r.name ?? '') === String(args.reviewer)))
      || reviewers.find((r) => Number(r.slot) === slotNo)
      || null;
    if (!picked) {
      const avail = reviewers.map((r) => r.slot).filter((s) => s !== undefined).join(', ') || '无';
      fail(`reviewer.json 的 reviewers[] 里没有 slot=${slotNo} 的条目（可用 slot：${avail}）。`);
    }
    cfg.reviewer = picked;
    const pickMap = {
      backend: picked.backend,
      model: picked.model,
      baseUrl: picked.base_url ?? picked.baseUrl ?? picked['base-url'],
      timeoutSec: picked.timeout ?? picked.timeout_sec,
      maxChars: picked.max_chars ?? picked.maxChars,
      tier: picked.tier,
      apiKeyEnv: picked.api_key_env ?? picked.apiKeyEnv,
    };
    for (const [k, v] of Object.entries(pickMap)) {
      if (v === undefined || v === null || v === '') continue;
      if (sources[k] === '命令行') continue; // 命令行永远最高优先
      cfg[k] = v;
      sources[k] = `reviewers[slot=${picked.slot ?? '?'}]`;
    }
    cfg.via = String(picked.via || 'direct').toLowerCase();
    cfg.reviewerLabel = picked.label || picked.id || picked.name || `slot${picked.slot ?? cfg.slot}`;
    cfg.modelHint = picked.model_hint ?? picked.modelHint ?? '';
  } else {
    cfg.via = 'direct';
    cfg.reviewerLabel = `slot${cfg.slot}`;
  }

  // 类型归一
  cfg.slot = toPositiveInt(cfg.slot, '--slot');
  cfg.timeoutSec = toPositiveInt(cfg.timeoutSec, '--timeout');
  cfg.maxChars = Math.max(0, Number(cfg.maxChars) || 0);

  // 命令行显式给了后端参数 = 强制直连，覆盖 reviewers[].via
  const explicitBackend = ['backend', 'baseUrl', 'model']
    .some((k) => sources[k] === '命令行');
  if (cfg.via === 'kimi-mailbox' && explicitBackend) cfg.via = 'direct';

  if (!['direct', 'kimi-mailbox'].includes(cfg.via)) {
    fail(`reviewers[].via 只能是 direct | kimi-mailbox，当前为 "${cfg.via}"。`);
  }

  if (cfg.via === 'kimi-mailbox') {
    // 邮箱模式不碰网络，后端字段只作记录（谁真正生成结论由取件人决定，Model 由回复首行自报）
    cfg.backend = 'kimi-mailbox';
    cfg.baseUrl = '-';
    if (sources.model !== '命令行') cfg.model = '（由取件的 Kimi 客户端选择）';
  } else {
    const backend = String(cfg.backend).toLowerCase();
    cfg.backend = backend === 'openai-compatible' ? 'openai' : backend;
    if (!['ollama', 'openai'].includes(cfg.backend)) {
      fail(`未知 backend "${cfg.backend}"，可选 ollama | openai | openai-compatible（或 reviewers[].via=kimi-mailbox）。`);
    }
    cfg.baseUrl = String(cfg.baseUrl).replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(cfg.baseUrl)) fail(`--base-url 必须是 http(s) 地址，当前为 "${cfg.baseUrl}"。`);
    cfg.apiKeyEnv = cfg.apiKeyEnv || (cfg.backend === 'ollama' ? 'OLLAMA_API_KEY' : 'OPENAI_API_KEY');
  }
  cfg.project = project;
  cfg.sources = sources;
  cfg.configPath = fs.existsSync(cfgPath) ? cfgPath : null;
  return cfg;
}

/** Windows 记事本等工具会给 JSON 写 BOM，直接 JSON.parse 会报 "Unexpected token" */
function stripBom(s) {
  return String(s).replace(/^\uFEFF/, '');
}

function toPositiveInt(v, flag) {  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) fail(`${flag} 需要正整数，当前为 "${v}"。`);
  return n;
}

function fail(msg, code = 2) {
  console.error(`✖ ${msg}`);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// 审查契约素材
// ---------------------------------------------------------------------------

const SCOPE_LIMITS_FALLBACK = `=== SCOPE LIMITS (these bound what you PROPOSE, never what you look for) ===
Report anything that is actually wrong here — including a rare-looking case, if
this repo actually produces it. Then keep the fix in scope:
1. This is a RESEARCH-WORKFLOW tool, not a security paper. Verification is
   welcome; over-defense is not. Assume a cooperating operator on their own
   machine — a malicious local user is NOT in the threat model.
2. Do NOT propose SHA / hash / content-fingerprint / digest-binding schemes.
   Reporting a real defect in hashing code that already exists is fine.
3. NO speculative machinery: do not add feature flags, migration frameworks,
   compat layers, wrappers, pins, or similar mechanisms unless evidence shows
   a current repo defect they fix or an explicit existing invariant they must
   preserve. "Load-bearing", "compatibility", and "not scaffolding" are labels,
   not evidence. Point to the failing path/artifact or invariant, and check the
   proposal's factual premises, such as whether a named package version exists.
4. NO corner-case obsession: exotic encodings, symlink races, RTL text and
   millisecond races are out of scope unless you can show the case arises here.
5. Where a rubric or checklist is genuinely needed, do not over-mechanize
   judgement. A clear sentence a human reads beats a scored table nobody
   maintains.
Exception: code that runs remote commands, starts a network service, or installs
an MCP server runs on the user's machine with their credentials — trust-boundary
findings there are in scope and the default is strict.
Say plainly when something is correct. Do not manufacture findings.`;

/** 从 review-scope-limits.md 的 "## The block" 里逐字取出 fenced 段；失败回退内置副本。 */
function loadScopeLimits() {
  const file = path.join(REF_DIR, 'review-scope-limits.md');
  try {
    const md = fs.readFileSync(file, 'utf8');
    const m = md.match(/## The block[\s\S]*?```[a-zA-Z]*\n([\s\S]*?)\n```/);
    if (m && m[1].includes('SCOPE LIMITS')) return { text: m[1], source: file };
  } catch { /* 回退 */ }
  return { text: SCOPE_LIMITS_FALLBACK, source: '（内置副本，来源 review-scope-limits.md）' };
}

const CONTRACT_POINTS = `【审查契约要点】来源：shared-references/reviewer-backends.md、reviewer-independence.md
- 你是独立审稿人，不是执行者。只看证据：目标文件全文就是唯一证据，执行者的转述、结论和
  "已经验证过"一律不算证据；发现文档与自身事实矛盾就指出来。
- 默认假设工作有问题，尽力找出真正错误；但也要在确实没有问题时明说无误，不许制造问题。
- 先给出原始判断，再给结论。超时、截断、调用失败都不是否决（verdict），此时应说明不可判。
- 身份必须由你自己声明：回复第一行写 \`Reviewer-Model: <你的模型标识>\`。缺这行即视为身份未验证。
- 跨家族审阅才是真正的对抗；同家族（例如执行者也是通义千问系）只能给 provisional 结论，
  请在摘要中注明这一点。
- 不要替我修改文件，也不要执行命令；只输出审查意见。`;

const OUTPUT_FORMAT = `【输出格式（必须遵守）】
第一行（单独一行）：
Reviewer-Model: <你的模型标识>

然后按以下小节输出：
## 结论
VERDICT: accept | revise | reject
（accept = 可以继续；revise = 需按问题清单修订后复审；reject = 方向/证据不成立，需重做）

## 评分
Score: X/10

## 摘要
2-5 句话，说明这份工作的核心判断。

## 主要问题（按严重度排序）
1. [问题] —— [证据/位置] —— [影响]
（没有问题就写"无"）

## 最小修复
针对上面每个问题给出能落地的最小修改（实验、分析或重写），不要提防御性脚手架、哈希绑定、
兼容层、极端 corner case 加固，除非本文件里确实有对应的真实缺陷。`;

function buildPrompts({ cfg, targetAbs, targetText, truncated, round, scope }) {
  const system = [
    '你是 ARIS 流水线里的独立审稿人（reviewer）。职责是对下面的研究材料做对抗式审查，帮作者找出真正的问题。',
    '',
    CONTRACT_POINTS,
    '',
    `【执行者】本请求由 DSH（DeepSeek Harness）发起并执行，执行者模型家族：${cfg.requesterFamily}。若你的家族与之相同，请在摘要里明确标注这份审查是 provisional（同家族）。`,
    '',
    `【审查范围限制（逐字引用，来源 ${scope.source}）】`,
    scope.text,
    '',
    OUTPUT_FORMAT,
    '',
    '回答用中文（专有名词可保留英文）。不要输出与审查无关的内容。',
  ].join('\n');

  const user = [
    `[Round ${round} · slot ${cfg.slot} · tier ${cfg.tier}]`,
    '',
    `项目：${cfg.project}`,
    `被审目标：${targetAbs}`,
    '',
    '以下是该文件的完整内容（唯一证据来源，请自行核对，不要相信任何转述）：',
    '--- FILE BEGIN ---',
    targetText,
    '--- FILE END ---',
    truncated ? `\n[注意] 文件超过上限被截断，以上不是全文；结论请标注这一限制。` : '',
    '',
    '请按 system 中规定的格式给出审查结论，第一行先声明 Reviewer-Model。',
  ].filter(Boolean).join('\n');

  return { system, user };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function chatOnce(cfg, apiKey, body, timeoutMs) {
  const url = `${cfg.baseUrl}/chat/completions`;
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON，下面按原文处理 */ }
    return { status: res.status, ok: res.ok, text, json, ms: Date.now() - started, url };
  } finally {
    clearTimeout(timer);
  }
}

/** 把一次失败翻译成可读中文原因；返回 {message, retryable} */
function explainFailure(err, cfg) {
  const cause = err?.cause || {};
  const raw = [err?.name, err?.message, cause.code, cause.message].filter(Boolean).join(' | ');
  const ollamaHint = 'Ollama 未启动：先运行 `ollama serve`（或 `ollama ps` 确认服务在跑）。';
  const timeout = err?.name === 'AbortError' || /aborted|timeout/i.test(raw);
  if (timeout) {
    return {
      message: `等待审查后端超过 ${cfg.timeoutSec}s 没有响应，已中止。本机模型首次加载可能较慢，可加大 --timeout。`,
      retryable: false,
    };
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(raw) || /fetch failed/i.test(raw)) {
    if (/ECONNREFUSED|ECONNRESET|EPIPE/i.test(raw)) {
      return {
        message: cfg.backend === 'ollama'
          ? `连不上 Ollama（${cfg.baseUrl}）：${ollamaHint}`
          : `连不上审查后端 ${cfg.baseUrl}：服务没启动，或地址/端口不对（检查 --base-url）。`,
        retryable: true,
      };
    }
    return { message: `网络不可达：${cfg.baseUrl}（${cause.code || raw}），检查地址与网络。`, retryable: true };
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return { message: `域名解析失败：${cfg.baseUrl} 的主机名找不到，检查 --base-url。`, retryable: false };
  }
  return { message: `请求失败：${raw}`, retryable: true };
}

function explainHttpFailure(res, cfg) {
  const bodyText = (res.text || '').slice(0, 800);
  let detail = bodyText;
  try {
    const j = JSON.parse(res.text);
    detail = j.error?.message || j.error?.code || j.message || bodyText;
  } catch { /* 保留原文 */ }
  if (res.status === 401 || res.status === 403) {
    return {
      message: `鉴权失败（HTTP ${res.status}）：检查环境变量 ${cfg.apiKeyEnv} 是否设置且有效。${detail ? `\n后端说：${detail}` : ''}`,
      retryable: false,
    };
  }
  if (res.status === 404) {
    return {
      message: `端点或模型不存在（HTTP 404）：确认 --base-url 以 /v1 结尾${cfg.backend === 'ollama' ? `，且模型已拉取（\`ollama pull ${cfg.model}\`）` : ''}。${detail ? `\n后端说：${detail}` : ''}`,
      retryable: false,
    };
  }
  if (res.status === 400 && /not found|no such model|unknown model/i.test(detail)) {
    return {
      message: `模型 "${cfg.model}" 不存在（HTTP 400）：${cfg.backend === 'ollama' ? `先 \`ollama pull ${cfg.model}\`。` : '检查模型名。'}${detail ? `\n后端说：${detail}` : ''}`,
      retryable: false,
    };
  }
  return {
    message: `审查后端返回 HTTP ${res.status}${detail ? `：${String(detail).slice(0, 400)}` : ''}`,
    retryable: res.status >= 500 || res.status === 408 || res.status === 429,
  };
}

async function callReviewer(cfg, prompts) {
  const apiKey = process.env[cfg.apiKeyEnv] || '';
  const body = {
    model: cfg.model,
    stream: false,
    temperature: 0.2,
    messages: [
      { role: 'system', content: prompts.system },
      { role: 'user', content: prompts.user },
    ],
  };
  const timeoutMs = cfg.timeoutSec * 1000;

  let lastProblem = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await chatOnce(cfg, apiKey, body, timeoutMs);
    } catch (e) {
      const problem = explainFailure(e, cfg);
      if (attempt === 1 && problem.retryable) {
        lastProblem = problem;
        console.error(`… 第 1 次请求失败，重试一次：${problem.message.split('\n')[0]}`);
        await sleep(1500);
        continue;
      }
      throw new ReviewError(problem.message);
    }
    if (res.ok && res.json) {
      if (!res.json.choices || !res.json.choices[0]) {
        throw new ReviewError(`后端返回成功但没有 choices 字段，视为无效回复（原始响应前 300 字：${res.text.slice(0, 300)}）`);
      }
      return { res, body };
    }
    const problem = explainHttpFailure(res, cfg);
    if (attempt === 1 && problem.retryable) {
      lastProblem = problem;
      console.error(`… 第 1 次请求失败（HTTP ${res.status}），重试一次`);
      await sleep(1500);
      continue;
    }
    throw new ReviewError(problem.message);
  }
  throw new ReviewError(lastProblem?.message || '未知错误');
}

class ReviewError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 结果解析
// ---------------------------------------------------------------------------

function stripThinking(text) {
  return String(text || '').replace(/<think[\s\S]*?<\/think>/gi, '').trim();
}

function parseReply(content) {
  const clean = stripThinking(content);
  const raw = String(content || '');

  // 身份
  const idm = clean.match(/Reviewer-Model\s*[:：]\s*([^\n]+)/i);
  const identity = idm ? `reviewer-declared:${idm[1].trim().slice(0, 120)}` : 'unverified:no Reviewer-Model header';

  // verdict：先找显式标注，再退到关键字（从严）
  let verdict = 'unknown';
  const labeled = clean.match(/VERDICT\s*[:：=]\s*\**\s*(accept|revise|reject)\b/i);
  if (labeled) verdict = labeled[1].toLowerCase();
  else {
    const lower = clean.toLowerCase();
    if (/\breject\b/.test(lower)) verdict = 'reject';
    else if (/\brevise\b/.test(lower)) verdict = 'revise';
    else if (/\baccept\b/.test(lower)) verdict = 'accept';
  }

  // 评分
  const start = clean.indexOf('## 结论');
  const scored = clean.match(/Score\s*[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  const score = scored ? Number(scored[1]) : null;

  // 摘要：## 摘要 到下一个 ## 之间
  let summary = '';
  const sum = clean.match(/##\s*摘要\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (sum) summary = sum[1].trim();
  if (!summary) {
    summary = clean
      .split('\n')
      .filter((l) => l.trim() && !/^#|^Reviewer-Model|^VERDICT|^Score/i.test(l.trim()))
      .slice(0, 3).join(' ').slice(0, 600);
  }
  summary = summary.replace(/\s+/g, ' ').trim().slice(0, 1200);

  // 风险：主要问题小节的编号/短横线条目
  const risks = [];
  const sec = clean.match(/##\s*(?:主要问题|风险|问题|弱点)[^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
  const src = sec ? sec[1] : '';
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (/^(?:[-*]|\d+[.)、])\s+/.test(t)) {
      const item = t.replace(/^(?:[-*]|\d+[.)、])\s+/, '').replace(/\*\*/g, '').trim();
      if (item && !/^没有?问题|^none\.?$/i.test(item)) risks.push(item.slice(0, 300));
    }
    if (risks.length >= 8) break;
  }

  return { clean, raw, identity, verdict, score, summary, risks, start };
}

// ---------------------------------------------------------------------------
// 落盘
// ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

function localStamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

function relTo(project, abs) {
  const rel = path.relative(project, abs).split(path.sep).join('/');
  // 项目外的绝对路径（例如共享邮箱在同步盘上）不写成 ../../.. 相对路径，避免歧义
  return rel === '' || rel.startsWith('..') ? abs.split(path.sep).join('/') : rel;
}

function appendEvent(cfg, entry) {
  const file = path.join(cfg.stateDir, 'meta', 'events.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // kind 与 event 双写：bin/aris.mjs 与 bin/aris-status.mjs 都按 kind 读取
  const rec = { ...entry, kind: entry.kind ?? entry.event };
  fs.appendFileSync(file, `${JSON.stringify(rec)}\n`, 'utf8');
}

function registerInState(cfg, entry) {
  const file = path.join(cfg.stateDir, 'state.json');
  if (!fs.existsSync(file)) {
    console.log(`ℹ 未找到 ${relTo(cfg.project, file)}，跳过状态登记（应由 bin/aris.mjs 初始化项目状态，本脚本不伪造）。`);
    return { updated: false, reason: 'missing' };
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`⚠ state.json 解析失败（${e.message}），跳过状态登记；审查结果已落盘。`);
    return { updated: false, reason: 'parse' };
  }
  if (!state || typeof state !== 'object') {
    console.error('⚠ state.json 不是对象，跳过状态登记。');
    return { updated: false, reason: 'invalid' };
  }
  state.artifacts = state.artifacts && typeof state.artifacts === 'object' ? state.artifacts : {};
  state.artifacts.reviews = Array.isArray(state.artifacts.reviews) ? state.artifacts.reviews : [];
  state.artifacts.reviews.push(entry);
  state.updated_at = entry.created_at;
  try {
    writeAtomic(file, `${JSON.stringify(state, null, 2)}\n`);
  } catch (e) {
    console.error(`⚠ 写入 state.json 失败（${e.message}），审查结果已落盘。`);
    return { updated: false, reason: 'write' };
  }
  return { updated: true, count: state.artifacts.reviews.length };
}

// ---------------------------------------------------------------------------
// 邮箱模式（人工 / Kimi Work 定时任务取件）
// ---------------------------------------------------------------------------
//
// 协议（目录默认 <project>/.aris/mailbox）：
//   in/<base>.request.md   本脚本写出，含元信息注释块 + 逐字 system/user prompt
//   out/<base>.reply.md    取件方写出，正文即审稿模型原始回复（第一行 Reviewer-Model）
//   processed.json         已收件的回复文件名，避免重复入账
//   queue.md               机器生成索引：PENDING 计数 + 待处理/已回复清单（取件人先读这个）
//   README.md              给取件人的固定说明
//   trash/<base>/          已入账的请求+回复成对归档（--purge-trash 清理，不影响 in/out）

const MAILBOX_README = `# ARIS 审查邮箱（in / out）

这个目录是 DSH 与「外部审稿人」（Kimi Work 定时任务、或人工）之间的文件协议。

## 目录约定

- \`in/<base>.request.md\` — DSH 写出的审稿请求。前半段是元信息与指令，
  正文里有两对标记：\`===== SYSTEM PROMPT BEGIN =====\` 与 \`===== SYSTEM PROMPT END =====\`
  之间是逐字 system prompt，\`===== USER PROMPT BEGIN =====\` 与 \`===== USER PROMPT END =====\`
  之间是逐字 user prompt。取这两段之间（不含标记行）的内容，原样使用。
- \`out/<base>.reply.md\` — 取件方写回的回复。**文件名必须与请求同名**，只把
  \`.request\` 换成 \`.reply\`。正文就是审稿模型的完整回复，不要加解释、不要改写。
- \`processed.json\` — DSH 收件记录，勿手改（邮箱在项目外时这条记录改存到项目里的
  \`.aris/mailbox-processed.json\`）。
- \`projects.json\` — 机器维护的「请求 → 所属项目」索引，收件时据此把回复送回正确项目。
  勿手改，也不要删（删了多项目收件就认不出归属）。

## 先看 queue.md（省时间的入口）

根目录的 \`queue.md\` 是机器生成的索引，含 \`PENDING: <数字>\` 与待处理/已有回复两份清单：

- \`PENDING: 0\` → 这一轮什么都不用做，回一句「无新请求」即可结束。
- \`PENDING: N\` → 只打开 \`## 待处理\` 里**最早的那一条**（\`in/\` 按文件名升序即时间序），
  不要遍历整个 \`in/\`，也不要在同一轮里接着处理下一条。

## 取件人（Kimi Work 定时任务）每次要做的事

1. 先读 \`queue.md\`；\`PENDING: 0\` 就结束。否则只看 \`## 待处理\` 里**最早的一条**。
2. 这一轮只处理这一条：读文件里的 SYSTEM PROMPT 与 USER PROMPT，把两段**原样**作为本轮任务的
   系统指令与用户内容执行**一次独立审查**，然后把模型回复原文写入 \`out/<base>.reply.md\`。
   写完即结束本轮，队列里其余请求留到下次唤醒——同一轮连审多个包，前面的证据会在后面的判定里串味。
3. 回复第一行必须是 \`Reviewer-Model: <你的模型标识>\`，正文里必须有
   \`VERDICT: accept|revise|reject\` 与 \`Score: N/10\`。
4. 不要修改 \`in/\` 里的任何文件，不要动 \`processed.json\`。
5. 本目录**只放审稿请求与回复**（\`in/*.request.md\`、\`out/*.reply.md\`、\`queue.md\`、本 README、
   \`processed.json\`）。不要在 \`in/\`、\`out/\` 里放其他文件或子目录。

## 归档（trash/）

DSH 收件成功后，会把这一对请求与回复从 \`in/\`、\`out/\` 移到 \`trash/<base>/\`，
邮箱里只留未处理的请求，你不需要手动删除任何文件。

\`trash/\` 由 DSH 管理；超过保留期（默认 30 天）的归档用
\`--purge-trash [天数]\` 手动清理，取件人不用管。

## 请求里可能列出「可直接读取的参考文件」

部分请求正文有 \`## 可直接读取的参考文件\` 一节，里面的路径若在你的工作区内，
你可以直接打开读取，用来核对数据、上下文或统计口径。

注意：**被审文件的嵌入全文仍是唯一证据**，参考文件只用于核对，不能替代，
也不能因为参考文件里写得好看就放宽判断。若路径打不开（不在你的工作区），
忽略它并在回复末尾说明一句即可。

## 多个项目共用一个邮箱

请求来自不同项目时，\`queue.md\` 的每条待处理项后面会标出项目名（如 \` · mypaper\`）。
DSH 侧用 \`--collect-all\` 一次收完所有项目的回复，各自落回自己项目的 \`.aris/reviews/\`：
归属靠 \`projects.json\` 判断，取件人不用关心请求属于哪个项目。

## DSH 侧收件

\`node bin/aris-review.mjs --project <dir> --collect\` 会把 \`out/\` 里的新回复
解析成 \`.aris/reviews/<ts>-slot<N>.{md,json}\` 并登记进 \`state.json\`。
`;

function mailboxDirs(cfg, args) {
  const raw = args.mailbox && args.mailbox !== true ? String(args.mailbox) : '.aris/mailbox';
  const root = path.isAbsolute(raw) ? raw : path.resolve(cfg.project, raw);
  // 邮箱在项目目录之外（例如同步盘上的跨机中转目录）时，收件记录留在项目里，
  // 这样 --collect 只读外部目录、写只落在工作区，不需要提权。
  const inside = !path.relative(cfg.project, root).startsWith('..') && !path.isAbsolute(path.relative(cfg.project, root));
  const ledger = inside
    ? path.join(root, 'processed.json')
    : path.join(cfg.stateDir, 'mailbox-processed.json');
  return {
    root,
    inDir: path.join(root, 'in'),
    outDir: path.join(root, 'out'),
    ledger,
    readme: path.join(root, 'README.md'),
    external: !inside,
  };
}

function ensureMailbox(mb) {
  fs.mkdirSync(mb.inDir, { recursive: true });
  fs.mkdirSync(mb.outDir, { recursive: true });
  if (!fs.existsSync(mb.readme) || fs.readFileSync(mb.readme, 'utf8') !== MAILBOX_README) {
    writeAtomic(mb.readme, MAILBOX_README);
  }
}

// queue.md：给取件人的单文件索引，避免它每次 ls 整个目录再逐个比对 out/
function projectsIndexFile(mb) {
  return path.join(mb.root, 'projects.json');
}

function readProjects(mb) {
  try {
    const j = JSON.parse(fs.readFileSync(projectsIndexFile(mb), 'utf8'));
    if (j && typeof j.projects === 'object' && j.projects) return j.projects;
  } catch { /* 首次运行或损坏：按空索引处理 */ }
  return {};
}

function rememberProject(mb, base, info) {
  const map = readProjects(mb);
  map[base] = info;
  try {
    writeAtomic(projectsIndexFile(mb), `${JSON.stringify({ schema: 1, projects: map }, null, 2)}
`);
  } catch { /* 索引只是优化，写不进去不影响取件 */ }
}

function queueSnapshot(mb) {
  const list = (dir, re) => {
    try {
      return fs.readdirSync(dir).filter((f) => re.test(f)).sort();
    } catch { return []; }
  };
  const reqs = list(mb.inDir, /\.request\.md$/).map((f) => f.replace(/\.request\.md$/, ''));
  // 只有「非空」回复才算已回：空回复会被 collect 跳过（不入 verdict、不写 .json），
  // 若这里按文件名把它算成已回，queue.md 的 PENDING 会归零，桥和面板都以为审稿完成了。
  const replied = (b) => {
    try { return fs.readFileSync(path.join(mb.outDir, `${b}.reply.md`), 'utf8').trim().length > 0; } catch { return false; }
  };
  const pending = reqs.filter((b) => !replied(b));
  const done = reqs.filter((b) => replied(b));
  return { reqs, pending, done };
}

function writeQueue(mb) {
  const { pending, done } = queueSnapshot(mb);
  const lines = [
    '# ARIS 邮箱待办（机器生成，勿手改）',
    '',
    `生成时间：${isoLocal(new Date())}`,
    `PENDING: ${pending.length}`,
    '',
    '## 待处理',
    '',
  ];
  const proj = readProjects(mb);
  const label = (b) => (proj[b] && proj[b].project ? ' · ' + path.basename(proj[b].project) : '');
  if (!pending.length) lines.push('（无）');
  for (const b of pending) lines.push(`- \`in/${b}.request.md\`${label(b)}`);
  lines.push('', '## 已有回复（跳过）', '');
  if (!done.length) lines.push('（无）');
  for (const b of done) lines.push(`- \`${b}\`${label(b)}`);
  lines.push('');
  const file = path.join(mb.root, 'queue.md');
  try {
    writeAtomic(file, lines.join('\n'));
    return { file, pending: pending.length };
  } catch (e) {
    // 邮箱在项目外时可能没有写权限；索引只是优化，失败不阻断
    return { file, pending: pending.length, error: e.message };
  }
}

function cmdQueue(cfg, args, mb) {
  ensureMailbox(mb);
  const q = writeQueue(mb);
  const { pending, done } = queueSnapshot(mb);
  if (q.error) {
    console.error(`✖ 写入 ${q.file} 失败：${q.error}`);
    return 2;
  }
  console.log(`✔ 已更新 ${q.file}：待处理 ${pending.length} 条，已回复 ${done.length} 条。`);
  for (const b of pending) console.log(`  - in/${b}.request.md`);
  return 0;
}

function readLedger(mb) {
  try {
    const j = JSON.parse(fs.readFileSync(mb.ledger, 'utf8'));
    if (Array.isArray(j?.processed)) return new Set(j.processed);
  } catch { /* 首次运行或损坏：从空开始，不阻断收件 */ }
  return new Set();
}

function writeLedger(mb, set) {
  writeAtomic(mb.ledger, `${JSON.stringify({ schema: 1, processed: [...set].sort() }, null, 2)}\n`);
}

function collectRefs(cfg, args, mb) {
  const raw = args.include ? (Array.isArray(args.include) ? args.include : [args.include]) : [];
  // 取件人的可读范围按「邮箱的上一级目录」推断（本项目里就是 Kimi 的工作区根）
  const readerRoot = mb.external ? path.dirname(mb.root) : cfg.project;
  const refs = [];
  for (const p of raw) {
    const abs = path.resolve(cfg.project, String(p));
    let size = 0;
    let exists = false;
    try {
      const st = fs.statSync(abs);
      exists = st.isFile();
      size = st.size;
    } catch { /* 不存在 */ }
    const posix = abs.split(path.sep).join('/');
    const readable = posix.startsWith(readerRoot.split(path.sep).join('/') + '/');
    refs.push({ path: String(p), abs: posix, exists, size, readable });
    if (!exists) console.error(`⚠ --include ${p} 不存在或是目录，已跳过`);
  }
  return refs.filter((r) => r.exists);
}

function refsSection(refs) {
  const ok = refs.filter((r) => r.readable);
  const out = refs.filter((r) => !r.readable);
  const lines = [];
  if (ok.length) {
    lines.push('## 可直接读取的参考文件', '');
    lines.push('以下文件在取件人的工作区内，可直接打开核对（不需要把它们当成证据本身）：');
    lines.push('');
    for (const r of ok) {
      const kb = (r.size / 1024).toFixed(1);
      lines.push(`- \`${r.abs}\`（${kb} KB）`);
    }
    lines.push('');
    lines.push('被审文件的嵌入全文仍是唯一证据；参考文件只用于核对口径、数据与上下文。');
    lines.push('');
  }
  if (out.length) {
    lines.push('## 不可直接读取的参考文件（路径仅供参考，忽略即可）', '');
    for (const r of out) lines.push(`- \`${r.abs}\``);
    lines.push('');
  }
  return lines;
}

function cmdEnqueue(cfg, args, mb, { prompts, target, round }) {
  ensureMailbox(mb);
  const now = new Date();
  let base = `${localStamp(now)}-slot${cfg.slot}`;
  // 同一秒内多次投递时避免文件名互相覆盖
  for (let n = 2; fs.existsSync(path.join(mb.inDir, `${base}.request.md`)); n += 1) {
    base = `${localStamp(now)}-slot${cfg.slot}-${n}`;
  }
  const createdAt = isoLocal(now);
  const refs = collectRefs(cfg, args, mb);
  const meta = {
    schema: 1, request: base, slot: cfg.slot, tier: cfg.tier, round,
    project: cfg.project, target: relTo(cfg.project, target.abs),
    target_abs: target.abs, created_at: createdAt,
    system_chars: prompts.system.length, user_chars: prompts.user.length,
    truncated: target.truncated,
    refs: refs.map((r) => r.abs),
  };
  const doc = [
    `<!-- aris-request ${JSON.stringify(meta)} -->`,
    `# ARIS 审稿请求 · slot ${cfg.slot} · ${cfg.tier} · round ${round}`,
    '',
    `- 项目: ${cfg.project}`,
    `- 目标: ${meta.target}`,
    `- 创建: ${createdAt}`,
    `- 回复请写到: out/${base}.reply.md（正文为模型回复原文，第一行 Reviewer-Model）`,
    '',
    '## 给取件人的固定指令',
    '',
    `- 审查者槽位: ${cfg.reviewerLabel}（tier ${cfg.tier}）${cfg.modelHint ? `；约定的审稿模型: ${cfg.modelHint}` : ''}`,
    ...(cfg.modelHint
      ? [`- 请先把客户端切到 ${cfg.modelHint} 再作答；回复首行仍要写你实际用的模型（Reviewer-Model）。`]
      : []),
    '',
    '把下面两段 prompt **逐字**交给一个独立审稿模型：取 `===== SYSTEM PROMPT BEGIN =====` 与',
    '`===== SYSTEM PROMPT END =====` 之间的内容作为系统指令，取 `===== USER PROMPT BEGIN =====` 与',
    '`===== USER PROMPT END =====` 之间的内容作为用户内容（都不含标记行）。然后把模型回复原文整段写入回复文件，不要摘要、不要改写、',
    '不要掺入你自己的判断。若被审文件超长被截断，回复里要说明这一限制。',
    '',
    ...refsSection(refs),
    '===== SYSTEM PROMPT BEGIN =====',
    prompts.system,
    '===== SYSTEM PROMPT END =====',
    '',
    '===== USER PROMPT BEGIN =====',
    prompts.user,
    '===== USER PROMPT END =====',
    '',
  ].join('\n');

  const reqAbs = path.join(mb.inDir, `${base}.request.md`);
  try {
    writeAtomic(reqAbs, doc);
  } catch (e) {
    console.error(`✖ 写入请求失败：${e.message}`);
    return 2;
  }
  rememberProject(mb, base, {
    project: cfg.project, state_dir: cfg.stateDir, target: meta.target, created_at: createdAt,
  });
  appendEvent(cfg, {
    ts: createdAt, event: 'review_enqueued', slot: cfg.slot, tier: cfg.tier, round,
    target: meta.target, request: relTo(cfg.project, reqAbs),
  });

  console.log(`✔ 已投递审稿请求：${reqAbs}`);
  const q = writeQueue(mb);
  if (q.error) console.log(`  ⚠ 未能更新 ${q.file}（${q.error}）——取件人仍可按 in/out 比对取件。`);
  console.log(`  回复请写到：${path.join(mb.outDir, `${base}.reply.md`)}`);
  console.log(`  prompt 规模：system ${prompts.system.length} 字符 / user ${prompts.user.length} 字符${target.truncated ? '（已截断）' : ''}`);
  console.log('  未调用任何后端，本命令只写文件。');
  console.log('');
  console.log('  Kimi Work 定时任务里可让它每次执行下面这段（只需建一次任务）：');
  console.log('  「读 ' + path.join(mb.root, 'queue.md') + '：PENDING: 0 就回无新请求；');
  console.log('   否则只处理「## 待处理」列出的请求，按请求文件里 BEGIN/END 两段 prompt 逐字审查，');
  console.log('   回复原文写入 out/<同名>.reply.md（首行 Reviewer-Model，含 VERDICT 与 Score: N/10）。');
  console.log('   不改 in/、queue.md、projects.json，不删任何文件。」');
  console.log('');
  console.log('  收件（单项目）：node bin/aris-review.mjs --project <dir> --collect');
  console.log('  收件（多项目/计划任务）：node bin/aris-review.mjs --collect-all --mailbox <邮箱>');
  return 0;
}

function parseRequestMeta(text) {
  const m = String(text).match(/<!--\s*aris-request\s+(\{[\s\S]*?\})\s*-->/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}

function trashRoot(mb) {
  return path.join(mb.root, 'trash');
}

function moveInto(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
    return true;
  } catch {
    try {
      fs.copyFileSync(from, to);
      fs.unlinkSync(from);
      return true;
    } catch {
      return false;
    }
  }
}

// 入账成功的那一对请求/回复从 in/、out/ 移到 trash/<base>/，邮箱保持干净但可回溯
function archiveProcessed(mb, files) {
  const root = trashRoot(mb);
  const moved = [];
  for (const file of files) {
    const base = file.replace(/\.reply\.md$/i, '');
    let dir = path.join(root, base);
    if (fs.existsSync(dir)) dir = path.join(root, `${base}-${localStamp(new Date())}`);
    const pairs = [
      [path.join(mb.outDir, file), path.join(dir, file)],
      [path.join(mb.inDir, `${base}.request.md`), path.join(dir, `${base}.request.md`)],
    ];
    for (const [from, to] of pairs) {
      if (!fs.existsSync(from)) continue;
      if (moveInto(from, to)) moved.push(to);
      else console.warn(`⚠ 归档失败，保留原位：${from}`);
    }
  }
  return moved;
}

function purgeTrash(mb, days) {
  const root = trashRoot(mb);
  if (!fs.existsSync(root)) return { removed: [], kept: 0 };
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const removed = [];
  let kept = 0;
  for (const name of fs.readdirSync(root)) {
    const abs = path.join(root, name);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.mtimeMs >= cutoff) { kept += 1; continue; }
    try {
      fs.rmSync(abs, { recursive: true, force: true });
      removed.push(name);
    } catch (e) {
      console.warn(`⚠ 删除失败，跳过：${name}（${e.message}）`);
    }
  }
  return { removed, kept };
}

function cmdCollect(cfg, args, mb, only = null) {
  ensureMailbox(mb);
  const processed = readLedger(mb);
  let files = [];
  try {
    files = fs.readdirSync(mb.outDir).filter((f) => f.toLowerCase().endsWith('.reply.md')).sort();
  } catch { files = []; }
  if (only) files = files.filter((f) => only.has(f));
  const pending = files.filter((f) => !processed.has(f));
  // 旧版本留下的「已入账但还在 in/out」的配对，顺手归档，把邮箱清空
  const stale = files.filter((f) => processed.has(f));
  if (stale.length) {
    const swept = archiveProcessed(mb, stale);
    if (swept.length) console.log(`顺带归档 ${swept.length} 个已入账的旧文件到 ${trashRoot(mb)}/。`);
  }
  if (!pending.length) {
    console.log(`没有新的回复（已收 ${processed.size} 条，目录 ${mb.outDir}）。`);
    writeQueue(mb);
    return 0;
  }

  let ok = 0, bad = 0;
  const archived = [];
  for (const file of pending) {
    const base = file.replace(/\.reply\.md$/i, '');
    const replyAbs = path.join(mb.outDir, file);
    let content = '';
    try {
      content = fs.readFileSync(replyAbs, 'utf8');
    } catch (e) {
      console.error(`⚠ 读取失败，跳过：${file}（${e.message}）`);
      bad += 1;
      continue;
    }
    if (!String(content).trim()) {
      console.error(`⚠ 空回复，跳过（不记为 verdict）：${file}`);
      bad += 1;
      continue;
    }

    const reqAbs = path.join(mb.inDir, `${base}.request.md`);
    let meta = null;
    try { meta = parseRequestMeta(fs.readFileSync(reqAbs, 'utf8')); } catch { /* 请求文件可能已被清理 */ }
    const slot = Number(meta?.slot) || cfg.slot;
    const tier = meta?.tier || cfg.tier;
    const round = Number(meta?.round) || 1;
    const targetRel = meta?.target || '(unknown)';

    const parsed = parseReply(content);
    const now = new Date();
    const reviewsDir = path.join(cfg.stateDir, 'reviews');
    const outBase = `${localStamp(now)}-slot${slot}`;
    const mdAbs = path.join(reviewsDir, `${outBase}.md`);
    const jsonAbs = path.join(reviewsDir, `${outBase}.json`);
    const createdAt = isoLocal(now);
    const rawPath = relTo(cfg.project, mdAbs);
    const jsonPath = relTo(cfg.project, jsonAbs);

    const mdDoc = [
      `<!-- aris-review schema=1 slot=${slot} tier=${tier} round=${round} backend=mailbox source=${file} created_at=${createdAt} -->`,
      `# ARIS 审查 · slot ${slot} · ${tier} · round ${round}（邮箱收取）`,
      '',
      `- target: ${targetRel}`,
      `- reviewer: mailbox / ${parsed.identity}`,
      `- verdict: ${parsed.verdict}${parsed.score !== null ? ` · score ${parsed.score}/10` : ''}`,
      `- reply_file: ${relTo(cfg.project, replyAbs)}`,
      `- created_at: ${createdAt}`,
      '',
      '---',
      '',
      content.trim(),
      '',
    ].join('\n');

    const record = {
      schema: 1, slot, tier, round,
      backend: 'mailbox', model: parsed.identity,
      reported_model: parsed.identity,
      identity: parsed.identity,
      verdict: parsed.verdict, score: parsed.score,
      summary: parsed.summary, risks: parsed.risks,
      target: targetRel,
      raw_path: rawPath, json_path: jsonPath,
      reply_file: relTo(cfg.project, replyAbs),
      created_at: createdAt,
      source: 'mailbox',
      truncated: Boolean(meta?.truncated),
    };

    try {
      writeAtomic(mdAbs, mdDoc);
      writeAtomic(jsonAbs, `${JSON.stringify(record, null, 2)}\n`);
    } catch (e) {
      console.error(`✖ 写入审查结果失败，跳过：${file}（${e.message}）`);
      bad += 1;
      continue;
    }

    registerInState(cfg, {
      slot, tier, round, backend: 'mailbox', model: parsed.identity, identity: parsed.identity,
      verdict: parsed.verdict, score: parsed.score, raw_path: rawPath, json_path: jsonPath,
      target: targetRel, created_at: createdAt,
    });
    appendEvent(cfg, {
      ts: createdAt, event: 'review_collected', slot, tier, round, backend: 'mailbox',
      identity: parsed.identity, verdict: parsed.verdict, score: parsed.score,
      raw_path: rawPath, json_path: jsonPath, target: targetRel,
      reply_file: relTo(cfg.project, replyAbs),
    });

    processed.add(file);
    writeLedger(mb, processed);

    const icon = { accept: '✔', revise: '✎', reject: '✖', unknown: '?' }[parsed.verdict];
    console.log(`${icon} ${file} → verdict=${parsed.verdict}${parsed.score !== null ? ` score=${parsed.score}/10` : ''} · ${relTo(cfg.project, mdAbs)}`);
    if (parsed.identity.startsWith('unverified')) console.log('  ⚠ 回复里没有 Reviewer-Model 行，身份记为 unverified。');
    ok += 1;
    archived.push(file);
  }

  const moved = archiveProcessed(mb, archived);
  console.log(`\n收件完成：${ok} 条入账，${bad} 条跳过（已收总计 ${processed.size} 条）。`);
  if (moved.length) {
    console.log(`已归档 ${moved.length} 个文件到 ${trashRoot(mb)}/（请求与回复成对移走，可随时翻查）。`);
  }
  writeQueue(mb);
  if (ok && bad) console.log('  跳过的回复仍在 out/ 里，修好后可再跑 --collect。');
  return bad && !ok ? 2 : 0;
}

// 一次收件覆盖多个项目：按 projects.json（必要时回退 trash 里的请求 meta）分组，
// 每个项目用各自的 state 目录与 ledger 跑一遍 cmdCollect。给 Windows 计划任务用。
function cmdCollectAll(args) {
  const raw = args.mailbox && args.mailbox !== true ? String(args.mailbox) : null;
  if (!raw) fail('--collect-all 需要 --mailbox <dir>（邮箱绝对路径）');
  const root = path.resolve(raw);
  const mb = {
    root,
    inDir: path.join(root, 'in'),
    outDir: path.join(root, 'out'),
    ledger: null,
    readme: path.join(root, 'README.md'),
    external: true,
  };
  ensureMailbox(mb);
  let files = [];
  try {
    files = fs.readdirSync(mb.outDir).filter((f) => f.toLowerCase().endsWith('.reply.md')).sort();
  } catch { files = []; }

  writeQueue(mb);
  const index = readProjects(mb);
  const groups = new Map();
  const orphans = [];
  for (const f of files) {
    const base = f.replace(/\.reply\.md$/i, '');
    let info = index[base];
    if (!info || !info.project) {
      try {
        const meta = parseRequestMeta(fs.readFileSync(path.join(root, 'trash', base, `${base}.request.md`), 'utf8'));
        if (meta && meta.project) info = { project: meta.project, state_dir: null };
      } catch { /* 没有记录就进 orphans */ }
    }
    if (!info || !info.project) { orphans.push(f); continue; }
    const stateDir = info.state_dir || path.join(info.project, '.aris');
    const key = info.project + '\u0000' + stateDir;
    if (!groups.has(key)) groups.set(key, { project: info.project, stateDir, files: [] });
    groups.get(key).files.push(f);
  }

  if (!groups.size) {
    console.log(`没有可归属项目的回复（out/ 里 ${files.length} 个，无法定位项目 ${orphans.length} 个）。`);
    for (const f of orphans) console.log(`  ? ${f}`);
    return orphans.length ? 2 : 0;
  }

  console.log(`收件（多项目）：${groups.size} 个项目、${files.length - orphans.length} 个回复`);
  let bad = 0;
  for (const g of groups.values()) {
    console.log(`\n── ${g.project}  (${g.files.length})`);
    const cfg = { project: g.project, stateDir: g.stateDir, slot: 1, tier: 'T1' };
    const mbFor = { ...mb, ledger: path.join(g.stateDir, 'mailbox-processed.json') };
    const code = cmdCollect(cfg, { ...args, mailbox: root, project: g.project }, mbFor, new Set(g.files));
    if (code !== 0) bad += 1;
  }
  if (orphans.length) {
    console.log(`\n⚠ ${orphans.length} 个回复找不到所属项目（projects.json 与 trash/ 都没有记录）：`);
    for (const f of orphans) console.log(`  ${f}（用 --project <项目> --collect 手工指定）`);
  }
  writeQueue(mb);
  return bad || orphans.length ? 2 : 0;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function readingRound(cfg, args) {
  if (args.round !== undefined) return toPositiveInt(args.round, '--round');
  if (cfg.round !== undefined && cfg.round !== null && cfg.round !== '') return toPositiveInt(cfg.round, 'reviewer.json round');
  const file = path.join(cfg.stateDir, 'state.json');
  try {
    const st = JSON.parse(fs.readFileSync(file, 'utf8'));
    const n = Number(st?.round ?? st?.loop?.round ?? st?.review?.round ?? 1);
    if (Number.isInteger(n) && n > 0) return n;
  } catch { /* 无 state 就从 1 开始 */ }
  return 1;
}

function readTarget(cfg) {
  const raw = String(cfg.target || '');
  if (!raw) fail('缺少 --target <file.md>。');
  const abs = path.isAbsolute(raw) ? raw : path.resolve(cfg.project, raw);
  let st;
  try { st = fs.statSync(abs); } catch {
    fail(`目标文件不存在：${abs}\n（相对路径按 --project 解析；--project 当前为 ${cfg.project}）`);
  }
  if (!st.isFile()) fail(`目标路径不是文件：${abs}`);
  if (st.size === 0) fail(`目标文件为空：${abs}`);
  let text = fs.readFileSync(abs, 'utf8');
  let truncated = false;
  if (cfg.maxChars > 0 && text.length > cfg.maxChars) {
    const keep = Math.floor(cfg.maxChars * 0.6);
    const tail = cfg.maxChars - keep;
    text = `${text.slice(0, keep)}\n\n…[已截断 ${text.length - cfg.maxChars} 字符，原文共 ${text.length} 字符]…\n\n${text.slice(-tail)}`;
    truncated = true;
    console.error(`⚠ 目标文件 ${text.length} 字符超过 --max-chars ${cfg.maxChars}，已截断中间部分。`);
  }
  return { abs, text, truncated, chars: text.length };
}

function printSlots(cfg) {
  const rows = Array.isArray(cfg.reviewers) && cfg.reviewers.length ? cfg.reviewers : null;
  console.log(`项目：${cfg.project}`);
  console.log(`配置文件：${cfg.configPath || '(无，用内置默认)'}`);
  if (!rows) {
    console.log('reviewers[]：未配置（单后端扁平模式，向后兼容）');
    console.log(`当前：slot=${cfg.slot} tier=${cfg.tier} via=${cfg.via} backend=${cfg.backend} model=${cfg.model}`);
    return 0;
  }
  console.log(`reviewers[]：${rows.length} 条`);
  for (const r of rows) {
    const mark = r === cfg.reviewer ? '*' : ' ';
    console.log(`${mark} slot=${r.slot ?? '-'} via=${r.via || 'direct'} label=${r.label || r.id || '-'} `
      + `backend=${r.backend || '-'} model=${r.model || '-'} tier=${r.tier || '-'}`);
  }
  console.log(`\n当前选中：slot=${cfg.slot} label=${cfg.reviewerLabel} via=${cfg.via}`);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }
  if (args['collect-all']) return cmdCollectAll(args);
  if (!args.project) fail(`缺少 --project <dir>。\n\n${USAGE}`);

  const cfg = resolveConfig(args);
  if (!fs.existsSync(cfg.project) || !fs.statSync(cfg.project).isDirectory()) {
    fail(`项目目录不存在：${cfg.project}`);
  }
  cfg.target = args.target;
  if (args.slots) return printSlots(cfg);
  const round = readingRound(cfg, args);
  if (args['purge-trash'] !== undefined) {
    const mb = mailboxDirs(cfg, args);
    const raw = args['purge-trash'];
    const days = raw === true ? 30 : toPositiveInt(raw, '--purge-trash');
    const { removed, kept } = purgeTrash(mb, days);
    if (!removed.length) {
      console.log(`trash/ 里没有超过 ${days} 天的归档（保留 ${kept} 项，目录 ${trashRoot(mb)}）。`);
    } else {
      console.log(`已清理 ${removed.length} 项（超过 ${days} 天），保留 ${kept} 项：`);
      for (const n of removed) console.log(`  - trash/${n}`);
    }
    return 0;
  }
  if (args.collect) return cmdCollect(cfg, args, mailboxDirs(cfg, args));
  if (args.queue) return cmdQueue(cfg, args, mailboxDirs(cfg, args));
  const target = readTarget(cfg);
  const scope = loadScopeLimits();
  const prompts = buildPrompts({ cfg, targetAbs: target.abs, targetText: target.text, truncated: target.truncated, round, scope });

  if ((args.enqueue || cfg.via === 'kimi-mailbox') && !args['dry-run']) {
    return cmdEnqueue(cfg, args, mailboxDirs(cfg, args), { prompts, target, round });
  }

  const cfgSummary = {
    project: cfg.project,
    target: target.abs,
    slot: cfg.slot,
    tier: cfg.tier,
    via: cfg.via,
    reviewer: cfg.reviewerLabel,
    round,
    backend: cfg.backend,
    model: cfg.model,
    base_url: cfg.via === 'kimi-mailbox' ? '(邮箱模式，不走 HTTP)' : `${cfg.baseUrl}/chat/completions`,
    api_key_env: cfg.apiKeyEnv,
    api_key_present: Boolean(cfg.apiKeyEnv && process.env[cfg.apiKeyEnv]),
    timeout_sec: cfg.timeoutSec,
    max_chars: cfg.maxChars,
    target_chars: target.chars,
    truncated: target.truncated,
    reviewer_config: cfg.configPath || '(none)',
    scope_limits_source: scope.source,
    config_sources: cfg.sources,
  };

  if (args['dry-run']) {
    console.log('=== 配置 ===');
    console.log(JSON.stringify(cfgSummary, null, 2));
    console.log('\n=== system prompt ===');
    console.log(prompts.system);
    console.log('\n=== user prompt (前 60 行 + 末尾 10 行) ===');
    const ul = prompts.user.split('\n');
    if (ul.length <= 70) console.log(prompts.user);
    else console.log([...ul.slice(0, 60), `…[省略 ${ul.length - 70} 行文件正文]…`, ...ul.slice(-10)].join('\n'));
    console.log('\n=== prompt 统计 ===');
    console.log(`system ${prompts.system.length} 字符 / user ${prompts.user.length} 字符`);
    console.log('（--dry-run：未发送任何请求，未写任何文件）');
    return 0;
  }

  const t0 = Date.now();
  console.log(`→ 审查 ${relTo(cfg.project, target.abs)}（slot ${cfg.slot} / tier ${cfg.tier} / round ${round}）`);
  console.log(`  backend=${cfg.backend} model=${cfg.model} → ${cfg.baseUrl}/chat/completions（超时 ${cfg.timeoutSec}s，失败重试 1 次）`);

  let outcome;
  try {
    outcome = await callReviewer(cfg, prompts);
  } catch (e) {
    const message = e instanceof ReviewError ? e.message : `未预期的错误：${e?.message || e}`;
    appendEvent(cfg, {
      ts: isoLocal(), event: 'review_error', slot: cfg.slot, tier: cfg.tier, round,
      backend: cfg.backend, model: cfg.model, target: relTo(cfg.project, target.abs), error: message.slice(0, 500),
    });
    console.error(`\n✖ 审查失败：${message}`);
    console.error('  未写入审查文件（失败的调用不是 verdict）。');
    return 2;
  }

  const content = outcome.res.json.choices[0].message?.content ?? '';
  const reasoning = outcome.res.json.choices[0].message?.reasoning_content ?? outcome.res.json.choices[0].message?.reasoning ?? '';
  const reportedModel = outcome.res.json.model || cfg.model;
  if (!String(content).trim()) {
    const message = reasoning
      ? `后端只返回了 reasoning_content，没有正文（模型 ${reportedModel}）。可换非 thinking 模型或调整请求参数。`
      : `后端返回空内容（模型 ${reportedModel}）。`;
    console.error(`\n✖ ${message}`);
    return 2;
  }

  const parsed = parseReply(content);
  const now = new Date();
  const base = `${localStamp(now)}-slot${cfg.slot}`;
  const reviewsDir = path.join(cfg.stateDir, 'reviews');
  const mdAbs = path.join(reviewsDir, `${base}.md`);
  const jsonAbs = path.join(reviewsDir, `${base}.json`);
  const rawPath = relTo(cfg.project, mdAbs);
  const jsonPath = relTo(cfg.project, jsonAbs);
  const createdAt = isoLocal(now);

  // 原文：元信息头 + verbatim 回复（thinking 段若存在则附在文末，明确标注）
  const mdDoc = [
    `<!-- aris-review schema=1 slot=${cfg.slot} tier=${cfg.tier} round=${round} backend=${cfg.backend} model=${cfg.model} created_at=${createdAt} -->`,
    `# ARIS 审查 · slot ${cfg.slot} · ${cfg.tier} · round ${round}`,
    '',
    `- target: ${target.abs}`,
    `- reviewer: ${cfg.backend} / ${cfg.model}（reported: ${reportedModel}）`,
    `- identity: ${parsed.identity}`,
    `- verdict: ${parsed.verdict}${parsed.score !== null ? ` · score ${parsed.score}/10` : ''}`,
    `- created_at: ${createdAt}`,
    '',
    '---',
    '',
    content.trim(),
    ...(reasoning ? ['', '---', '', '<!-- 附：模型 reasoning_content 原文（非审查正文） -->', String(reasoning).trim()] : []),
    '',
  ].join('\n');

  const record = {
    schema: 1,
    slot: cfg.slot,
    tier: cfg.tier,
    round,
    backend: cfg.backend,
    model: cfg.model,
    reported_model: reportedModel,
    identity: parsed.identity,
    verdict: parsed.verdict,
    score: parsed.score,
    summary: parsed.summary,
    risks: parsed.risks,
    target: relTo(cfg.project, target.abs),
    raw_path: rawPath,
    created_at: createdAt,
    usage: outcome.res.json.usage || null,
    truncated: target.truncated,
  };

  try {
    writeAtomic(mdAbs, mdDoc);
    writeAtomic(jsonAbs, `${JSON.stringify(record, null, 2)}\n`);
  } catch (e) {
    console.error(`✖ 写入审查结果失败：${e.message}`);
    return 2;
  }

  const stateEntry = {
    slot: cfg.slot,
    tier: cfg.tier,
    round,
    backend: cfg.backend,
    model: cfg.model,
    identity: parsed.identity,
    verdict: parsed.verdict,
    score: parsed.score,
    raw_path: rawPath,
    json_path: jsonPath,
    target: record.target,
    created_at: createdAt,
  };
  const stateRes = registerInState(cfg, stateEntry);
  appendEvent(cfg, {
    ts: createdAt, event: 'review', slot: cfg.slot, tier: cfg.tier, round,
    backend: cfg.backend, model: cfg.model, reported_model: reportedModel,
    identity: parsed.identity, verdict: parsed.verdict, score: parsed.score,
    raw_path: rawPath, json_path: jsonPath, target: record.target,
    latency_ms: Date.now() - t0,
  });

  const verdictIcon = { accept: '✔', revise: '✎', reject: '✖', unknown: '?' }[parsed.verdict];
  console.log(`\n${verdictIcon} verdict=${parsed.verdict}${parsed.score !== null ? ` score=${parsed.score}/10` : ''}`);
  console.log(`  身份: ${parsed.identity}`);
  if (parsed.summary) console.log(`  摘要: ${parsed.summary.slice(0, 300)}`);
  if (parsed.risks.length) {
    console.log(`  主要问题 ${parsed.risks.length} 条:`);
    parsed.risks.forEach((r, i) => console.log(`    ${i + 1}. ${r.slice(0, 160)}`));
  }
  console.log(`  原文: ${mdAbs}`);
  console.log(`  结构: ${jsonAbs}`);
  console.log(`  state.json: ${stateRes.updated ? `已登记（共 ${stateRes.count} 条 review）` : '未登记（见上方提示）'}`);
  console.log(`  耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (parsed.verdict === 'unknown') console.log('  注意: 未从回复中解析出 accept/revise/reject，已记 unknown，请人工复核原文。');
  return 0;
}

try {
  const code = await main();
  process.exit(code);
} catch (e) {
  if (e instanceof TypeError || e instanceof RangeError) {
    console.error(`✖ 内部错误：${e?.stack || e}`);
    process.exit(2);
  }
  console.error(`✖ ${e?.message || e}`);
  process.exit(2);
}
