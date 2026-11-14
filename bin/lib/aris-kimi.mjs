// 生成给 Kimi Work 定时任务用的「取件人提示词」。
// 只拼字符串，不碰邮箱、不判断状态；邮箱地址与唤醒间隔由调用方给。
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_INTERVAL_MINUTES = 30;

export function buildKimiPrompt({ mailbox, intervalMinutes = DEFAULT_INTERVAL_MINUTES } = {}) {
  const box = String(mailbox || '').trim().replace(/\\/g, '/');
  const minutes = Number(intervalMinutes) > 0 ? Number(intervalMinutes) : DEFAULT_INTERVAL_MINUTES;
  if (!box) throw new Error('缺少邮箱目录：先在工作区 .dsh/aris-dashboard.json 里配置 mailbox');

  return `你是 ARIS 审查邮箱的取件人。这个任务每 ${minutes} 分钟唤醒一次，每次只做一件事。

邮箱目录：${box}

1. 先读 ${box}/queue.md。如果写着 \`PENDING: 0\`，回一句「无新请求」就结束，不要做别的。
2. 如果 \`PENDING: N\`（N>0），只打开「## 待处理」里最早的那一条请求（in/ 按文件名升序就是时间序）。
   不要遍历整个 in/，也不要在这一轮里接着处理下一条——同一轮连审多个包，前面的证据会在后面的判定里串味。
3. 把这条请求文件里 \`===== SYSTEM PROMPT BEGIN/END =====\` 与 \`===== USER PROMPT BEGIN/END =====\`
   两段标记之间的内容，逐字作为本轮的系统指令与用户内容，执行一次独立审查。
   只用该请求文件内的证据判断，不要引用你对任何项目的记忆或历史结论。
4. 把完整回复写进 ${box}/out/<与请求同名的>.reply.md（只把 .request 换成 .reply）。
   回复第一行必须是 \`Reviewer-Model: <你的模型名与版本>\`；
   正文按 SYSTEM PROMPT 要求的格式写，必须包含 \`VERDICT: accept|revise|reject\` 与 \`Score: N/10\`，
   以及 MUST / SHOULD / OPTIONAL / IGNORE 四节与末尾对应的四个计数（与正文条目数一致）。
   没写完整就不要创建这个回复文件——半份回复比没有回复更糟。
5. 不要修改 ${box}/in/、queue.md、projects.json 里的任何内容，不要删除或移动文件。

写完这一条就结束本轮。剩下的请求留给下一次唤醒。`;
}

export function writeKimiPrompt(target, text) {
  const file = path.resolve(String(target || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${text}\n`, 'utf8');
  return file;
}
