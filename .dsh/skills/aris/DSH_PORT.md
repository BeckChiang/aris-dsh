# ARIS → DSH 移植说明

上游：<https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep>，`main` 分支 tarball
（commit `f76ec8d`，2026-11-04 取，25.9 MB 压缩 / 40 MB 解包）。上游另有官方 DSH 发行分支
`dsh-aris`（npm `dsh-aris@0.1.1`，82 个技能 + Codex 审查桥 + 客户端「ARIS」标签页）。

**为什么没用官方 bundle**：它把 82 个技能全部塞进原生技能目录（本会话选择的是单入口 + 子库，
每回合技能目录只加 1 条），且强依赖已登录的 Codex CLI 当审稿人 —— 本机没有 `codex`
（`command -v codex` 为空），装上也只剩半条命。本移植走「技能语料逐字 + 审查桥自建」路线。

## 目录映射

| 上游 | 本移植 | 说明 |
|------|--------|------|
| `skills/` | `references/skills/` | 366 文件 / 197 个 SKILL.md，逐字 |
| `skills/shared-references/` | `references/skills/shared-references/` | 契约文本，相对链接保持可用 |
| `docs/*.md` | `references/docs/` | 119 个文本文件（图片未带） |
| 根 `*.md`（README/AGENT_GUIDE/SETUP_GUIDE/CONTRIBUTING 等） | `references/upstream/` | 9 个文本文件，仓库根层文档 |
| `tools/` | `tools/` | 53 个 py/sh，门禁与取数脚本原样 |
| `mcp-servers/` | `mcp-servers/` | 27 个文件，11 个 stdio server 原样 |
| `aris-monitor/` | `aris-monitor/` | 上游 TUI（python），原样保留供参考 |
| `agents/`、`commands/`、`templates/` | `references/{agents,commands,templates}/` | 原样 |
| `assets/`（7.9 MB 图）、`community_papers/`（8.2 MB PDF）、`tests/`（985 KB 夹具） | **未移植** | 二进制与测试夹具，需要时回上游取 |

改写规则（只动路径与解释器，不动正文语义）：`ARIS_REPO` → `ARIS_HOME`（208 处）、
`~/.codex/skills/`·`~/.claude/skills/` → `$ARIS_HOME/references/skills/`、`python3` → `python`。
残留：10 处 `${CODEX_HOME:-~/.codex}/skills/` 写法（Codex 专属，DSH 里忽略即可）、
`python3.10` 之类版本号（有意保留）。

## 运行时替换

| 上游机制 | DSH 版本 | 状态 |
|----------|----------|------|
| `mcp__codex__codex` / `claude-review` / `gemini-review` 审稿 | `bin/aris-review.mjs` → OpenAI 兼容 HTTP（默认本机 Ollama qwen3:8b） | 已实现；真实审查一次 61s，verdict=revise 5/10 |
| `.aris/` 状态目录、`REVIEW_STATE.json`、门禁 | `bin/aris.mjs`（init/status/set-phase/advance/gate/next/log/check） | 已实现；gate 为两段式（生成 `.cmd` → ops_bash 执行 → `--record` 回填），因沙箱禁止脚本起子进程；`advance` 2026-11-07 起会拦 pending（已发命令未记录）与 fail 的门禁，确需越过加 `--force`（事件账本记 `forced`），退出码 3 |
| `aris-monitor` TUI | `bin/aris-status.mjs`（`--watch` / `--json`） | 已实现；单屏 29 行，坏状态降级 |
| 文献取数（Zotero MCP / WebSearch / semantic-scholar） | `bin/lit.mjs` 的 `lit` / `find` / `reconcile` / `fill` / `verify` / `oa`；四个文献技能顶部已加覆盖横幅 | 已实现；契约见 `references/dsh-lit-override.md` |
| `CronCreate` / `goal-pulse` 定时看护 | DSH `schedule_create`（30 分钟唤醒 → 跑 `next`+`status`） | 手动 |
| slash 命令 `/novelty-check "..."` | 读 `references/skills/novelty-check/SKILL.md` 按步骤执行 | 手动 |
| 论文编译（上游交给外部 CLI / 人） | `bin/paper-build.mjs`（引擎自动判定、latexmk 优先、`--all` 双语） | 已实现；CN 稿 xelatex 23 页可编，EN 稿仍含中文占位编不过（内容缺口，不是工具缺口） |
| 引用核验 `tools/cx_verify.py`（上游悬空） | `.dsh/skills/aris/tools/cx_verify.py`（只用 stdlib） | 已实现；second 163 条文献 / 76 处引用全 supported |
| 产物浏览 / 知识库阅读 | `dsh-aris` 面板「产物」tab + `@local/aris-wiki` 侧栏 | 已实现（阶段 1） |

