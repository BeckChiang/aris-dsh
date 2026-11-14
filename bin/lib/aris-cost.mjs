// 成本核算：把 dsh headless 的事件流折算成 token 与人民币。
//
// 口径与 DSH 自带 cost-meter 一致：
//   输入（缓存命中）= usage.cacheReadTokens
//   输入（未命中）  = usage.inputTokens
//   输出            = usage.outputTokens
// 价格取自 DeepSeek 官网（CNY / 百万 tokens）。高峰价是空闲价的两倍，
// 高峰时段 = 北京时间周一至周五 09:00–12:00、14:00–18:00（法定节假日按配置排除）。

export const PRICES_VERSION = '2026-11';

// 单价：元 / 百万 tokens。
export const DEFAULT_PRICES = {
  'deepseek-flash': {
    off: { cacheRead: 0.02, input: 1, output: 4 },
    peak: { cacheRead: 0.04, input: 2, output: 8 },
  },
  'deepseek-v4-pro': {
    off: { cacheRead: 0.15, input: 4.5, output: 13.5 },
    peak: { cacheRead: 0.3, input: 9, output: 27 },
  },
};

export const MODEL_ALIASES = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
  'deepseek-chat': 'deepseek-flash',
};

export const PEAK_WINDOWS = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
];

/**
 * 判断某个时刻是否处于高峰时段。
 * 周末与 holidays 里列出的日期（YYYY-MM-DD）全天按空闲价。
 */
export function isPeak(date, { holidays = [], timeZone = 'Asia/Shanghai' } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(d);
  } catch {
    return false;
  }
  const f = {};
  for (const p of parts) f[p.type] = p.value;
  if (f.weekday === 'Sat' || f.weekday === 'Sun') return false;
  const day = `${f.year}-${f.month}-${f.day}`;
  if (holidays.includes(day)) return false;
  const mins = (Number(f.hour) % 24) * 60 + Number(f.minute);
  return PEAK_WINDOWS.some(([a, b]) => mins >= a && mins < b);
}

/** 取某模型在某一时刻的单价；未知模型返回 null，调用方应只显示 token。 */
export function rateFor(model, date, { prices = DEFAULT_PRICES, holidays = [] } = {}) {
  const key = MODEL_ALIASES[model] || model;
  const entry = prices[key];
  if (!entry || !entry.peak || !entry.off) return null;
  const peak = isPeak(date, { holidays });
  return { model: key, peak, ...(peak ? entry.peak : entry.off) };
}

export function normalizeUsage(raw) {
  const u = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const cacheRead = num(u.cacheRead ?? u.cacheReadTokens ?? u.cacheReadInputTokens);
  const input = num(u.input ?? u.inputTokens ?? u.promptTokens);
  const output = num(u.output ?? u.outputTokens ?? u.completionTokens);
  const cacheWrite = num(u.cacheWrite ?? u.cacheWriteTokens);
  return {
    input,
    cacheRead,
    cacheWrite,
    output,
    total: num(u.total ?? u.totalTokens) || input + cacheRead + cacheWrite + output,
  };
}

export function addUsage(a, b) {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
    total: a.total + b.total,
  };
}

export const ZERO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, total: 0 };

/** token × 单价，单位元。 */
export function priceUsage(usage, rate) {
  const u = normalizeUsage(usage);
  if (!rate) return null;
  const yuan = (tokens, perMillion) => (tokens / 1e6) * perMillion;
  const input = yuan(u.input, rate.input);
  const cacheRead = yuan(u.cacheRead, rate.cacheRead);
  const output = yuan(u.output, rate.output);
  return {
    input: round6(input),
    cacheRead: round6(cacheRead),
    output: round6(output),
    total: round6(input + cacheRead + output),
    rate: { input: rate.input, cacheRead: rate.cacheRead, output: rate.output },
    peak: Boolean(rate.peak),
    model: rate.model,
  };
}

function round6(v) {
  return Math.round(v * 1e6) / 1e6;
}

/** 汇总一组 run 记录（每项形如 {usage, cny}）。 */
export function summarizeRuns(runs) {
  let usage = { ...ZERO_USAGE };
  let cny = 0;
  let priced = 0;
  let unpriced = 0;
  for (const run of runs || []) {
    if (!run) continue;
    if (run.usage) usage = addUsage(usage, normalizeUsage(run.usage));
    if (run.cny && Number.isFinite(run.cny.total)) {
      cny += run.cny.total;
      priced += 1;
    } else {
      unpriced += 1;
    }
  }
  return { usage, cny: round6(cny), runs: (runs || []).length, priced, unpriced };
}

/** 可读化：0.0034 → "¥0.0034"，1.2 → "¥1.20"。 */
export function yuanLabel(v) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '¥0';
  if (v < 0.01) return `¥${v.toFixed(4)}`;
  return `¥${v.toFixed(2)}`;
}

export function tokenLabel(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1e6) return `${Math.round(v / 100) / 10}k`;
  return `${Math.round(v / 1e5) / 10}M`;
}

/** 从 NDJSON 事件行里抽取 usage（status.step_end 带 usage）。 */
export function usageFromEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type !== 'status') return null;
  if (event.phase !== 'step_end') return null;
  if (!event.usage || typeof event.usage !== 'object') return null;
  return normalizeUsage(event.usage);
}
