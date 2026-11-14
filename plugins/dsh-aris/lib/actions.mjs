// Whitelisted actions. The panel can only run the argv shapes built here; no
// free-form command ever crosses the HTTP boundary.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { ARTIFACT_FIELDS, PHASES } from './collect.mjs';

export const ACTIONS = ['collect-all', 'queue', 'advance', 'set-phase', 'set-artifact', 'gate'];

const STEP_TIMEOUT_MS = 240_000;
const MAX_OUTPUT = 40_000;

const GATE_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const PHASE_SET = new Set(PHASES);
const FIELD_SET = new Set(ARTIFACT_FIELDS);

function str(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

function bashPath(env) {
  const candidates = [
    env && env.bashPath,
    'C:/Program Files/Git/bin/bash.exe',
    'C:/Program Files/Git/usr/bin/bash.exe',
    'C:/Program Files (x86)/Git/bin/bash.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return 'bash';
}

function parseGateJson(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Build the controlled steps for one panel action.
 * @param {string} action
 * @param {Record<string, unknown>} input
 * @param {{workspace: string, nodePath: string, mailbox: string, project?: object, bashPath?: string}} env
 */
export function buildAction(action, input, env) {
  if (!ACTIONS.includes(action)) throw new Error(`未知动作：${action}`);
  const node = env.nodePath;

  if (action === 'collect-all' || action === 'queue') {
    if (!env.mailbox) throw new Error('未配置邮箱目录，无法收件');
    return {
      title: action === 'queue' ? '重算队列' : '收件',
      steps: [
        {
          label: action === 'queue' ? '重算 queue.md' : '收件',
          file: node,
          args:
            action === 'queue'
              ? [env.script('aris-review.mjs'), '--queue', '--project', env.workspace, '--mailbox', env.mailbox]
              : [env.script('aris-review.mjs'), '--collect-all', '--mailbox', env.mailbox],
          cwd: env.workspace,
        },
      ],
    };
  }

  const project = env.project;
  if (!project) throw new Error('缺少项目上下文（先刷新面板）');
  const base = [env.script('aris.mjs'), '--project', project.project || project.stateDir, '--state-dir', project.stateDir];
  const single = (rest, title) => ({ title, steps: [{ label: title, file: node, args: [...base, ...rest], cwd: env.workspace }] });

  if (action === 'advance') return single(['advance'], `推进 · ${project.name}`);

  if (action === 'set-phase') {
    const phase = str(input.phase, 32);
    if (!PHASE_SET.has(phase)) throw new Error(`阶段无效：${phase}`);
    return single(['set-phase', phase], `设置阶段 · ${project.name} → ${phase}`);
  }

  if (action === 'set-artifact') {
    const field = str(input.field, 32);
    const value = str(input.value, 1000).trim();
    if (!FIELD_SET.has(field)) throw new Error(`产物字段无效：${field}`);
    if (!value) throw new Error('产物路径不能为空');
    if (/[\r\n]/.test(value)) throw new Error('产物路径不能包含换行');
    return single(['set-artifact', field, value], `登记产物 · ${project.name} ${field}`);
  }

  if (action === 'gate') {
    const name = str(input.gate, 64);
    if (!GATE_NAME.test(name)) throw new Error(`门禁名无效：${name}`);
    const known = (project.gates || []).some((g) => g.name === name);
    if (!known) throw new Error(`项目 ${project.name} 没有门禁 ${name}`);
    const issueArgs = [...base, 'gate', name];
    const jsonArgs = str(input.jsonArgs, 4000).trim();
    if (jsonArgs) {
      let parsed;
      try {
        parsed = JSON.parse(jsonArgs);
      } catch {
        throw new Error('门禁参数不是合法 JSON');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('门禁参数必须是 JSON 对象');
      issueArgs.push('--json-args', JSON.stringify(parsed));
    }
    issueArgs.push('--json');
    return {
      title: `执行门禁 · ${project.name} ${name}`,
      bash: bashPath(env),
      gate: name,
      recordBase: base,
      cwd: project.project || project.stateDir,
      steps: [
        { label: '生成门禁命令', file: node, args: issueArgs, cwd: env.workspace, capture: 'gate' },
        { label: '运行门禁脚本', shell: true, file: '', args: [], cwd: project.project || project.stateDir, fromGate: true },
        { label: '回填门禁结果', dynamic: 'record' },
      ],
    };
  }

  throw new Error(`未实现的动作：${action}`);
}

function spawnStep(step, gate) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: Boolean(payload.ok),
        code: typeof payload.code === 'number' ? payload.code : null,
        stdout: stdout.slice(-MAX_OUTPUT),
        stderr: stderr.slice(-MAX_OUTPUT),
        error: payload.error || null,
        ms: Date.now() - started,
        label: step.label || '',
      });
    };

    const file = step.file;
    const args = step.args;

    try {
      child = spawn(file, args, {
        cwd: step.cwd || undefined,
        windowsHide: true,
        env: { ...process.env, ARIS_NO_COLOR: '1' },
      });
    } catch (error) {
      finish({ ok: false, error: String(error) });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish({ ok: false, code: null, error: `超时（${Math.round(STEP_TIMEOUT_MS / 1000)}s）已终止` });
    }, STEP_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, error: String(error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, code });
    });
  });
}

/**
 * Execute a built action step by step. A gate action has three steps: issue the
 * command, run it through bash, then record its exit code back into state.json.
 */
export async function runAction(spec) {
  const started = Date.now();
  const results = [];
  let gate = null;

  for (const step of spec.steps) {
    if (step.fromGate) {
      if (!gate || !gate.cmd) {
        return {
          ok: false,
          code: null,
          title: spec.title,
          ms: Date.now() - started,
          stdout: '',
          stderr: '',
          error: '门禁命令没有生成，未运行脚本',
          steps: results,
        };
      }
    }
    if (step.dynamic === 'record') {
      const last = results[results.length - 1];
      const code = last && typeof last.code === 'number' ? last.code : 1;
      const recordStep = {
        label: `回填退出码 ${code}`,
        file: spec.steps[0].file,
        args: [...(spec.recordBase || []), 'gate', spec.gate, '--record', String(code), '--json'],
        cwd: spec.cwd,
      };
      const recordResult = await spawnStep(recordStep, gate);
      results.push(recordResult);
      continue;
    }

    const prepared = step.fromGate
      ? { ...step, file: spec.bash || 'bash', args: ['-lc', gate.cmd] }
      : step;
    const result = await spawnStep(prepared, gate);
    results.push(result);

    if (step.capture === 'gate') {
      const parsed = parseGateJson(result.stdout);
      gate = parsed && parsed.cmd ? { cmd: parsed.cmd, out: parsed.out || '', script: parsed.script || '' } : null;
      if (!parsed || !parsed.cmd) {
        return {
          ok: false,
          code: result.code,
          title: spec.title,
          ms: Date.now() - started,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error || '门禁命令生成失败',
          steps: results,
        };
      }
      continue;
    }
  }

  const last = results[results.length - 1] || { ok: false, code: null, stdout: '', stderr: '', error: '没有执行任何步骤' };
  return {
    ok: Boolean(last.ok),
    code: last.code,
    title: spec.title,
    ms: Date.now() - started,
    stdout: last.stdout,
    stderr: last.stderr,
    error: last.error,
    steps: results.map((r) => ({ label: r.label, ok: r.ok, code: r.code, ms: r.ms })),
  };
}