`mcp-servers/` 里能直接复用的是纯协议层（`codex-exec`、`claude-review`、`gemini-review`、
`grok-exec`、`antigravity-exec`、`llm-chat`、`minimax-chat`、`model-worker`），但它们全都
需要一个已登录的外部 CLI；本机都没有。要么装 Codex CLI 后注册 `codex-exec`，要么走
`bin/aris-review.mjs`。`feishu-bridge` 需要飞书应用凭据，默认不启用。

## 已知缺口

- 审查者独立性：本机只有 Ollama 时属「同机异模型」，按 `same-host` 记录，不能声称独立。
- 上游技能里的 Unix 假设（`bash`、`/tmp`、`sed -i`、`chmod`）在 Windows 上需逐条确认；
  `tools/*.sh`（verify_paper_audits.sh 等）未在 Windows 上验证。
- `.aris/tools` 的解析链（`integration-contract.md §2`）依赖 `.aris/repo`；`bin/aris.mjs init`
  必须同时写 `$ARIS_HOME` 与 `.aris/repo`，否则技能里的 helper 解析会退化成内联 Python。

## 上下文预算

技能正文是主要成本，不是流水线状态。197 个 `SKILL.md` 的字节分布：p50 13 KB、p90 31 KB、最大 74 KB
（`auto-review-loop`），按中文 1 KB ≈ 400–500 token 估，单次全读约 5K–35K token。重活有五个：
`auto-review-loop`(74K)、`proof-checker`(56K)、`paper-writing`(52K)、`research-lit`(44K)、
`auto-paper-improvement-loop`(42K)。

进度本身不进上下文：阶段、门禁、审查、事件都在项目 `.aris/` 下，`aris-status.mjs --json` 只回一小段。
`aris-review.mjs` 把草稿整篇发给审稿模型，主会话只拿 verdict/summary。

控制手法（按收益排序）：① 大技能交给 subagent 执行，只回收结论；② 只读 `SKILL.md` 里当前要用的段，
不整文件读；③ 门禁输出用 `--record` 摘要（末尾 12 行），不整段贴；④ 阶段边界（W2→W3、W4→W5）换会话，
按 `AGENTS.md` 的交接判据走；⑤ `schedule_create` 唤醒时只跑「读 `status --json` + 一步 + 写回」，
别把整条流水线挂在同一会话里。

## 状态目录分离（项目放同步盘 / Kimi 工作区时）

项目根（草稿、数据、产物）可以整个放在 `<SYNC>\aris\<任务>\`，
让 Kimi 直接读；但 `.aris`（state/reviews/events/gates）若也放那里，**自动收件每轮都要写工作区外，
会卡审批**，无人值守必然失败。因此支持把状态根挪走：

```bash
PROJ="<SYNC>/aris/<任务>"
STATE="<WORKSPACE>/work/<任务>/.aris"

