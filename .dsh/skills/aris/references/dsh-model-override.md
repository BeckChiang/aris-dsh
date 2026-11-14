# DSH 本机：审查走 Kimi 邮箱，代笔走 model-worker

## 硬规则（用户 2026-11-07 定）

**审查（review / audit / 评审意见 / 拒稿判断）必须用不同家族的模型，一律走 Kimi 邮箱。**
同一族模型自审没有意义：它会认可自己的论证、放过自己的漏洞。

- 送审：`node bin/aris-review.mjs --project <项目> --target <稿.md> --slot <N> --enqueue`
- 收件：`node bin/aris-review.mjs --collect-all --mailbox "<SYNC>\aris-mailbox"`
- 邮箱：`<SYNC>\aris-mailbox`（`in/` 请求、`out/` 回复、`projects.json` 归属表）
- 入账后评审写进 `<项目>/.aris/reviews/<时间>-slotN.md`，原邮件对移到 `trash/<base>/`

**禁止**：用 `bin/model-worker.mjs` 充当审查人、或让执行者「自己再过一遍」来代替审查。

## model-worker 能用在哪

`bin/model-worker.mjs` 是 DeepSeek 直连（同一族模型），只用于**非审查**的粗活：

| 用途 | 命令 |
|---|---|
| 翻译（中↔英，术语保留） | `node bin/model-worker.mjs worker --in ch.md --role translator --out en.md` |
| 长文压缩 / 摘要 | `node bin/model-worker.mjs ask "压到 800 字" --in long.txt --max-tokens 1200` |
| 代码草稿 / 正则 / 脚本 | `node bin/model-worker.mjs worker --in spec.md --role coder --out code.js` |
| 实验步骤拆解 | `node bin/model-worker.mjs worker --in plan.md --role planner` |

角色：`writer`/`coder`/`planner`/`translator`（`reviewer`/`critic` 保留但**不得用于正式审查**）。

密钥：`DEEPSEEK_API_KEY` 环境变量 → `~/.dsh/.credentials.yaml` → `.dsh/model-worker.json`。
`--debug` 只打印来源与长度，不打印密钥。

## 审查节奏

1. 稿子定稿到可读程度 → `--enqueue`（写明 `--slot`、`--tier`、`--round`）
2. Kimi 侧取件、写 `out/` 回复
3. 本机 `--collect-all` 入账，读 `reviews/<时间>-slotN.md` 的 `verdict` 与 blocking 项
4. `verdict=revise` 就改，改完再 `--enqueue` 下一轮；`reject` 要先解决 kill argument 再送

邮箱是异步的：送审后可以继续干别的，**不要假称「已审查」**——只有 `reviews/` 里出现文件才算审过。

## 收件没有自动任务

本机目前**没有**「ARIS Mailbox Collect」计划任务（`schtasks /Query /TN "ARIS Mailbox Collect"` 报找不到）。
所以回复躺在 `out/` 里不会自己进来，必须：

- 手动：`node bin/aris-review.mjs --collect-all --mailbox "<SYNC>\aris-mailbox"`
- 或注册计划任务（命令见 `DSH_PORT.md`「邮箱协议」一节，`schtasks /Create ... /RI 10`）

入账后请求与回复会成对移到 `trash/<base>/`，`queue.md` 的 PENDING 随之归零。
