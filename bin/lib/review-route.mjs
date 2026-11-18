// 审核线路：决定这一轮走哪条审查通道。
//   kimi = Kimi 邮箱取件（人工/应用内定时任务作答）
//   gpt  = 本机 ChatGPT（Codex CLI）直跑
//   auto = 两条都开放，靠单飞锁互斥，谁先占锁谁跑
//
// 只做「路由意图」的存取与判定；真正的执行仍在 aris-review / codex-review 里。
import fs from 'node:fs';
import path from 'node:path';

export const ROUTE_OPTIONS = [
  { value: 'auto', label: '自动（谁先占锁谁跑）', hint: '两条通道都开放，受审核单飞锁互斥；适合不想手动切换时' },
  { value: 'kimi', label: 'Kimi 邮箱', hint: '只走邮箱取件；GPT 派单会被拒绝，避免两条线同时改稿' },
  { value: 'gpt', label: 'GPT 外审', hint: '只走本机 ChatGPT；邮箱投递会被拒绝' },
];

const CHANNELS = new Set(ROUTE_OPTIONS.map((o) => o.value));

function settingsFile(workspace) {
  return path.join(workspace, '.dsh', 'aris-dashboard.json');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** 当前审核线路：external.review.channel，缺省 auto。 */
export function readReviewRoute(workspace) {
  const raw = readJson(settingsFile(workspace), {}) || {};
  const ch = ((raw.external && raw.external.review) || {}).channel;
  return {
    channel: CHANNELS.has(ch) ? ch : 'auto',
    options: ROUTE_OPTIONS,
    file: settingsFile(workspace),
  };
}

/** 改线路；返回落盘后重读的真值（写后回读，不做乐观回显）。 */
export function saveReviewRoute(workspace, channel) {
  const next = String(channel || '').trim();
  if (!CHANNELS.has(next)) {
    throw new Error(`审核线路只能是 auto | kimi | gpt，收到 "${next}"`);
  }
  const raw = readJson(settingsFile(workspace), {}) || {};
  raw.external = { ...(raw.external || {}) };
  raw.external.review = { ...(raw.external.review || {}), channel: next };
  writeJsonAtomic(settingsFile(workspace), raw);
  return readReviewRoute(workspace);
}

/** 派单前的线路闸门：给 codex/邮箱两侧共用，返回 null 表示放行。 */
export function routeBlocks(workspace, wanted /* 'kimi' | 'gpt' */) {
  const { channel } = readReviewRoute(workspace);
  if (channel === 'auto' || channel === wanted) return null;
  const other = channel === 'kimi' ? 'Kimi 邮箱' : 'GPT 外审';
  const self = wanted === 'kimi' ? 'Kimi 邮箱' : 'GPT 外审';
  const hint = wanted === 'kimi'
    ? '；审稿请直接用 `node bin/aris-review.mjs --project <项目> --slot 1 --target <稿>`（项目 .aris/reviewer.json 的 slot 1 已指向 GPT），不要再用 --enqueue'
    : '；要用 GPT 请把面板「审核 → 审核线路」改成 auto 或 gpt';
  return `审核线路当前设为「${other}」，${self}这条路被关掉了${hint}`;
}