node bin/aris.mjs init --project "$PROJ" --state-dir "$STATE"
node bin/aris-review.mjs --project "$PROJ" --state-dir "$STATE" --collect --mailbox "$MB"
ARIS_STATE_DIR="$STATE" node bin/aris-status.mjs --project "$PROJ"
```

优先级：`--state-dir` > 环境变量 `ARIS_STATE_DIR` > `<project>/.aris`。相对路径按项目解析，
建议直接给绝对路径。`--include` 的可读性判定仍按邮箱上一级目录（`.../kimi/**`）算。

## 外部审查 MCP 的替代（2026-11-07 审计结论）

`bin/aris-audit.mjs` 扫 87 个技能：**52 个在 frontmatter 里声明了本机不存在的 MCP 服务**，集中在
`codex`(48)、`antigravity`(36)、`grok`(36)、`claude-review`(36)、`manual_review`(6)、`model-worker`(3)，
另有 `zotero`/`obsidian-vault`(各 2)、`gemini-cli`/`codex-image2`/`llm_chat`(各 1)。

这些声明是**上游 Claude Code 的调用约定**，DSH 不装对应 MCP，所以：

| 技能里的写法 | 本机替代 | 影响 |
|---|---|---|
| `mcp__codex__*` / `mcp__grok__*` / `mcp__antigravity__*` / `mcp__claude-review__*` | `bin/aris-review.mjs --enqueue` 走 Kimi 邮箱，或 `subagent` 另起审稿人 | 审查/多模型交叉验证步骤**降级为可替代路径**，不是死路 |
| `mcp__zotero__*` / `mcp__obsidian-vault__*` | `bin/lit.mjs lit/zot/bib`（见 `dsh-lit-override.md`） | 文献检索已完全替代 |
| `mcp__model-worker__*` | `node bin/model-worker.mjs worker --in <稿> --role translator\|coder\|planner`（**仅非审查**，见 `dsh-model-override.md`） | 粗活可替代；**审查禁用**（同族自审无效），审查一律走 Kimi 邮箱 |
| `mcp__codex-image2__*` / `gemini-cli` / `llm_chat` | 无 | 出图/多模型聊天类技能本机不可用，标 N/A |
| `mcp__manual_review__*` | 人工 | 需要自己看 |

判定口径：**技能不会因为缺 MCP 而报错**（DSH 不校验 allowed-tools），缺工具时模型会自己找替代，
最常见的失败形态是「静默降级成凭记忆写」。凡涉及引用/事实，一律按 `dsh-lit-override.md` 先取数。

**2026-11-07 已落地的显式降级**：`SKILL.md` frontmatter 声明了 `mcp__` 的一共 81 个（primary 52、
skills-codex 27、skills-codex-gemini-review 2），其中 73 个已插入三行横幅「回退路径 + 不许静默降级」，
8 个原本就有横幅按幂等跳过。替代矩阵、清点口径、已知未覆盖面（`skills-codex-claude-review/` 8 个文件
frontmatter 无 `allowed-tools`；23 个文件只在正文提 `mcp__`）都写在 `.dsh/skills/aris/MCP_REPLACEMENTS.md`。
横幅判据：**宁可 `BLOCKED:` 停下，也不许凭记忆写下去**。

## 论文产物、编译与引用核验（2026-11-07 新增）

三件配套工具，解决「写完了看不见、编不动、引用对不上」：

**① 编译 `bin/paper-build.mjs`**（stdlib，Windows 友好）

```bash
node bin/paper-build.mjs --project <项目> --all --out build --json   # 双语逐目录
node bin/paper-build.mjs --project <项目> --dir paper2/cn --json      # 单目录，PDF 落源码目录
```

- 引擎自动判定：preamble 命中 `ctex`/`xeCJK`/`fontspec` → xelatex，否则 pdflatex；`latexmk` 优先，没有才直连跑两遍。
- 退出码 0 成功 / 1 编译失败 / 2 环境或参数问题；`--json` 回 `{ok,items:[{dir,ok,engine,pages,pdf,errors,warnings}]}`。
- **踩过的坑**：隔离输出用 `-outdir` 会把 bibtex 的 cwd 挪进输出目录，`\bibliography{../../intro/refs}` 解不开（BIBINPUTS 救不了），
  必须同时 `-auxdir=.`，bibtex 才留在源码目录。代价是 aux 落源码目录，脚本读完日志默认清掉，`--keep-aux` 可留。

**② 产物面板**：`dsh-aris` 插件侧栏 → 面板「产物」tab。**顶部一条「主论文」常驻**——`lib/artifacts.mjs` 的 `findMainPaper()`
按 `paper2/{en,cn}/build/main.pdf` → 未隔离 `main.pdf` 找成品、取 mtime 最新的一份（标「英文稿/中文稿」，带体积与生成时间），
随扫描结果以 `main` 字段下发；三个按钮「打开 PDF」「看源码」「编译论文」，编译成功后自动重扫并打开新 PDF。
往下只读扫描六组（paper/figures/experiments/reviews/runs/slides），
带章节字数与图引用体检（未被引用的图、缺失的图、空章），右侧预览 md/tex/json 文本、图片、PDF（iframe），
「编译论文」按钮走 `paper.build` 动作 → `paper-build.mjs --all --out build`。上限：单组 400 文件、总量 1500、正文 2MB、二进制 4MB、深度 4 层，路径穿越直接 404。

**⑤ 这一轮的会话（2026-11-12 新增）**：每张流水线卡片的操作行有「会话」按钮，只读展开该轮 headless 会话的
用户消息 / 助手文本 / 工具调用 / 工具结果（失败项标红）。实现：`lib/session-view.mjs` 的 `readSession()`
——按 `--<cwd 转义>--` 定位 `~/.dsh/sessions/<桶>/session-<uuid>/session.v4.jsonl.zstd`，按 zstd 帧魔数
`28 b5 2f fd` 切段逐帧解（坏帧计数跳过，不写任何文件），路由 `GET /api/dsh-aris/session?name=<流水线>&id=<会话>`，
上限 24MB 文件、默认返回最后 160 条（`limit` 夹 10–600，单条文本 1200 字）。会话 id 走 UUID 形状校验，非法即 404。
这条路径**不依赖 GUI 的会话登记**——侧栏只显示 `workspaces.json` 里 `sessionIds` 已登记的会话，
headless 自己跑的轮次可能只存在于磁盘，用「会话」按钮同样能看。

**⑥ 运行中的轮次也会出现在工作区（2026-11-12 新增，方案 B）**：`sessionIds()` 只认收尾才写的
`runs/<runId>/meta.json`，所以原先「跑完才出现」。现在 `bin/lib/aris-control.mjs` 增加
`liveSessionId(root)`（`status==='running'` 时从本轮 `runs/<runId>/events.ndjson` 头部取 `"sessionId"`；注意 `saveRuntime` 只在收尾写 `runtime.sessionId`，运行中那个字段还是上一轮的 id，不能直接用），`attachSessions` 每 60 秒一拍
把它也 `attachSession` 进工作区；同时 `nameSessions` 会跳过它——headless 进程持有该会话的写句柄，
往里追加 `session/title` 会与对方的帧交错，等收尾后由下一拍正常命名。**是否插手这一轮由人决定**。

  面板上的配套提示：运行中的卡片「会话」按钮显示「会话 · 运行中」，旁边有标签「运行中 · headless 持有」；桌面端打开该会话仍会显示「任务已停止」，那是孤儿轮次误报（会话由一个独立 headless 进程持有），不要在桌面端这条会话里发消息（会与对方争写同一个 zstd 日志），要插手先在面板停流水线或等收尾。

  **会话标题格式**（2026-11-12 起）：`<MM-DD HH:mm> · Dsh_Aris · <流水线>`，日期时间在前便于侧栏按时间检索；旧格式 `Dsh_Aris · second · 11-12 15:06` 由 `nameSessions` 每拍最多迁 12 条自动改写（`TITLE_RE` 判定新格式）。

> 坑（2026-11-12 实战）：插件里的 `lib()` 是**白名单导出**（`plugins/dsh-aris/index.js` 顶部把
> `controlMod` 的个别函数逐个映射出来）。在 `bin/lib/aris-control.mjs` 里新增导出后，必须同步加进
> 这份白名单，否则 `undefined is not a function` 会在 `syncSessions` 里抛出、把整个 `beat()` 打断——
> **流水线会静默停摆**（下一轮不再自动起，面板仍显示「已启用」）。现已把 `syncSessions` 包进 try
> 并加 `typeof ... === 'function'` 守卫，任一路径出错都不再挡住 `tick`。

**③ 知识库**：`@local/aris-wiki` 插件（独立侧栏 `Aris_Wiki`），只读索引 `references/docs/**`、
`MCP_REPLACEMENTS.md`、项目的 `literature/`、`notes/`、`search_logs/`，路由 `/api/aris-wiki/index` 与 `/doc`；
列表按**流水线分组**（`shared` = 上游共享文档，`project:<id>` = 各项目文献/笔记/检索日志），二级按文件类型筛选。

**④ 引用核验**：`.dsh/skills/aris/tools/cx_verify.py`（补上游悬空的 `tools/cx_verify.py`）

```bash
python .dsh/skills/aris/tools/cx_verify.py --project <项目> --json
```

只验「引文能否对上真实文献」：`supported`（对上且带 DOI/arXiv）/`weak`（对上但无持久标识）/
`unsupported`（对不上）/`orphan`（库里有、正文没引）。退出码 0 全通过、2 有 unsupported、3 无文献库。
**它不判「论断是否被该文献支持」**——那一步仍需人工或审稿模型。

## 审查者扩展（第二个 API）
`bin/aris-review.mjs` 的配置优先级是 命令行 > `<项目>/.aris/reviewer.json` > 内置默认，字段：
`backend`、`base_url`、`model`、`api_key_env`、`timeout`、`max_chars`、`slot`、`tier`、`requester_family`。

`requester_family`（或 `--requester-family`）声明执行者模型家族，写进 system prompt 的【执行者】
一段，让审查者自己判断是否属于跨家族；默认 `DeepSeek（由 DSH 承载）`。换执行模型时应改这里，
否则跨家族判断失真。
换后端不用改代码：

```bash
# 本机 Ollama
node bin/aris-review.mjs --project proj --target draft.md --slot 1
# 云端 OpenAI 兼容（key 从环境变量读）
OPENAI_API_KEY=sk-... node bin/aris-review.mjs --project proj --target draft.md   --slot 2 --backend openai-compatible --base-url https://api.deepseek.com/v1 --model deepseek-chat
```

`.aris/reviewer.json` 支持两种写法：

- **单后端扁平**（旧）：`{ "backend": ..., "model": ..., "slot": 1 }`，等价于只有一个审查者。
- **多槽位数组**（2026-11-07 起）：`{ "reviewers": [ {"slot":1,"via":"kimi-mailbox","tier":"T2","label":"Kimi"}, {"slot":2,"backend":"openai-compatible","base_url":"...","model":"deepseek-chat","api_key_env":"OPENAI_API_KEY"} ] }`。
  用 `--slot <n>`（或 `--reviewer <id>`）选一个，`--slots` 列出全部槽位并标出当前选中；
  命令行显式给了 `backend`/`base-url`/`model` 时按「命令行优先」覆盖该条目的同名字段。

`via: "kimi-mailbox"` 表示该槽位不直连 HTTP，只写邮箱请求（`--enqueue` 默认生效），
这样同一份配置既能放本机 Ollama 槽位、也能放跨机 Kimi 槽位。文件带 BOM 也能读（`stripBom`）。

已知限制：一次调用仍只服务一个槽位；要「一条命令扇出 N 个审稿人并汇总」需要外层脚本并发调
`--slot 1..N --dry-run/--enqueue`，这一步尚未自动化。

### 本机现状（2026-11-12）：唯一程序化通道 = Kimi 桌面 3.1 Pro（邮箱）

本机没有 Moonshot/Kimi API key（`~/.dsh/.credentials.yaml` 只有 DEEPSEEK_API_KEY / QQBOT），
没有 Claude Code CLI，Ollama 服务也未常驻；因此可用的审稿通道只剩 Kimi 桌面客户端订阅。
`second` 已按此写 `.aris/reviewer.json`：

```json
{"version":1,"reviewers":[{"slot":1,"id":"kimi-3.1-pro","via":"kimi-mailbox",
  "label":"Kimi 3.1 Pro（桌面订阅 · 邮箱）","tier":"T2","timeoutSec":600,
  "model_hint":"kimi-3.1-pro"}]}
```

- 模型在 Kimi 应用里选 `kimi-3.1-pro`，配置只声明通道；`--slots`/`--dry-run` 的 model 显示
  「（由取件的 Kimi 客户端选择）」，不再误显示 Ollama 的 qwen3:8b，base_url 显示「(邮箱模式，不走 HTTP)」。
- `model_hint` 会写进请求文件：「约定的审稿模型: kimi-3.1-pro / 请先把客户端切到该模型再作答」。
- 身份靠回复首行 `Reviewer-Model:` 自报，收件时记为 `reviewer-declared:<模型>`；缺这行按「身份未验证」处理。
- 其它项目没有 `reviewer.json` 时仍落回内置默认（ollama qwen3:8b，本机未常驻），要跑就照抄这份文件。

## 计划与产物只读视图（Aris_Wiki，2026-11-12 新增）

`@local/aris-wiki` 从「只读文档库」扩成三页签看板：**计划 / 产物 / 文档**，全部只读。
写操作（启停、门禁、收件、编译、设置、日志、会话）仍留在 `@local/dsh-aris`（Aris_Dsh）。

数据来源（都不新增存储，全部读别的工具已经写下的文件）：

| 视图 | 读什么 | 落到界面上的东西 |
| --- | --- | --- |
| 计划·总览 | `.dsh/aris-projects.json` + 每条的 `runtime.json` / `costs.jsonl` | 在跑/今日/累计/需人工四个 KPI + 每条流水线一张卡（11 段阶段 rail、上下文与步数条、轮数/¥/门禁/下轮） |
| 计划·单条 | `pipeline/state.json`（或 `.aris/state.json`）+ `pipeline/PIPELINE.md` + `pipeline/budget.json` + `.aris/reviews/*.json` + `runs/*/meta.json` | 四张门禁卡（criteria / decision / observed）、阶段 rail、当前阶段「已完成 / 待做」两栏、阻碍清单、最近 8 轮表 |
| 产物 | 扫描 `paper2/{en,cn}`、`paper2/figures`、`dataset_gen/out`、`pipeline/out`、`runs`、`.aris/reviews`、`.aris-run/runs`、`ppt` | 主论文卡（mtime 最新的 `build/main.pdf`）+ 六组文件列表 + 文本/图片/PDF 预览 |
| 文档 | 本机 ARIS 文档（原有） | 不变 |

路由（都要求 `x-dsh-aris-wiki: 1`，只接受 GET）：

- `/api/aris-wiki/plan?name=all` → `{ ok, summary, pipelines[], errors }`（卡墙数据）
- `/api/aris-wiki/plan?name=<流水线>` → `{ ok, now, totals, budget, plan{stages,gates}, blockers, history, sparkline }`
- `/api/aris-wiki/artifacts?name=<流水线>` → 与 dsh-aris 同形的扫描结果（含 `main`）
- `/api/aris-wiki/file?name=<流水线>&rel=<相对路径>` → 文本 / 图片 data URL / PDF data URL；路径越界 404

实现要点：

- `plugins/aris-wiki/lib/plan.mjs`：多流水线适配器。`pipelines()` 取注册表 `Object.values(projects)`；
  `planOf()` 拼单条详情；`allOf()` 拼卡墙。阻碍由 8 条规则合成（state.block / runtime.waiting /
  gateReason / lastError 或连续错误 / 待回复审查 / 门禁 pending / 上下文占比 / 从未跑过），
  排序 error < warn < info，`human=true` 的才画「需人工」红条。
- `plugins/aris-wiki/lib/artifacts.mjs`：**从 dsh-aris 复制**，不是跨插件相对导入——删掉 dsh-aris
  也不能让 Wiki 崩。文件数上限（单组 400 / 总 1500 / 正文 2MB / 二进制 4MB / 深度 4）与 dsh-aris 一致。
- 阶段标题与进入/退出条件来自解析 `PIPELINE.md` 的 `### <阶段>（标题）`；文件缺失只是没有标题，不报错。
- `state.json` 的 `states.<id>.done/todo` 是长段中文成果描述，界面只显示首句（≤90 字），
  完整文本留在 JSON 里（`doneItems[].full`），需要展开时由前端再取。
