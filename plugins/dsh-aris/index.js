// Host half of @local/dsh-aris: the panel's only door to the outside.
// It serves one read-only snapshot, a small action whitelist, and the
// background ticker that starts due pipeline runs even when no browser tab is
// open (it lives as long as the DSH host process does).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanArtifacts, readArtifactFile, auditPaper } from './lib/artifacts.mjs';
import { readSession, bucketOf, sessionsHome } from './lib/session-view.mjs';

// 宿主进程会缓存 ESM 模块：插件重载只重跑本入口，bin/lib 仍是旧实例。
// 用带版本串的动态 import，保证每次插件重载都读到磁盘上的最新实现，
// 改完 bin/lib 不必为此重启整个 DSH。
const REV = { at: Date.now() };
let libPromise = null;
const lib = () => {
  if (!libPromise) {
    const rev = `${REV.at}`;
    // 让 bin/lib/* 里对同族模块的再导入也能拿到本次重载的版本串（否则 ESM 缓存会锁死在启动时那份）。
    try { process.env.ARIS_LIB_REV = rev; } catch { /* 只读环境忽略 */ }
    libPromise = Promise.all([
      import(`../../bin/lib/aris-control.mjs?rev=${rev}`),
      import(`../../bin/lib/aris-events.mjs?rev=${rev}`),
      import(`../../bin/lib/aris-kimi.mjs?rev=${rev}`),
      import(`../../bin/lib/aris-balance.mjs?rev=${rev}`),
    ]).then(([controlMod, eventsMod, kimiMod, balanceMod]) => ({
      control: controlMod.control,
      snapshot: controlMod.snapshot,
      sessionIds: controlMod.sessionIds,
      liveSessionId: controlMod.liveSessionId,
      detectChanges: eventsMod.detectChanges,
      buildKimiPrompt: kimiMod.buildKimiPrompt,
      writeKimiPrompt: kimiMod.writeKimiPrompt,
      getBalance: balanceMod.getBalance,
      enforceFloor: balanceMod.enforceFloor,
    }));
  }
  return libPromise;
};
// 每次插件重载都换一个版本串：入口模块本身也在 ESM 缓存里，REV 必须在这里刷新。
const resetLib = () => {
  REV.at = Date.now();
  libPromise = null;
};

export const name = '@local/dsh-aris';
export const inject = ['webServer'];

const STATE_PATH = '/api/dsh-aris/state';
const ACTION_PATH = '/api/dsh-aris/action';
const ARTIFACTS_PATH = '/api/dsh-aris/artifacts';
const FILE_PATH = '/api/dsh-aris/file';
const SESSION_PATH = '/api/dsh-aris/session';
const PANEL_HEADER = 'x-dsh-aris';
const MAX_BODY = 128 * 1024;
const TICK_MS = 60_000;
const BUILD_TIMEOUT_MS = 240_000;

