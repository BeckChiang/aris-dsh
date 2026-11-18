// 审核线路：决定这一轮走哪条审查通道。
//   kimi = Kimi 邮箱取件（人工/应用内定时任务作答）
//   gpt  = 本机 ChatGPT（Codex CLI）直跑
//   auto = 跟随项目 .aris/reviewer.json 的 active 通道（还是面板设的那条）
//
// 面板是唯一写入点：改线路时同时写 DSH 的 `.dsh/aris-dashboard.json` 与每个项目的
// `.aris/reviewer.json`（双槽保留，切回去不丢配置），两边都回读校验。
// 真正的执行仍在 aris-review / codex-review / 流水线的 python 桥里。
import fs from 'node:fs';
import path from 'node:path';

export const ROUTE_OPTIONS = [
  {
    value: 'auto',
    label: '自动（跟随项目配置）',
    hint: '沿用项目 .aris/reviewer.json 里 active 那条；这是切来切去之后的安全默认',
  },
  { value: 'kimi', label: 'Kimi 邮箱', hint: '只走邮箱取件；GPT 派单会被拒绝，避免两条线同时改稿' },
  { value: 'gpt', label: 'GPT 外审', hint: '只走本机 ChatGPT；邮箱投递会被拒绝' },
];

const CHANNELS = new Set(ROUTE_OPTIONS.map((o) => o.value));

/** 两套槽位预设：切换线路时把当前槽挪进 channels，另一套铺出来。 */
export const CHANNEL_SLOTS = {
  gpt: [
    {
      slot: 1,
      id: 'gpt-codex',
      via: 'codex',
      label: 'GPT（Codex 桌面端 · 订阅登录）',
      tier: 'T2',
      timeoutSec: 600,
      task: 'routine_review',
      model_hint: 'gpt-6.2-sol',
    },
  ],
  kimi: [
    {
      slot: 1,
      id: 'kimi-mailbox',
      via: 'kimi-mailbox',
      label: 'Kimi 邮箱审稿',
      tier: 'T2',
      timeoutSec: 600,
    },
  ],
};

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

/** via 字段 → 通道名；认不出来按 kimi（老配置都是邮箱）。 */
export function channelOfVia(via) {
  const v = String(via || '').toLowerCase();
  if (v === 'codex') return 'gpt';
  if (v === 'direct') return 'direct';
  return 'kimi';
}

/** 项目的 reviewer.json 路径。 */
export function projectReviewerFile(root) {
  return path.join(root, '.aris', 'reviewer.json');
}

/**
 * 读项目双槽：返回 { file, exists, active, channels:{kimi:[...],gpt:[...]} }。
 * 老格式（只有扁平 reviewers[]）按 via 归到某个通道，另一通道给预设。
 */
export function readProjectSlots(root) {
  const file = projectReviewerFile(root);
  const raw = readJson(file, null);
  if (!raw || typeof raw !== 'object') {
    return { file, exists: false, active: null, channels: structuredClone(CHANNEL_SLOTS), note: '' };
  }
  const channels = {
    kimi: Array.isArray(raw.channels && raw.channels.kimi) ? raw.channels.kimi : null,
    gpt: Array.isArray(raw.channels && raw.channels.gpt) ? raw.channels.gpt : null,
  };
  const reviewers = Array.isArray(raw.reviewers) ? raw.reviewers : [];
  if (!channels.kimi && !channels.gpt) {
    // 迁移：把现有 reviewers 归到它所属通道
    const migrated = { kimi: [], gpt: [] };
    for (const r of reviewers) {
      const ch = channelOfVia(r && r.via);
      if (ch === 'direct') continue;
      migrated[ch].push(r);
    }
    channels.kimi = migrated.kimi.length ? migrated.kimi : structuredClone(CHANNEL_SLOTS.kimi);
    channels.gpt = migrated.gpt.length ? migrated.gpt : structuredClone(CHANNEL_SLOTS.gpt);
  }
  if (!channels.kimi) channels.kimi = structuredClone(CHANNEL_SLOTS.kimi);
  if (!channels.gpt) channels.gpt = structuredClone(CHANNEL_SLOTS.gpt);
  const active = ['kimi', 'gpt'].includes(raw.active)
    ? raw.active
    : channelOfVia((reviewers[0] || {}).via) === 'gpt'
      ? 'gpt'
      : 'kimi';
  return { file, exists: true, active, channels, note: String(raw.note || '') };
}

/**
 * 把项目切到某条通道：当前槽存进 channels[active]，新通道的槽铺到 reviewers[]。
 * 写后回读，返回真值。
 */
export function syncProjectRoute(root, channel, name = '') {
  if (!CHANNELS.has(channel) || channel === 'auto') {
    const slots = readProjectSlots(root);
    return { root, name, ok: true, skipped: true, active: slots.active };
  }
  if (!fs.existsSync(path.join(root, '.aris'))) {
    return { root, name, ok: true, skipped: true, active: null, reason: '没有 .aris 目录' };
  }
  const slots = readProjectSlots(root);
  const channels = slots.channels;
  // 把当前生效的 reviewers 归位到它自己的通道（避免手工改过的配置被丢）
  const current = slots.active || 'kimi';
  const nowReviewers = readJson(slots.file, {}) && readJson(slots.file, {}).reviewers;
  if (Array.isArray(nowReviewers) && nowReviewers.length) {
    const belongs = channelOfVia((nowReviewers[0] || {}).via);
    if (belongs === 'kimi' || belongs === 'gpt') channels[belongs] = nowReviewers;
  }
  const next = {
    version: 2,
    note: `审核线路由 DSH 面板管理：通道 ${channel}；两套槽位都保留在 channels 里，切回去不会丢配置。`,
    active: channel,
    reviewers: structuredClone(channels[channel]),
    channels,
  };
  writeJsonAtomic(slots.file, next);
  const after = readProjectSlots(root);
  return { root, name, ok: after.active === channel, active: after.active, file: after.file };
}

/**
 * 面板改线路：写 DSH 设置 + 同步每个项目，返回两边的回读结果。
 * projects: [{root}]（来自注册表）；不传就只改 DSH 设置。
 */
export function saveReviewRoute(workspace, channel, projects = []) {
  const next = String(channel || '').trim();
  if (!CHANNELS.has(next)) {
    throw new Error(`审核线路只能是 auto | kimi | gpt，收到 "${next}"`);
  }
  const raw = readJson(settingsFile(workspace), {}) || {};
  raw.external = { ...(raw.external || {}) };
  raw.external.review = { ...(raw.external.review || {}), channel: next };
  writeJsonAtomic(settingsFile(workspace), raw);
  const saved = readReviewRoute(workspace);
  const synced = [];
  for (const p of Array.isArray(projects) ? projects : []) {
    const root = String((p && p.root) || p || '').trim();
    if (!root) continue;
    const name = String((p && (p.name || p.label)) || '').trim();
    try {
      synced.push(syncProjectRoute(root, saved.channel, name));
    } catch (e) {
      synced.push({ root, name, ok: false, error: String((e && e.message) || e) });
    }
  }
  return { ...saved, projects: synced };
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