- 编译论文**不在** Wiki：它要写 `paper2/*/build/`，属写操作，按钮留在 Aris_Dsh 产物页；
  Wiki 的主论文卡只显示「文件名 · 体积 · 生成时间」并直接打开 PDF。

### 会话可见性（2026-11-12 修）

- 桌面端侧栏要同时满足两件事才画一条会话：`workspace.sessionIds` 里有它，且会话列表投影里已有 summary。headless 轮次由另一个宿主进程写盘，不会向已打开的页面推送任何事件，所以过去必须整页刷新。
- 插件现在做两件事：① 每拍 `syncSessions` 把 `.aris-run/runs/*/meta.json` 里的 sessionId、运行中的 `liveSessionId`、以及 `.dsh/sessions/<bucket>/` 下尚未挂载的会话（每拍最多 20 条）逐个 `attachSession` 进工作区；② 挂载/命名成功后用 `ctx.emit('api-session/added', { sessionId, updatedAt, agentAvailable:false, running:false, blank:false, cwd, projections:{ kind:'cached', values:{ title } } })` 主动广播，页面对应会话立即出现在侧栏，无需刷新。
- 会话桶路径是 `~/.dsh/sessions/<cwd 转义>/`，注意中间那层 `sessions`（漏了会 `ENOENT` 而静默什么都不做，2026-11-12 踩过）。
- 只给确认是自己跑的会话改名：非 meta 登记的会话，要求日志前 20 条事件里出现 `Dsh_Aris` 字样才动标题，避免把用户手动开的会话改名。

