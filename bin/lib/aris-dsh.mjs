// 与 DSH 运行时的接触面：找 node / dsh / API key，拼环境，起 headless 子进程。
//
// 这里刻意不引入任何 npm 依赖，也不写注册表；所有落盘都在流水线的 .aris-run/ 里。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** 依次尝试：设置里的路径 → 本进程 node → DSH 运行时自带的 node。 */
export function resolveNode(settings = {}) {
  const candidates = [
    settings.nodePath,
    process.execPath,
    process.env.DSH_NODE,
    path.join(os.homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', IS_WIN ? 'node.exe' : 'node'),
  ].filter(Boolean);
  for (const c of candidates) if (exists(c)) return c;
  return process.execPath;
}

/**
 * 定位 dsh。优先直接起 Electron 二进制 + cli.js：这样参数里带空格、带换行的
 * 长提示词都不会被 cmd.exe 的引号规则吃掉。
 * 返回 { kind, file, baseArgs, env }，交给 spawnHeadless 拼命令行。
 */
export function resolveDsh(settings = {}) {
  const home = os.homedir();
  const localApp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const base = path.join(localApp, 'Programs', 'DeepSeek Harness');
  const exe = path.join(base, IS_WIN ? 'DeepSeek Harness.exe' : 'DeepSeek Harness');
  const cli = path.join(base, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js');
  if (IS_WIN && exists(exe) && exists(path.join(base, 'resources', 'app.asar'))) {
    return { kind: 'electron', file: exe, baseArgs: ['--expose-internals', cli], env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  const configured = String(settings.dshPath || process.env.DSH_CLI || '').trim();
  if (configured && /\.(c|m)?js$/i.test(configured) && exists(configured)) {
    return { kind: 'node', file: '', baseArgs: [configured], env: {} };
  }
  if (configured && exists(configured)) {
    return { kind: 'cmd', file: configured, baseArgs: [], env: {} };
  }
  return { kind: 'cmd', file: IS_WIN ? 'dsh.cmd' : 'dsh', baseArgs: [], env: {} };
}

/** 读 ~/.dsh/.credentials.yaml 里 refs 段的键（DSH 把 API key 存成 ref）。 */
export function readCredentialRef(name = 'DEEPSEEK_API_KEY', home = os.homedir()) {
  const file = path.join(home, '.dsh', '.credentials.yaml');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  const re = new RegExp(`^\\s+${name}\\s*:\\s*(\\S+)\\s*$`, 'm');
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}

/** API key 优先级：显式传入 → 环境变量 → DSH 凭据库。 */
export function resolveApiKey(settings = {}) {
  const explicit = String(settings.apiKey || '').trim();
  if (explicit) return { key: explicit, source: 'settings' };
  const env = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (env) return { key: env, source: 'env' };
  const ref = readCredentialRef('DEEPSEEK_API_KEY');
  if (ref) return { key: ref, source: 'dsh-credentials' };
  return { key: '', source: 'none' };
}

/** 子进程环境：把 DSH 需要的三样东西补齐，其余继承。 */
export function buildEnv({ settings = {}, workspace = '', root = '', extra = {} } = {}) {
  const { key } = resolveApiKey(settings);
  const env = {
    ...process.env,
    DSH_PERMISSION_MODE: settings.permissionMode || 'danger-full-access',
    ARIS_WORKSPACE: workspace,
    ARIS_PIPELINE_ROOT: root,
    FRRS_COOLDOWN_MINUTES: '0',
    NO_COLOR: '1',
    ...extra,
  };
  if (key) env.DEEPSEEK_API_KEY = key;
  return env;
}

/**
 * 生成一个只改模型的 patch 覆盖层。dsh 的 patch 是 loader 条目数组，
 * 用 id + name 定位到 agent-default-model 并替换 config。
 */
export function writeModelPatch(dir, model, provider = 'deepseek-official') {
  if (!model) return '';
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `model-${model.replace(/[^a-z0-9._-]+/gi, '-')}.yml`);
  const yaml = [
    '# 由 ARIS runner 生成：为本次运行固定模型，避免受 profile 默认值漂移影响。',
    '- id: agent-default-model',
    '  name: "@deepseek-ai/dsh-agent-default-model"',
    '  config:',
    `    provider: ${provider}`,
    `    model: ${model}`,
    '',
  ].join('\n');
  fs.writeFileSync(file, yaml, 'utf8');
  return file;
}

/**
 * 起一次 headless。stdout 按行回调 onEvent（已 JSON.parse），stderr 逐块回调。
 * 返回 { child, done }，done 解析为 { code, signal, killed, ms }。
 */
export function spawnHeadless({ dsh, nodePath, prompt, cwd, env, patchFile, onEvent, onStderr, timeoutMs = 0 }) {
  const startedAt = Date.now();
  const target = dsh || { kind: 'cmd', file: 'dsh', baseArgs: [], env: {} };
  const tail = ['--profile', 'headless'];
  if (patchFile) tail.push('--patch', patchFile);
  tail.push('headless', '--json', prompt);

  let file;
  let args;
  if (target.kind === 'node') {
    file = nodePath || process.execPath;
    args = [...target.baseArgs, ...tail];
  } else if (target.kind === 'cmd') {
    file = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/s', '/c', `"${target.file}"`, ...tail];
  } else {
    file = target.file;
    args = [...target.baseArgs, ...tail];
  }

  const child = spawn(file, args, {
    cwd,
    env: { ...env, ...(target.env || {}) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  let killed = false;
  let timer = null;

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      killed = true;
      killTree(child.pid);
    }, timeoutMs);
  }

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      let event = null;
      try {
        event = JSON.parse(text);
      } catch {
        event = { type: 'raw', text };
      }
      try {
        onEvent?.(event, text);
      } catch {
        /* 回调里出错不能打断流 */
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    try {
      onStderr?.(chunk.toString('utf8'));
    } catch {
      /* 同上 */
    }
  });

  const done = new Promise((resolve) => {
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, signal: null, killed, ms: Date.now() - startedAt, error: String(error) });
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, killed, ms: Date.now() - startedAt });
    });
  });

  return { child, done };
}

/** Windows 上杀掉整棵进程树（dsh.cmd → node → 工具子进程）。 */
export function killTree(pid) {
  if (!pid) return;
  try {
    if (IS_WIN) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    /* 进程可能已经退出 */
  }
}

/** 判断 pid 是否还活着（Windows 用 tasklist，其它用 kill 0）。 */
export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    if (IS_WIN) {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      return out.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
