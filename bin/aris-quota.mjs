#!/usr/bin/env node
// 送审前查 GPT 外审额度：给流水线执行者一个不必读预算文件的入口。
// 用法：node bin/aris-quota.mjs [workspace] [--target <送审包>]
// 输出一行 JSON：{ blocked, freeAt, minutes, used, limit, reason }
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveReviewer } from './lib/review-route.mjs';
import { quotaGate, readCodexConfig, rememberReviewQuota } from './lib/codex-review.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : '';
const workspace = (args[0] !== '--target' ? args[0] : '') || process.env.ARIS_WORKSPACE || path.resolve(here, '..');

try {
  const cfg = readCodexConfig(workspace);
  const reviewer = effectiveReviewer(workspace, process.cwd());
  const gate = reviewer === 'kimi' ? { blocked: false } : quotaGate(workspace, cfg);
  if (target && gate.blocked) rememberReviewQuota(process.cwd(), target, target, gate);
  process.stdout.write(JSON.stringify({
    blocked: !!gate.blocked,
    freeAt: gate.freeAt || null,
    minutes: gate.minutes != null ? gate.minutes : null,
    used: gate.used != null ? gate.used : null,
    limit: gate.limit != null ? gate.limit : null,
    reason: gate.reason || '',
  }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ blocked: true, freeAt: null, minutes: null, error: String((error && error.message) || error) }) + '\n');
}