## 邮箱协议（外部审稿人 / Kimi Work 定时任务）

> **2026-11-18 起，本机审稿默认走 GPT（Codex 桌面端），不要用 `--enqueue`。**
> 项目 `.aris/reviewer.json` 的 slot 1 已改为 `via: codex`，直接：
> `node bin/aris-review.mjs --project <项目> --slot 1 --target <稿>`
> 加 `--task <分类>` 可选任务分类（`format_check`/`routine_review`/`deep_attack`/`claim_audit`/`citation_audit`/`layout_check`/`writing_review`，默认 `routine_review`）。
> 面板「审核 → 审核线路」现为 `gpt`，`--enqueue` 会被拦并提示改用上面的命令。邮箱协议仍保留（Kimi 侧），需要时把线路改回 `auto` 或 `kimi`。

用途：让本机能做的审查交给「另一个正在运行的桌面 agent」做——DSH 只读写文件，不碰网络、不起进程。
实现：`bin/aris-review.mjs --enqueue` / `--collect`，目录默认 `<项目>/.aris/mailbox`。

**跨机共享邮箱（已授权，推荐）**：`<SYNC>\aris-mailbox`
（用户 2026-11-05 授权；该目录已在 Kimi Work 的工作区白名单里，无需再加授权）。

```bash
MB="<SYNC>/aris-mailbox"
node bin/aris-review.mjs --project <项目> --target docs/DRAFT.md --slot 1 --enqueue --mailbox "$MB"
node bin/aris-review.mjs --project <项目> --collect --mailbox "$MB"
```

