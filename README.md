# ARIS for DSH — 自主科研流水线 + 监控面板

把 [Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)（下称「上游 ARIS」）的科研流水线移植到 **DeepSeek Harness（DSH）**：文献 → idea → 实验 → 写作 → 对抗审查 → 投稿/答辩，全部由 DSH 的 headless 子进程按「一轮做一件原子事」的节拍推进，并配一个 **Aris_Dsh 监控面板**在侧栏看阶段、门禁、审查与下一步。

本仓库是**自足快照**：技能语料、运行时脚本、监控面板、使用手册都在里面，克隆下来即可读到全部内容，不依赖任何私人目录。

> 仓库内容由维护者本机的同步器从一台运行中的 DSH 工作区**单向**生成，并对副本做了脱敏（见 [隐私与脱敏](#隐私与脱敏)）。本机为源，仓库为发布快照。

---

## 1 这套东西由哪几块组成

| 层 | 是什么 | 在本仓哪里 |
|---|---|---|
| 宿主 | DSH 桌面进程。它同时开着 Web 界面和**节拍器**（每 60 秒 tick 一次，决定要不要起下一轮） | 外部依赖，不在本仓 |
| 面板 | Web 插件 `Aris_Dsh`：启停 / 门禁 / 编译 / 设置 | [`plugins/dsh-aris/`](plugins/dsh-aris) |
| 运行器 | 起一轮「headless DSH 子进程」并回写状态 | [`bin/`](bin)（`aris-run.mjs` + `lib/aris-runner.mjs`） |
| 技能 | 上游 91 个技能目录 + 索引语料，逐字移植并加 DSH 覆盖横幅 | [`.dsh/skills/aris/`](.dsh/skills/aris) |
| 项目状态 | 每条流水线自己的 `pipeline/state.json`（阶段、待办、门禁、产物登记） | 各自项目目录内，不在本仓 |
| 审查通道 | 邮箱协议（人工在环，换模型审稿），或 OpenAI 兼容 HTTP | `bin/aris-review.mjs` |
| 手册 | 面向使用者的完整说明：阶段、门禁、排障 | [`docs/ARIS-流水线与面板手册.md`](docs/ARIS-流水线与面板手册.md) |

一句话：**宿主按节拍起一轮 → 子进程读 state 做一件原子事 → 写 `runs/` → 需要时送审 → 收尾回写 state → 面板只读地把这一切显示出来。**

---

## 2 快速开始

```bash
# 1) 克隆到 DSH 工作区内（路径任意，但必须保留整个仓库，不能只拷面板）
git clone https://github.com/BeckChiang/aris-dsh.git <你>/plugins/aris-dsh

# 2) 装面板
#    在 DSH 里用 plugin_manager install_bundle 指向仓库内的面板目录
#    <你>/plugins/aris-dsh/plugins/dsh-aris

# 3) 初始化一条流水线
node <你>/plugins/aris-dsh/bin/aris.mjs init --id demo --root <你的项目目录>
node <你>/plugins/aris-dsh/bin/aris.mjs status --id demo
```

> **为什么必须整仓保留**：面板入口用相对路径 `../../bin/lib/aris-*.mjs` 加载运行时（[`plugins/dsh-aris/index.js`](plugins/dsh-aris/index.js)）。仓库结构刻意镜像了宿主布局，所以这四行 import 在克隆出来的仓库内部依然成立——代价是**不能只拷 `plugins/dsh-aris/` 一个目录**。

---

## 3 目录结构

```
aris-dsh/
├── .dsh/skills/aris/          # 技能库（91 个技能目录 + references/ 上游语料镜像）
│   ├── SKILL.md               # 主入口技能：什么时候用、怎么编排
│   ├── DSH_PORT.md            # 移植技术说明（上游机制 → DSH 替代，逐条对照）
│   ├── MCP_REPLACEMENTS.md    # 替代矩阵：上游 MCP 工具在本机的替代物
│   ├── tools/                 # 上游 53 个 py/sh 门禁与取数脚本
│   ├── mcp-servers/           # 上游 11 套 stdio server（参考用，本机未启用）
│   ├── aris-monitor/          # 上游 TUI（参考用，已由 bin/aris-status.mjs 取代）
│   └── references/            # 上游文档 / 技能镜像 / agents / commands / templates
├── bin/                       # 运行时（纯 Node，无第三方依赖）
│   ├── aris.mjs               # 状态机 CLI：init/status/set-phase/advance/gate/next/log/check
│   ├── aris-run.mjs           # 起一轮 headless 子进程（--once / --loop）
│   ├── aris-review.mjs        # 审稿：送审、收件、裁决
│   ├── aris-status.mjs        # 单屏监控（--watch / --json），取代上游 TUI
│   ├── lit.mjs                # 文献内核：检索/入库/BibTeX/去重/对账
│   ├── paper-build.mjs        # 论文编译（引擎自动判定，latexmk 优先）
│   ├── model-worker.mjs       # 非审查粗活（翻译/压缩/代码），禁止当审稿人
│   ├── aris-collect-all.cmd   # Windows 计划任务入口（收邮箱）
│   ├── aris-collect-all.pyw   # 同上，无窗口版
│   └── lib/                   # 状态、注册表、成本、事件、邮箱、runner 等内核
├── plugins/dsh-aris/          # 监控面板（服务端 + Web 客户端）
├── docs/                      # 使用手册
└── MANIFEST.json              # 发布快照清单（逐文件 sha256，由同步器生成）
```

---

## 4 如何配置

面板与运行时都**不读死路径**。下面每一项都标了「默认行为 / 什么时候要改 / 改完怎么验证」。

### 4.1 工作区根（`<WORKSPACE>`）

- **默认**：所有脚本按自身位置推导。`bin/` 脚本以 `bin/` 的上级为工作区根；面板在 `<ws>/plugins/dsh-aris/` 时上溯两级即工作区根。
- **什么时候要改**：把仓库克隆到工作区之外、或作为独立目录使用时。
- **怎么改**：设环境变量 `ARIS_WORKSPACE`（脚本侧）、`DSH_WORKSPACE`（面板兜底）。
- **验证**：`node bin/aris.mjs status` 能列出项目而不再报「找不到工作区」。

### 4.2 审查邮箱（`ARIS_MAILBOX`）

- **默认**：`%USERPROFILE%\aris-mailbox`（Windows）。
- **协议**：请求写进 `<MAILBOX>\in\`，人工/另一个模型在 `out\` 回复，再 `--collect-all` 收进项目的 `.aris/reviews/`。
- **怎么改**：设 `ARIS_MAILBOX`（`bin/aris-collect-all.*` 与 `aris-review.mjs --mailbox` 都认这个变量）。
- **验证**：`node bin/aris-review.mjs --collect-all --mailbox "<你的邮箱>"` 返回 0；邮箱下应有 `in/`、`out/` 两个目录。

### 4.3 项目注册表（`.dsh/aris-projects.json`）

- **作用**：面板与 `aris.mjs` 据此知道「有哪些流水线、各自根目录在哪」。
- **默认**：`<WORKSPACE>/.dsh/aris-projects.json`，首次 `init` 时自动创建。
- **内容**：`{ version, projects: [{ id, name, root, driver, addedAt }] }`。
- **注意**：这是**机器本地状态**，不进本仓库（已被 `.gitignore` 白名单挡在外面）；换机时自己重建。

### 4.4 审查后端

流水线的「对抗审查」必须换模型，本仓提供两条通道：

| 通道 | 用法 | 前提 |
|---|---|---|
| 邮箱（推荐） | `aris-review.mjs --enqueue` 送审，`--collect-all` 收件 | 有一个双方都能读写的目录 |
| OpenAI 兼容 HTTP | `aris-review.mjs --endpoint ...` | 有可用的兼容端点（本地 Ollama / 远端 API） |

`bin/model-worker.mjs` 只做翻译、压缩、代码等**非审查**粗活，脚本会拒绝同族模型承担正式评审（需要时加 `--allow-same-family`，仅用于自测）。

### 4.5 面板启用

```text
plugin_manager install_bundle <仓库>/plugins/dsh-aris
```

- 面板服务端与 Web 客户端一起装；装完侧栏出现 `Aris_Dsh` 入口。
- 面板读取工作区根、注册表、邮箱，**只做白名单动作**（启停、门禁确认、登记产物、收件），不直接改 `state.json`。
- 若同时装了只读的知识库面板 [`aris-wiki-panel`](https://github.com/BeckChiang/aris-wiki-panel)，它需要先装本仓（否则没有可索引的技能目录）。

### 4.6 节拍与定时唤醒

DSH 侧用 `schedule_create` 起周期性唤醒（例如每 30 分钟跑一次 `next` + `status`），或直接 `node bin/aris-run.mjs --loop`。邮箱收件可以挂系统计划任务：

```bat
schtasks /Create /SC MINUTE /MO 15 /TN "ARIS Mailbox Collect" ^
  /TR "\"%USERPROFILE%\...\pythonw.exe\" \"<仓库>\bin\aris-collect-all.pyw\""
```

---

## 5 CLI 速查

| 命令 | 用途 |
|---|---|
| `node bin/aris.mjs init --id <id> --root <dir>` | 建/登记一条流水线 |
| `node bin/aris.mjs status [--id <id>] [--json]` | 看阶段、待办、门禁 |
| `node bin/aris.mjs next --id <id>` | 取下一步该做的原子事 |
| `node bin/aris.mjs set-phase <phase>` / `advance` | 推阶段（`advance` 会拦未完成门禁，需 `--force` 才越） |
| `node bin/aris.mjs gate <gateId> --decision <词>` | 记录门禁裁决与证据 |
| `node bin/aris.mjs log <text>` | 追加事件账本 |
| `node bin/aris-run.mjs --id <id> --once` | 起一轮 headless 执行 |
| `node bin/aris-status.mjs --watch` | 单屏监控（29 行） |
| `node bin/aris-review.mjs --enqueue / --collect-all` | 送审 / 收件 |
| `node bin/lit.mjs find "<topic>" --project <dir>` | 文献检索与底稿 |
| `node bin/paper-build.mjs --all` | 编译论文（中英双语） |

阶段共 11 个：`S0_prepare` → `S1_formal` → `S2_data` → `S3_baseline` → `S4a_match` → `S4b_plan` → `S4c_unfold` → `S4d_bridge` → `S5_experiments` → `S6_writing` → `S7_submission`。详见[手册](docs/ARIS-流水线与面板手册.md)。

---

## 6 与移植前的差异（上游 → 可移植包 → 本仓）

本仓不是「上游的裁剪版」，而是「上游技能语料 + 一整套 DSH 自主执行层」。三层血缘：

| 维度 | 上游 ARIS | 可移植包 `aris-dsh-portable` 2.14.3 | 本仓 |
|---|---|---|---|
| 形态 | Claude/Codex 插件 + 11 套 MCP server | DSH 原生技能库 + 独立脚本 | 同左 + 监控面板 + 手册 |
| 文件 | 91 技能目录 / 55 tools / 11 MCP | 767 文件 / 13.7 MB（含 `.gitignore`、安装器） | 本仓约 13.7 MB（排除 tests） |
| 审查 | MCP：codex / claude / grok / antigravity / gemini | 邮箱 + OpenAI 兼容 | 同左 |
| 状态机 | `.aris/` 目录 + `REVIEW_STATE.json` | `bin/aris.mjs` | 同左 |
| 监控 | `aris-monitor`（Python TUI） | `bin/aris-status.mjs` | 同左 + 侧栏面板 |
| 自主运行 | 靠外部 CLI + cron | `bin/aris-run.mjs` 起 headless DSH 子进程 | 同左 |

### 6.1 逐机制替换对照

| 上游机制 | 本仓替代 | 说明 |
|---|---|---|
| `mcp__codex__codex` / `claude-review` / `gemini-review` 审稿 | `bin/aris-review.mjs` | 上游依赖已登录的 codex/claude/grok CLI，DSH 侧改为「邮箱人工在环」或 OpenAI 兼容 HTTP |
| `.aris/` 状态目录、`REVIEW_STATE.json`、门禁 | `bin/aris.mjs` | `gate` 两段式：生成 `.cmd` → 执行 → `--record` 回填 |
| `aris-monitor` TUI | `bin/aris-status.mjs` | `--watch` / `--json`，坏状态降级不崩 |
| Zotero MCP / WebSearch / semantic-scholar | `bin/lit.mjs` | `lit` / `find` / `reconcile` / `fill` / `verify` / `oa` 六个子命令 |
| `CronCreate` / goal-pulse 定时看护 | DSH `schedule_create` | 手动起，见 4.6 |
| slash 命令 `/novelty-check "..."` | 读 `references/skills/novelty-check/SKILL.md` 按步骤执行 | 无斜杠入口 |
| 论文编译（上游交外部 CLI/人） | `bin/paper-build.mjs` | 引擎自动判定，latexmk 优先 |
| 引用核验 `tools/cx_verify.py`（上游悬空） | `tools/cx_verify.py`（只用 stdlib） | 本机 163 条文献 / 76 处引用全 supported |

### 6.2 语料改动规模

- `references/skills/` 下 **88 个文件**带「DSH 本机覆盖」横幅或路径替换（`ARIS_REPO` → `ARIS_HOME` 共 208 处、`~/.codex/skills/` 与 `~/.claude/skills/` → `$ARIS_HOME/references/skills/`、`python3` → `python`）。
- 改写规则**只动路径与解释器，不动正文语义**。
- 有意保留的残留：10 处 `${CODEX_HOME:-~/.codex}/skills/`（Codex 专属写法，DSH 下忽略）与 `python3.10` 之类的版本号。
- 逐文件口径见 `.dsh/skills/aris/DSH_PORT.md` 与仓库根的 `MANIFEST.json`（文件级 sha256 前 16 位）。

### 6.3 未移植的部分

上游 `assets/`（7.9 MB 图）、`community_papers/`（8.2 MB PDF）、`tests/`（985 KB 夹具）**不在本仓**；需要时回上游取。因此上游的技能自检脚本不能在本仓直接跑，本仓也刻意不包含 `tests/`（其中含本机路径夹具）。

---

## 7 隐私与脱敏

本仓是从一台**正在运行**的机器上复制出来的，副本上做了三类处理，源机文件零改动：

1. **路径占位符**：`<WORKSPACE>`（DSH 工作区根）、`<SYNC>`（同步盘根）、`<MAILBOX>`（邮箱），出现在文档与示例命令里，替换成你自己的路径即可。
2. **代码去硬编码**：`bin/lit.mjs` 的工具目录改为从脚本位置推导；邮箱默认值改为 `%USERPROFILE%\aris-mailbox` 并优先读 `ARIS_MAILBOX`；`plugins/aris-wiki/index.js` 的兜底工作区改为「环境变量 → 从插件位置上溯两级」。
3. **不含密钥**：仓库内没有任何 API key、token、私钥、账号口令。审查通道凭据一律走环境变量或外部配置文件。

发布快照由维护者本机的同步器生成（dry-run 出计划 → 复制并脱敏 → 再扫一遍禁止字串才允许提交）。该同步器含本机路径规则，**不入库**，因此仓库内没有 `scripts/` 目录；`MANIFEST.json` 就是那次同步的产物清单。

---

## 8 已知限制

- **不能只拷面板**：`plugins/dsh-aris` 依赖仓库内的 `bin/lib`（相对路径），整仓必须在位。
- **实验类技能在本仓是空壳**：上游 run-experiment / vast-gpu / serverless-modal 等需要 GPU 与云端凭据，本仓只保留技能文本，未做本机适配。
- **技能自检脚本不在仓内**（`tests/` 已排除）。
- **Windows 优先**：`bin/aris-collect-all.*` 与部分 `.cmd` 是 Windows 入口；macOS/Linux 下用 `crontab` + `node bin/aris-review.mjs --collect-all` 替代。
- **面板与运行时版本要配套**：见根 `MANIFEST.json` 的 `generated_at` 与 `rules_version`。

---

## 9 许可

- 本仓的移植层（`bin/`、`plugins/dsh-aris/`、`docs/`、本 README）采用 **MIT**。
- `.dsh/skills/aris/references/` 及其余上游语料来自 [Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep)（commit `f76ec8d`），**同样为 MIT**（Copyright (c) 2026 wanshuiyin），按其条款随附分发并保留署名。
- 若你复用本仓，请同时保留上述两处许可声明。

---

## 相关仓库

- [aris-wiki-panel](https://github.com/BeckChiang/aris-wiki-panel)：只读知识库面板（上游文档 / 替代矩阵 / 项目文献 / 笔记 / 检索日志的一屏检索）。