const ACTIONS = new Set([
  'refresh', 'add', 'remove', 'start', 'stop', 'run', 'tick', 'resume', 'logs',
  'prompt.get', 'prompt.set', 'prompt.reset', 'settings.save', 'task.delete',
  'handoff.set', 'mailbox.collect', 'workspace.register', 'workspace.list', 'workspace.unregister',
  'kimi.prompt', 'limits.save', 'human.reply', 'quota.raise', 'recover', 'lease.release', 'balance.check',
  'sessions.name', 'sessions.retitle', 'runtime.reset',
  'paper.build',
  'guard.test',
  'codex.state', 'codex.save', 'codex.run', 'codex.models', 'codex.session', 'review.route', 'project.roles',
  'pipeline.settings.save',
]);

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function apply(ctx, config = {}) {
  resetLib();
  const configured = String(config.workspace || config.workspaceRoot || '').trim();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const parent = path.dirname(here);
  const derived = path.basename(parent) === 'plugins' ? path.dirname(parent) : '';
  const workspace = path.resolve(configured || derived || process.cwd());
  const logger = ctx.logger;

  // 面板里按名字或根目录定位一条流水线；产物/构建动作都靠它。
  const pickPipeline = (snap, name) => {
    const list = Array.isArray(snap && snap.pipelines) ? snap.pipelines
      : (Array.isArray(snap && snap.projects) ? snap.projects : []);
    if (!list.length) throw new Error('还没有登记流水线，先在「流水线」页添加根目录');
    const key = String(name || '').trim();
    const hit = key ? list.find((p) => p.name === key || p.root === key) : list[0];
    if (!hit) throw new Error(`没有名为「${key}」的流水线`);
    return hit;
  };

  // 退出确认守卫（方案 A）：DSH 的「退出前确认」只看宿主后台 job 与跑着的会话，
  // 流水线是插件自己 setInterval 起的子进程，天然不在其中。起轮时登记一个无主 job，
  // 托盘退出就会弹「有任务正在运行」；收轮时让它 settle 再移除。
  // JobKindMap 目前只有 bash，所以 kind 借 bash，label 写清真实用途。
  const jobsService = (() => {
    try {
      return ctx.get('jobs') || null;
    } catch {
      return null;
    }
  })();
  const runGuards = new Map(); // lower(root) -> { id, settle }
  // jobs 里的 settled 记录不会自动消失，只按标签前缀识别 + 主动 remove，避免堆成「两个 ARIS 退出确认…」。
  const GUARD_LABEL = 'ARIS 退出确认';
  const guardLabelOf = (label) => String(label || '');
  const isGuardJob = (job) => /^(ARIS 退出确认|ARIS 流水线运行中)/.test(guardLabelOf(job && job.label));
  const removeGuardJob = (id, tries = 12) => {
    const attempt = () => { try { jobsService.remove(id); return true; } catch { return false; } };
    if (attempt()) return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      if (attempt() || n >= tries) clearInterval(timer);
    }, 250);
  };
  const sweepGuardJobs = () => {
    if (!jobsService || typeof jobsService.list !== 'function') return 0;
    let removed = 0;
    try {
      for (const job of jobsService.list()) {
        if (!isGuardJob(job)) continue;
        if (job.status === 'running' || job.status === 'stopping') continue;
        try { jobsService.remove(job.id); removed += 1; } catch { /* 还没 settle 完，下一拍再说 */ }
      }
    } catch { /* 服务不可用时静默 */ }
    return removed;
  };
  let guardWarned = false;
  let guardError = null;
  // start() 要求「有 controller 服务本 ctx」：宿主只给 agent 组装 dsh-tool-jobs 的 controller，
  // 插件自己的 ctx 没有，于是要显式挂一个（返回 disposer）。
  let detachGuard = null;
  try {
    if (jobsService && typeof jobsService.attachController === 'function') {
      detachGuard = jobsService.attachController('dsh-aris-guard') || null;
    }
  } catch (error) {
    guardError = String((error && error.message) || error);
  }
  logger?.info?.(`dsh-aris: 退出确认守卫 ${jobsService ? '就绪（jobs 服务可用）' : '不可用（宿主未提供 jobs 服务）'}`);
  const stopGuard = (root) => {
    const key = String(root || '').toLowerCase();
    const rec = runGuards.get(key);
    if (!rec) return;
    runGuards.delete(key);
    try {
      rec.settle({ status: 'completed' });
    } catch {
      /* 已经 settle 过 */
    }
    const timer = setTimeout(() => {
      try {
        if (typeof jobsService?.remove === 'function') jobsService.remove(rec.id);
      } catch {
        /* 表里已没有它 */
      }
    }, 1500);
    if (timer && typeof timer.unref === 'function') timer.unref();
  };
  // 以「面板看到的 running」为准对账：插件热重载后补挂，回合结束后收掉。
  const reconcileGuards = (snap) => {
    if (!jobsService || !snap || !Array.isArray(snap.pipelines)) return 0;
    let changed = 0;
    const live = new Map();
    for (const p of snap.pipelines) {
      if (p && p.running && p.root) live.set(String(p.root).toLowerCase(), p);
    }
    for (const [key, p] of live) {
      if (runGuards.has(key)) continue;
      guardHooks.onStart({ runId: (p.activity && p.activity.runId) || null, root: p.root });
      changed += 1;
    }
    for (const key of [...runGuards.keys()]) {
      if (live.has(key)) continue;
      stopGuard(key);
      changed += 1;
    }
    return changed;
  };
  setTimeout(() => { try { sweepGuardJobs(); } catch {} }, 0);
  const guardHooks = {
    onStart({ runId, root }) {
      if (!jobsService) return;
      const key = String(root || '').toLowerCase();
      if (!key || runGuards.has(key)) return;
      let settle = () => {};
      const done = new Promise((resolve) => {
        settle = resolve;
      });
      try {
        const id = jobsService.start({
          kind: 'bash',
          label: `ARIS 流水线运行中 · ${path.basename(String(root))}`,
          run(job) {
            try {
              if (job && typeof job.updateProgress === 'function') {
                job.updateProgress(`run ${String(runId || '').slice(0, 15)}`);
              }
            } catch {
              /* 进度只是附带信息 */
            }
            return { cancel() {}, done };
          },
        });
        runGuards.set(key, { id, settle });
        logger?.info?.(`dsh-aris: 退出确认已挂上（job ${id} · ${path.basename(String(root))}）`);
      } catch (error) {
        guardError = String((error && error.message) || error);
        if (!guardWarned) {
          guardWarned = true;
          logger?.warn?.('dsh-aris: 退出确认挂不上（job 服务拒绝注册），退出时不会提示', error);
        }
      }
    },
    onEnd({ root }) {
      stopGuard(root);
    },
  };

  // DSH 工作区登记：只读写宿主既有的 workspaceRegistry，自己不落任何账。
  const workspaceService = () => {
    const reg = ctx.get('workspaceRegistry');
    if (!reg) throw new Error('宿主未提供 workspaceRegistry');
    return reg;
  };
  const project = (ws) => ({
    id: String(ws.id),
    path: ws.path,
    title: ws.title,
    sessions: Array.isArray(ws.sessionIds) ? ws.sessionIds.length : 0,
  });

  const stateHandler = async (req, res) => {
    if (req.headers[PANEL_HEADER] !== '1') return json(res, 403, { ok: false, error: '缺少面板请求标记' });
    if ((req.method || 'GET').toUpperCase() !== 'GET') return json(res, 405, { ok: false, error: '只接受 GET' });
    try {
      const { snapshot, getBalance } = await lib();
      const dashboard = snapshot(workspace, config);
      const balance = await getBalance(workspace, dashboard.settings);
      // quitGuard 只作诊断：面板不认这个字段，问「退出为什么不提示」时一眼能看。
      json(res, 200, {
        ...dashboard, balance,
        quitGuard: { available: Boolean(jobsService), controller: Boolean(detachGuard), active: runGuards.size, listed: (() => { try { return jobsService.list().filter(isGuardJob).length; } catch { return -1; } })(), error: guardError },
      });
    } catch (error) {
      logger?.warn?.('dsh-aris: snapshot failed', error);
      json(res, 500, { ok: false, error: String(error) });
    }
  };

  // 谁在什么时候点了面板：只记动作与目标字段，用于事后归因（此前只有状态变化，没有来源）。
  const logAction = (action, input) => {
    try {
      const file = path.join(workspace, '.dsh', 'aris-actions.jsonl');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const brief = {};
      for (const k of ['root', 'name', 'mode', 'force', 'intervalMinutes']) {
        if (input && input[k] !== undefined) brief[k] = input[k];
      }
      fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), action, input: brief }) + String.fromCharCode(10));
    } catch { /* 审计写失败不影响动作 */ }
  };
  const actionHandler = async (req, res) => {
    if (req.headers[PANEL_HEADER] !== '1') return json(res, 403, { ok: false, error: '缺少面板请求标记' });
    if ((req.method || 'GET').toUpperCase() !== 'POST') return json(res, 405, { ok: false, error: '只接受 POST' });
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    const action = String((body && body.action) || '');
    if (action) logAction(action, (body && body.input) || {});
    if (!ACTIONS.has(action)) return json(res, 400, { ok: false, error: `未知动作：${action}` });
    try {
      const { control, snapshot, buildKimiPrompt, writeKimiPrompt } = await lib();
      if (action === 'workspace.list') {
        return json(res, 200, { ok: true, workspaces: workspaceService().list().map(project), dashboard: snapshot(workspace, config) });
      }
      if (action === 'workspace.register') {
        const input = (body && body.input) || {};
        const target = path.resolve(String(input.root || ''));
        const reg = workspaceService();
        const owner = await reg.resolveByPath(target).catch(() => undefined);
        const ws = owner || (await reg.create(target, String(input.title || path.basename(target))));
        const attached = await attachSessions(ws, target);
        return json(res, 200, { ok: true, created: !owner, attached, workspace: project(ws), dashboard: snapshot(workspace, config) });
      }
      if (action === 'workspace.unregister') {
        const input = (body && body.input) || {};
        const reg = workspaceService();
        const target = path.resolve(String(input.path || ''));
        const owner = await reg.resolveByPath(target).catch(() => undefined);
        const deleted = owner ? await reg.delete(owner.id) : false;
        return json(res, 200, { ok: true, deleted, workspace: owner ? project(owner) : null, dashboard: snapshot(workspace, config) });
      }
      if (action === 'sessions.name') {
        const snap = snapshot(workspace, config);
        const named = await nameSessions(snap);
        return json(res, 200, { ok: true, named, debug: titleDebug, dashboard: snapshot(workspace, config) });
      }
      if (action === 'sessions.retitle') {
        // 侧栏标题读的是 projcache 的旧投影：日志里的 session/title 已被我们写成
        // <时间> · Dsh_Aris · <流水线>（时间在前，便于按时间检索），但宿主没有再折叠。这里让宿主对冷会话重新
        // 折叠一次标题（prepare 把会话读进内存，refresh 从日志重算投影）。
        const snap = snapshot(workspace, config);
        const store = ctx.get('sessions');
        const titles = ctx.get('sessionTitle');
        const { sessionIds } = await lib();
        const out = [];
        let refreshed = 0;
        for (const p of snap.pipelines) {
          for (const id of sessionIds(p.root) || []) {
            const cur = readProjTitle(id);
            if (cur.includes('Dsh_Aris')) continue;
            if ((titleAttempts.get(id) || 0) >= 12) { out.push([id, 'give-up']); continue; }
            try {
              let session = store && typeof store.get === 'function' ? store.get(id) : null;
              if (!session && store && typeof store.prepare === 'function') session = store.prepare(id);
              if (!session) { out.push([id, 'no-session']); continue; }
              if (titles && typeof titles.refresh === 'function') await titles.refresh(session);
              titleAttempts.set(id, (titleAttempts.get(id) || 0) + 1);
              refreshed += 1;
              out.push([id, readProjTitle(id) || 'pending']);
            } catch (error) {
              out.push([id, String(error && error.message ? error.message : error).slice(0, 80)]);
            }
          }
        }
        return json(res, 200, { ok: true, refreshed, debug: out.slice(0, 12), dashboard: snapshot(workspace, config) });
      }
      if (action === 'kimi.prompt') {
        const input = (body && body.input) || {};
        const settings = snapshot(workspace, config).settings;
        const minutes = Number((settings.kimi && settings.kimi.intervalMinutes) || 30);
        const text = buildKimiPrompt({ mailbox: settings.mailbox, intervalMinutes: minutes });
        const file = input.write ? writeKimiPrompt(path.join(workspace, '.dsh', 'kimi-prompt.md'), text) : null;
        // 写盘（write=true）等于改了状态：带回快照，面板保存后立即反映，而不是等下一轮轮询。
        return json(res, 200, { ok: true, text, file, mailbox: settings.mailbox, intervalMinutes: minutes, dashboard: input.write ? snapshot(workspace, config) : undefined });
      }
      if (action === 'guard.test') {
        if (!jobsService) return json(res, 200, { ok: false, error: 'jobs 服务不可用' });
        let settle = () => {};
        const done = new Promise((resolve) => { settle = resolve; });
        try {
          const id = jobsService.start({ kind: 'bash', label: GUARD_LABEL + '自检', run() { return { cancel() {}, done }; } });
          setTimeout(() => {
            try { settle({ status: 'completed' }); } catch {}
            removeGuardJob(id);
            setTimeout(() => sweepGuardJobs(), 600);
          }, 400);
          return json(res, 200, { ok: true, id, remaining: sweepGuardJobs() });
        } catch (e) {
          return json(res, 200, { ok: false, error: String((e && e.message) || e) });
        }
      }
      const input = (body && body.input) || {};
      // 编译论文：一律重定向到受控脚本，面板不自己拼 latexmk。
      if (action === 'paper.build') {
        const p = pickPipeline(snapshot(workspace, config), input.name || input.root);
        const script = path.join(workspace, 'bin', 'paper-build.mjs');
        if (!fs.existsSync(script)) return json(res, 200, { ok: false, error: `缺少脚本：${script}` });
        const argv = [script, '--project', p.root, '--json'];
        if (input.all) argv.push('--all', '--out', 'build');
        else if (input.dir) argv.push('--dir', String(input.dir));
        if (input.clean) argv.push('--clean');
        const run = spawnSync(process.execPath, argv, {
          cwd: workspace, timeout: BUILD_TIMEOUT_MS, encoding: 'utf8', windowsHide: true,
        });
        const tail = (s, n = 2400) => String(s || '').slice(-n);
        let parsed = null;
        try { parsed = JSON.parse(String(run.stdout || '').trim()); } catch {}
        return json(res, 200, {
          ok: Boolean(parsed ? parsed.ok : run.status === 0), status: run.status, signal: run.signal,
          timedOut: Boolean(run.error && run.error.code === 'ETIMEDOUT'),
          build: parsed,
          out: tail(run.stdout), err: tail(run.stderr),
          dashboard: snapshot(workspace, config),
        });
      }
      if (action === 'run' || (action === 'human.reply' && input.restart)) input.hooks = guardHooks;
      const result = await control(workspace, action, input, config);
      json(res, 200, { ...result, dashboard: snapshot(workspace, config) });
    } catch (error) {
      json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ---- 会话视图：只读解 headless 会话日志，给「本轮做了什么」一个入口。----
  // 不依赖 GUI 的工作区登记：会话按 cwd 分桶，插件自己定位；解压失败只丢尾帧。
  const sessionHandler = async (req, res) => {
    if (req.headers[PANEL_HEADER] !== '1') return json(res, 403, { ok: false, error: '缺少面板请求标记' });
    if ((req.method || 'GET').toUpperCase() !== 'GET') return json(res, 405, { ok: false, error: '只接受 GET' });
    try {
      const { snapshot: snapNow } = await lib();
      const url = new URL(req.url || '/', 'http://local');
      const p = pickPipeline(snapNow(workspace, config), url.searchParams.get('name'));
      const id = String(url.searchParams.get('id') || p.lastSessionId || '').trim();
      if (!id) return json(res, 404, { ok: false, error: '这条流水线还没有会话记录：跑过一轮之后才有' });
      const out = readSession(p.root, id, { limit: url.searchParams.get('limit') || 160 });
      out.pipeline = { name: p.name, driver: p.driver, root: p.root };
      json(res, 200, out);
    } catch (error) {
      json(res, 404, { ok: false, error: String((error && error.message) || error) });
    }
  };

  // ---- 产物视图：只读扫描与单文件预览。懒加载，不进 5s 轮询。----
  const artifactsHandler = async (req, res) => {
    if (req.headers[PANEL_HEADER] !== '1') return json(res, 403, { ok: false, error: '缺少面板请求标记' });
    if ((req.method || 'GET').toUpperCase() !== 'GET') return json(res, 405, { ok: false, error: '只接受 GET' });
    try {
      const { snapshot: snapNow } = await lib();
      const url = new URL(req.url || '/', 'http://local');
      const p = pickPipeline(snapNow(workspace, config), url.searchParams.get('name'));
      const out = scanArtifacts(p.root, p.driver, { group: url.searchParams.get('group') || '' });
      out.pipeline = { name: p.name, driver: p.driver, root: p.root };
      if (url.searchParams.get('audit') === '1') out.audit = auditPaper(p.root, p.driver);
      json(res, 200, out);
    } catch (error) {
      json(res, 500, { ok: false, error: String((error && error.message) || error) });
    }
  };

  const fileHandler = async (req, res) => {
    if (req.headers[PANEL_HEADER] !== '1') return json(res, 403, { ok: false, error: '缺少面板请求标记' });
    if ((req.method || 'GET').toUpperCase() !== 'GET') return json(res, 405, { ok: false, error: '只接受 GET' });
    try {
      const { snapshot: snapNow } = await lib();
      const url = new URL(req.url || '/', 'http://local');
      const rel = url.searchParams.get('rel') || '';
      if (!rel) return json(res, 400, { ok: false, error: '缺少 rel 参数' });
      const p = pickPipeline(snapNow(workspace, config), url.searchParams.get('name'));
      const out = readArtifactFile(p.root, rel);
      json(res, out.ok ? 200 : 404, out);
    } catch (error) {
      json(res, 500, { ok: false, error: String((error && error.message) || error) });
    }
  };

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: SESSION_PATH, handler: sessionHandler }),
    'dsh-aris: session transcript route',
  );

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ARTIFACTS_PATH, handler: artifactsHandler }),
    'dsh-aris: artifacts route',
  );
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: FILE_PATH, handler: fileHandler }),
    'dsh-aris: artifact preview route',
  );

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: STATE_PATH, handler: stateHandler }),
    'dsh-aris: dashboard state route',
  );
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ACTION_PATH, handler: actionHandler }),
    'dsh-aris: dashboard action route',
  );

  // 让「刚跑完、桌面端列表还不知道」的会话即时出现在侧栏。
  // 侧栏读的是一份列表投影（客户端 sessions.list）：只有本进程经 API 创建/改名时才会
  // 增量推给浏览器；headless 是另一个进程，它写下的会话文件不会触发任何推送，于是只能
  // 整页刷新后重新拉一次列表才看得到。这里直接广播宿主侧的 api-session/added 事件
  // （客户端在 ctx.remote.$on 里接收），能带就顺带带上 title 投影，一次到位。
  const announceSession = (root, id, title, createdAt) => {
    try {
      const summary = {
        sessionId: id,
        updatedAt: Number(createdAt) || Date.now(),
        agentAvailable: false,
        running: false,
        blank: false,
        cwd: root,
      };
      if (title) summary.projections = { kind: 'cached', values: { title } };
      if (typeof ctx.emit === 'function') ctx.emit('api-session/added', summary);
      return true;
    } catch (error) {
      if (titleDebug.length < 6) titleDebug.push(`announce ${id}: ${error && error.message ? error.message : error}`);
      return false;
    }
  };

  // 把这条流水线跑过的 headless 会话挂进它对应的 DSH 工作区：
  // 会话本身按 cwd 分桶存在 ~/.dsh/sessions 下，但只有 attachSession 之后
  // 才会出现在左侧工作区分组里。
  const attachSessions = async (ws, root) => {
    if (!ws || typeof ws.attachSession !== 'function') return 0;
    const { sessionIds, liveSessionId } = await lib();
    const known = new Set(ws.sessionIds || []);
    let added = 0;
    for (const id of sessionIds(root)) {
      if (known.has(id)) continue;
      try {
        await ws.attachSession(id);
        added += 1;
        // 挂上了但没推送，浏览器要整页刷新才看得到；补一条 added 事件。
        announceSession(root, id, readProjTitle(id));
      } catch {
        /* 会话已被清理或已归档，跳过 */
      }
    }
    // 正在跑的那一轮还没有 meta.json，但会话文件从启动第 1–2 秒就在磁盘上：
    // 提前挂进工作区，让用户能看到「这一轮现在在干什么」（是否插手由人决定）。
    const live = typeof liveSessionId === 'function' ? liveSessionId(root) : null;
    if (live && !known.has(live)) {
      try {
        await ws.attachSession(live);
        added += 1;
        announceSession(root, live, readProjTitle(live));
      } catch {
        /* 会话尚未落盘或宿主未就绪，下一拍再试 */
      }
    }
    // meta.json 只在收尾时写：崩溃、被强杀、或早于 meta 落盘就退出的轮次，
    // 它那条会话永远不会被 sessionIds(root) 列出来。这里兜底扫一遍该 cwd 的会话桶，
    // 试着挂上去（attachSession 自己会校验 header.cwd，不匹配的会抛，跳过即可）。
    let scanned = 0;
    try {
      const bucket = path.join(sessionsHome(), 'sessions', bucketOf(root));
      for (const name of fs.readdirSync(bucket)) {
        if (scanned >= 20) break;
        if (!/^session-[0-9a-f-]{36}$/i.test(name)) continue;
        if (known.has(name)) continue;
        scanned += 1;
        try {
          await ws.attachSession(name);
          added += 1;
          announceSession(root, name, readProjTitle(name));
        } catch {
          /* 不是这条工作区的会话，或已被清理 */
        }
      }
    } catch {
      /* 桶不存在就没什么可扫的 */
    }
    return added;
  };

  const syncSessions = async (snap) => {
    const reg = ctx.get('workspaceRegistry');
    if (!reg || typeof reg.resolveByPath !== 'function') return 0;
    let added = 0;
    for (const p of snap.pipelines) {
      let ws = null;
      try {
        ws = await reg.resolveByPath(p.root);
      } catch {
        continue;
      }
      if (ws) added += await attachSessions(ws, p.root);
    }
    return added;
  };


  // 给自动回合产生的 headless 会话补一个标题。
  // 标题是 log-backed 的（`session/title` 事件），只在 GUI 打开会话时才生成，
  // 所以刚跑完的会话在侧栏里是空白名字。这里直接用持久化句柄追加标题事件，
  // 不动会话内容，也不依赖会话在宿主进程里是 live 的。
  const titleState = new Map(); // sessionId -> 'done' | 'skip'
  const titleAttempts = new Map(); // sessionId -> 已重写次数（宿主可能用 AI 标题覆盖我们写的）
  const titleDebug = [];
  // 宿主会在会话首次加载时用「模型生成的标题」覆盖我们的 session/title 事件；
  // 这里读投影缓存确认当前标题，必要时补写一次（最多 2 次），直到显示的标题里含 Dsh_Aris。
  const projTitleFile = (id) => {
    try {
      const home = process.env.USERPROFILE || process.env.HOME || '';
      if (!home) return '';
      return path.join(home, '.dsh', 'storages', 'session_projcache', 'sessions', `${id}.json`);
    } catch {
      return '';
    }
  };
  const readProjTitle = (id) => {
    try {
      const file = projTitleFile(id);
      if (!file || !fs.existsSync(file)) return '';
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return String((data && data.record && data.record.rows && data.record.rows.title && data.record.rows.title.val) || '');
    } catch {
      return '';
    }
  };
  // 侧栏读的是 projcache 里的标题投影；宿主对冷会话不会重新折叠，写日志后
  // 顺手同步一份，保证宿主下次重载时侧栏直接显示「时间 · Dsh_Aris · 流水线」，而不是自动名。
  const patchProjTitle = (id, title, seq) => {
    try {
      const file = projTitleFile(id);
      if (!file || !fs.existsSync(file)) return;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const row = data && data.record && data.record.rows && data.record.rows.title;
      if (!row || row.val === title) return;
      row.val = title;
      if (Number.isFinite(seq)) row.seq = seq;
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch {
      /* 投影缓存写不了不影响日志里的标题 */
    }
  };
  const titleMarkFile = () => path.join(workspace, '.dsh', 'aris-titled.json');  const readTitled = () => {
    try {
      const raw = JSON.parse(fs.readFileSync(titleMarkFile(), 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  };
  const writeTitled = (map) => {
    try {
      fs.mkdirSync(path.dirname(titleMarkFile()), { recursive: true });
      fs.writeFileSync(titleMarkFile(), JSON.stringify(map, null, 2), 'utf8');
    } catch {
      /* 标记文件写不了不影响标题本身 */
    }
  };
  // 给自动回合产生的 headless 会话写一个可读标题。
  // 标题是 log-backed 的（`session/title` 事件，last-wins）：GUI 只在打开会话时才生成，
  // 所以刚跑完的会话在侧栏里要点了才更新名字。这里直接用持久化句柄追加标题事件。
  const nameSessions = async (snap) => {
    const sp = ctx.get('sessionPersistence');
    const store = ctx.get('sessions');
    const titles = ctx.get('sessionTitle');
    const { sessionIds, liveSessionId } = await lib();
    const titled = readTitled();
    // 新标题格式：<时间> · Dsh_Aris · <流水线>（时间在前，侧栏按时间检索）。
    const TITLE_RE = /^\d{2}-\d{2} \d{2}:\d{2} · Dsh_Aris · .+$/;
    let named = 0;
    for (const p of snap.pipelines) {
      // 正在写的那条会话不能碰：headless 进程持有它的写句柄，往里追加
      // session/title 事件会和对方的帧交错。等它收尾后由下一拍正常命名。
      const liveId = typeof liveSessionId === 'function' ? liveSessionId(p.root) : null;
      // 名字来源两处：meta.json 里登记过的（我们的轮次），以及已经挂进工作区但还没名字的
      // （崩溃/被强杀、meta 没落盘的轮次）。后者要先在日志里认领「这是我们起的回合」，
      // 免得把用户在同一目录下手动开的会话改名。
      const mine = new Set(sessionIds(p.root) || []);
      let attached = [];
      try {
        const reg = ctx.get('workspaceRegistry');
        const ws = reg && typeof reg.resolveByPath === 'function' ? await reg.resolveByPath(p.root) : null;
        attached = ws && Array.isArray(ws.sessionIds) ? ws.sessionIds : [];
      } catch {
        attached = [];
      }
      const queue = Array.from(new Set([...mine, ...attached]));
      for (const id of queue) {
        // 每拍最多迁 12 条，避免重载后一次性写几十个冷会话文件。
        if (named >= 12) break;
        if (liveId && id === liveId) continue;
        if (titleState.has(id)) continue;
        const cur = readProjTitle(id);
        // 已经是新格式（时间在前）就跳过；旧格式「Dsh_Aris · …」留到下面重写。
        if (cur && TITLE_RE.test(cur)) continue;
        if (titled[id] && cur && !cur.includes('Dsh_Aris')) {
          // 我们起过名，但标题被 app 改回自动名：重试，最多 12 次。
          if ((titleAttempts.get(id) || 0) >= 12) continue;
          titleAttempts.set(id, (titleAttempts.get(id) || 0) + 1);
        }
        const live = store && typeof store.get === 'function' ? store.get(id) : null;
        if (live) {
          // 不是 meta 登记的轮次就不碰：同目录下用户自己开的会话不能被我们改名。
          if (!mine.has(id)) { titleState.set(id, 'skip'); continue; }
          // 会话在本机是活的（GUI 打开过或宿主仍持有写句柄）：直接走标题服务改名。
          try {
            const session = live;
            const title = `${stampOf(session.header && session.header.createdAt)} · Dsh_Aris · ${p.name}`;
            if (titles && typeof titles.rename === 'function') titles.rename(session, title);
            titled[id] = title;
            writeTitled(titled);
            titleState.set(id, 'done');
            named += 1;
            announceSession(p.root, id, title, session.header && session.header.createdAt);
          } catch (error) {
            titleState.set(id, 'skip');
            if (titleDebug.length < 6) titleDebug.push(`${id}: ${error && error.message ? error.message : error}`);
          }
          continue;
        }
        let read = null;
        try {
          if (!sp || typeof sp.open !== 'function') { titleState.set(id, 'skip'); continue; }
          read = await sp.open(id, 'read');
          const { events } = await read.read();
          const list = events || [];
          if (!mine.has(id)) {
            // 不是 meta 登记的轮次：只有日志里留下我们提示词头（含 Dsh_Aris）才认领，
            // 否则可能是用户手动开的会话，不能改名。
            const looksOurs = list.slice(0, 20).some((e) => {
              try { return JSON.stringify(e).includes('Dsh_Aris'); } catch { return false; }
            });
            if (!looksOurs) {
              await read.close().catch(() => {});
              read = null;
              titleState.set(id, 'skip');
              continue;
            }
          }
          const stamp = stampOf(read.header && read.header.createdAt);
          const createdMs = read.header && read.header.createdAt;
          const title = `${stamp} · Dsh_Aris · ${p.name}`;
          const last = list.length ? list[list.length - 1] : null;
          const seq = last ? Number(last.seq) + 1 : 0;
          await read.close().catch(() => {});
          read = null;
          const write = await sp.open(id, 'write');
          try {
            await write.append([
              { type: 'session/title', seq, time: Date.now(), data: { title, messageSeqs: [], source: { kind: 'user' } } },
            ]);
            await write.flush();
          } finally {
            await write.close().catch(() => {});
          }
          titled[id] = title;
          writeTitled(titled);
          patchProjTitle(id, title, seq);
          titleState.set(id, 'done');
          named += 1;
          // 冷会话：上面只改了磁盘上的日志，浏览器不知道；补一条带标题的 added 事件，
          // 否则要整页刷新才会出现（用户 2026-11-12 反馈的正是这个）。
          announceSession(p.root, id, title, createdMs);
        } catch (error) {
          // 写句柄被别的进程（正在跑的回合）占着不是错误：下一拍再试。
          const msg = String(error && error.message ? error.message : error);
          if (!/already owned|active write handle/.test(msg)) titleState.set(id, 'skip');
          if (titleDebug.length < 6) titleDebug.push(`${id}: ${msg.slice(0, 80)}`);
        } finally {
          if (read) await read.close().catch(() => {});
        }
      }
    }
    return named;
  };

  const stampOf = (ms) => {
    const d = new Date(Number(ms) || Date.now());
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };

  // 后台节拍：面板关掉也继续跑，只要 DSH 宿主进程在。
  let busy = false;
  let timer = null;
  const beat = async () => {
    if (busy) return;
    busy = true;
    try {
      const { snapshot, detectChanges, control } = await lib();
      const snap = snapshot(workspace, config);
      try {
        const floor = await control(workspace, 'balance.check', {}, config);
        if (floor && floor.halted && floor.halted.length) logger?.warn?.(`dsh-aris: ${floor.reason}`);
      } catch {
        /* 余额读不到不阻塞节拍 */
      }
      // 变化先落账本，再决定要不要跑：交回 Kimi 或全部停用时也记事件。
      const changes = detectChanges(workspace, snap);
      // 先收拾上一条被关机/被杀打断的回合，否则它会一直占着 running。
      try {
        await control(workspace, 'recover', {}, config);
      } catch {
        /* 恢复失败不影响节拍 */
      }
      try {
        const fixed = reconcileGuards(snap);
        if (fixed) logger?.info?.(`dsh-aris: 守卫对账 ${fixed} 项`);
      } catch { /* 对账失败不影响节拍 */ }
      if (changes.length) logger?.info?.(`dsh-aris: ${changes.length} change(s) recorded`);
      let attached = 0;
      try {
        attached = await syncSessions(snap);
        if (attached) logger?.info?.(`dsh-aris: ${attached} session(s) attached to workspaces`);
      } catch (error) {
        // 会话挂载失败绝不能挡住 tick —— 否则流水线会静默停摆（2026-11-12 踩过）。
        logger?.warn?.('dsh-aris: attach sessions failed', error);
      }
      try {
        const named = await nameSessions(snap);
        if (named) logger?.info?.(`dsh-aris: ${named} session(s) titled`);
      } catch (error) {
        logger?.warn?.('dsh-aris: title sessions failed', error);
      }
      if (!snap.pipelines.some((p) => p.enabled && p.mode === 'dsh')) return;
      const result = await control(workspace, 'tick', { hooks: guardHooks }, config);
      const started = (result.results || []).filter((r) => r && r.started);
      if (started.length) logger?.info?.(`dsh-aris: ticker started ${started.length} pipeline(s)`);
    } catch (error) {
      logger?.warn?.('dsh-aris: tick failed', error);
    } finally {
      busy = false;
    }
  };

  ctx.effect(() => {
    timer = setInterval(beat, TICK_MS);
    if (timer && typeof timer.unref === 'function') timer.unref();
    return () => {
      if (timer) clearInterval(timer);
      timer = null;
      // 插件卸载时把守卫 job 一并收掉，免得退出确认一直显示「有任务」。
      for (const key of [...runGuards.keys()]) stopGuard(key);
      try { if (typeof detachGuard === 'function') detachGuard(); } catch { /* 已 detach */ }
    };
  }, 'dsh-aris: pipeline ticker');

  setTimeout(() => {
    lib().then(({ snapshot }) => {
      try { reconcileGuards(snapshot(workspace, config)); } catch { /* 快照失败就等节拍 */ }
    }).catch(() => {});
  }, 800);
  logger?.info?.(`dsh-aris: dashboard mounted for ${workspace} (tick ${TICK_MS / 1000}s)`);
}