**让 Kimi 直接读文件（省 prompt、免截断）**：加 `--include <路径>`（可重复）会把该文件的
**绝对路径与大小**写进请求正文的「可直接读取的参考文件」一节，取件人（Kimi）若在工作区内
就能自己打开核对。只列路径不嵌正文，所以被审文件仍是唯一证据，参考文件只用于核对口径/数据。

```bash
node bin/aris-review.mjs --project <项目> --target docs/DRAFT.md --enqueue --mailbox "$MB" \
  --include results/eval.json --include docs/RELATED.md --include figures/fig1.png
```

可读性判定按「邮箱上一级目录」推断：邮箱在 `.../kimi/aris-mailbox`，则 `.../kimi/**` 下的
文件标为可直接读，其余标为「不可直接读取（仅供参考）」。不存在的路径会警告并跳过。

同步盘代价：`--enqueue` 要写外部目录，需 `danger-full-access`（弹审批，预期摩擦）；
`--collect` 只读外部目录，收件记录写回 `<项目>/.aris/mailbox-processed.json`，**不需要提权**。
只放合规文本产物（md/json），禁止密钥、安装包、大文件——见 `AGENTS.md`「流水线授权目录」。

```
.aris/mailbox/ 或同步盘 aris-mailbox/
  README.md                    取件人协议说明（首次 enqueue 自动写）
  in/<stamp>-slot<N>.request.md  DSH 写：元信息注释块 + 逐字 SYSTEM/USER PROMPT
  out/<同名>.reply.md           取件人写：模型回复原文，第一行 Reviewer-Model
  processed.json                邮箱在项目内时放这里；邮箱在项目外时记到 <项目>/.aris/mailbox-processed.json
```

- 请求文件里 `<!-- aris-request {...} -->` 是机器读的元信息（slot/tier/round/target），
  正文给人和定时任务读；prompt 正文用 `===== SYSTEM/USER PROMPT BEGIN/END =====` 包裹，
  不用代码围栏，避免 prompt 里的围栏打架。
- `--collect` 只认 `*.reply.md`；空文件跳过、不记 verdict；无 `Reviewer-Model` 记 `unverified`。
- `--queue` 只重算 `queue.md` 索引（不投递、不收集），邮箱目录重建或手工改过 in/out 后用它对齐。
  产物与直连模式同形（`.aris/reviews/<ts>-slot<N>.{md,json}`），`backend` 记为 `mailbox`、`source: mailbox`。
- 已验证：投递 → 手写回复 → 收件（verdict=revise 6/10）→ `state.artifacts.reviews` 追加 → 再跑一次「没有新回复」；
  空回复跳过且无有效入账时退出码 2。

**Kimi Work 侧的硬约束（实测自 app.asar 与本地配置）**：

1. Kimi 桌面版**没有 CLI、没有本地 LLM 端口**；能用的协作面只有「定时任务 + 工作区文件夹」。
2. 「Kimi 关闭期间，已开启的定时任务不会运行」——机器休眠/退出 Kimi 就断流，只能靠它常驻。
3. 文件访问按「工作区文件夹」授权，白名单在 `~/AppData/Roaming/kimi-desktop/kimi-agent/user-picked-workspace-folders.json`。
   邮箱目录必须先在 Kimi UI 里添加为该工作区（或把它建在已授权目录下），否则定时任务读不到 `in/`。
4. `~/.kimi-webbridge`（127.0.0.1:10086）是浏览器扩展桥，`/status` 里 `extension_connected:false`，
   不是 LLM 通道，不要指望用它自动驱动 Kimi。
5. 定时任务是 UI 配置（`automationId`），没有可用的程序化创建接口——建一次、之后自动运行。

**Kimi 定时任务提示词（2026-11-05 v3，一轮一条，直接粘贴）**：

```
读 <SYNC>\aris-mailbox\queue.md：
PENDING: 0 就回「无新请求」并结束。
否则只看「## 待处理」里最早的一条，按该文件 BEGIN/END 两段 prompt 逐字执行一次独立审查，
只用该文件内的证据，不引用记忆中任何项目的内容；
回复原文写入 out/ 下的同名 .reply.md（首行 Reviewer-Model: <模型含版本>，含 VERDICT 与 Score: N/10），
写完即结束本轮，其余请求留到下次唤醒。
不改 in/、queue.md、projects.json，不删文件，不加前言。
```

**Kimi 定时任务提示词（2026-11-05 v3 结构版，配 queue.md）**：协议细节在邮箱 README，任务提示词只留
「先看 queue.md → 只处理最早一条 → 原文回写」。格式只有一处出处（`MAILBOX_README`），改格式改那里：

```
处理 ARIS 审稿邮箱取件。工作目录：<SYNC>\aris-mailbox

1. 先读 queue.md：
   - 没有这个文件就改读 README.md 了解协议（只读一次）。
   - `PENDING: 0` → 回一句「无新请求」并结束，不要做其他事。
2. 只处理 queue.md「## 待处理」里**最早的一条** *.request.md，不要遍历整个 in/，
   也不要在同一轮里接着处理下一条。
3. 对这条请求：把 `===== SYSTEM PROMPT BEGIN/END =====` 之间当系统指令，
   `===== USER PROMPT BEGIN/END =====` 之间当用户内容，逐字执行一次独立审查；
   只用请求文件内的证据，不引用你对任何项目的记忆；
   若正文有「## 可直接读取的参考文件」，可打开那些路径核对（它们不是证据本身）。
4. 把模型回复原文整段写入 out/ 下的同名 .reply.md（.request 换 .reply），
   不加前言、不改写、不总结；第一行必须是 Reviewer-Model: <模型标识>。
5. 不改 in/、不改 queue.md、不删文件、不在该目录放其他文件。

没有待处理请求就回一句「无新请求」。
```

**DSH 侧定时收件（Windows 计划任务，2026-11-05 起）**：计划任务「ARIS Mailbox Collect」每 10 分钟
跑一次 `bin/aris-collect-all.pyw`，日志在 `.dsh/logs/aris-collect.log`。

- 任务动作是 `pythonw.exe bin\aris-collect-all.pyw`，**全程无窗口**：pythonw 是 GUI 子系统，
  子进程 node 用 `CREATE_NO_WINDOW` 起，所以不会闪黑框（普通 `.cmd` 作任务动作会每 10 分钟弹一次）。
- `bin/aris-collect-all.cmd` 保留为**手动入口**（想当场看输出时跑它）。
- 任务里的 pythonw 路径带 Python 版本号（`...\Python314\pythonw.exe`），升级 Python 后要改：
  `schtasks /Change /TN "ARIS Mailbox Collect" /TR "\"<新 pythonw>\" \"<WORKSPACE>\bin\aris-collect-all.pyw\""`。

- 为什么不挂在 DSH 会话里：`schedule_create` 的任务绑定创建它的会话，触发时唤醒那个会话，
  新会话看不到、原会话删了就失效，而且每次唤醒都要重付上下文。
- 计划任务用 `schtasks` 建（改频率：`schtasks /Change /TN "ARIS Mailbox Collect" /RI 10`；
  删：`schtasks /Delete /TN "ARIS Mailbox Collect" /F`）；只在本用户登录时运行。
- 邮箱路径：默认共享邮箱；换路径用环境变量 `ARIS_MAILBOX`（不要改脚本里的路径）。
- 一次收多个项目用 `--collect-all --mailbox <邮箱>`：按 `<mailbox>/projects.json` 把回复分组，
  各自写回自己项目的 `.aris/reviews/`；找不到归属的回复列出来并返回 2，用
  `--project <项目> --collect` 手工认领。

闭环：DSH `--enqueue` → Kimi 定时任务取件审查写 `out/` → 计划任务每 10 分钟 `--collect-all`。

### 归档（trash/）

`--collect` 入账成功后，把该对的 `out/<base>.reply.md` 与 `in/<base>.request.md` 成对移到
`<mailbox>/trash/<base>/`（重名时加 `-<时间戳>` 后缀）；已经入账但还留在邮箱里的旧文件，
下次 `--collect` 会顺带归档（日志 `顺带归档 N 个已入账的旧文件`）。

- 不自动删除：`trash/` 只在显式 `--purge-trash [天数]` 时清理，默认 30 天，按目录 mtime 判断。
  这是全流程唯一不经 `bin/recycle.mjs` 的删除，因为邮箱可能在同步盘、回收站 API 不适用；
  只删本脚本自己写出的请求/回复归档。
- 归档后 `queue.md` 的「已有回复」清单自然清空，`PENDING` 只统计真的还没回复的请求。
