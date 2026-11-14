---
name: aris
description: ARIS 自主科研流水线（文献→idea→实验→写作→对抗审查→投稿/答辩）在 DSH 里的移植版，从上游 Auto-claude-code-research-in-sleep 逐字移植 87 个技能+3 族变体。当用户要跑科研工作流、写论文/基金/专利、做文献综述或查新、设计或审计实验、跑同行评审式对抗审查、准备 rebuttal/poster/slides 时使用；触发词如 ARIS、research-pipeline、idea-discovery、novelty-check、auto-review-loop、paper-writing、citation-audit、kill-argument。
---

# ARIS on DSH

上游 <https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep> 的科研 harness：执行者写代码和论文，独立审稿人冷读批判，五层审计链把住投稿。本目录是**逐字移植**（仅做路径与运行时改写），技能正文一字未改，所以**以各 SKILL.md 为准**，本文件只做路由。

## 定位

```
ARIS_HOME = <工作区>/.dsh/skills/aris         # 本文件所在目录
技能正文   = $ARIS_HOME/references/skills/<name>/SKILL.md
技能索引   = $ARIS_HOME/references/INDEX.md   # 87 核心 + 三族变体的名字/描述/路径
上游文档   = $ARIS_HOME/references/upstream/AGENT_GUIDE.md（路由与契约）、SETUP_GUIDE.md
上游工具   = $ARIS_HOME/tools/*.py（门禁/取数/审计，用 `python` 跑）
```

## 主链（先看这张表决定读哪个 SKILL.md）

| ID | 技能 | 输入 → 输出 | 何时用 |
|----|------|-------------|--------|
| W1 | `idea-discovery` | 研究方向 → `IDEA_REPORT.md`/`EXPERIMENT_PLAN.md`/`FINAL_PROPOSAL.md` | 开新课题 |
| W1.5 | `experiment-bridge` | 实验计划 → 可跑代码 + `EXPERIMENT_LOG.md` | 有计划要落地 |
| W2 | `auto-review-loop` | 论文+结果 → 改进稿 + `REVIEW_STATE.json` | 迭代打磨 |
| W3 | `paper-writing` | `NARRATIVE_REPORT.md` → `paper/main.pdf` + LaTeX | 成稿 |
| W4 | `rebuttal` | 论文+审稿意见 → `PASTE_READY.txt` | 收到 reviews |
| W5 | `resubmit-pipeline` | 定稿+新会议 → 转投目录 + `RESUBMIT_REPORT.json` | 改投 |
| W6 | `paper-talk` | 论文 → Beamer/PPTX + 讲稿 + Q&A | 会议报告 |

`research-pipeline` = W1 → W1.5 → W2 → W3 的编排器，用户说「跑一条完整科研流水线」时读它。

## 常用参数（贯穿全链）

- `effort: lite | balanced | max | beast`（默认 balanced）——决定查多少文献、试几个 idea、跑几轮。
- `assurance: draft | polished | conference-ready | submission`——决定五层审计是否拦门；`submission` 时任一非绿就拒绝出报告。
- `difficulty`、`venue`、`sources`、`gpu`、`reviewer`、`human checkpoint`、`AUTO_PROCEED` 见 `references/upstream/AGENT_GUIDE.md §Common Parameters`。

## 五层审计链（投稿前必须走完）

| 层 | 技能 | 问什么 | 产物 |
|:--:|------|--------|------|
| 1 | `experiment-audit` | 评测代码诚实吗（无假 GT、无自归一化、无幽灵结果） | `EXPERIMENT_AUDIT.{md,json}` |
| 2 | `result-to-claim` | 结论真能从结果推出来吗 | Research Wiki 里的 claim 状态 |
| 3 | `paper-claim-audit` | 论文报的数字与产物一致吗（零上下文审稿） | `PAPER_CLAIM_AUDIT.{md,json}` |
| 4 | `citation-audit` | 每条 `\cite{}` 真实、元数据对、引用位置合适吗 | `CITATION_AUDIT.{md,json}` |
| 5 | `kill-argument` | 最强 200 词拒稿理由 + 独立裁判逐条打分 | `KILL_ARGUMENT.{md,json}` |

判定用 6 态：`PASS | WARN | FAIL | BLOCKED | ERROR | NOT_APPLICABLE`（契约见 `references/skills/shared-references/assurance-contract.md`）。**执行者不得自审**：审稿人只拿到文件路径，冷读。

## 在 DSH 里怎么跑

1. **建项目**：`node bin/aris.mjs init --project <项目目录> --effort balanced --assurance draft`
   → 生成 `.aris/state.json`、`.aris/repo`（指向 `$ARIS_HOME`）、`.aris/meta/events.jsonl`。
2. **选技能**：查 `references/INDEX.md` 或上表，读对应 `SKILL.md`，按它的步骤执行。
   产出后把路径登记进状态机：`node bin/aris.mjs set-artifact wiki docs/WIKI.md`（字段 `wiki`/`idea`/`paper` 单个设值，`experiments` 追加，`-` 清空；相对路径按项目解析，绝对路径原样存）。`next` 靠这些登记判断下一步。
3. **跑门禁（两段式，因为 DSH 沙箱禁止脚本起子进程）**：
   - ① `node bin/aris.mjs gate idea_discovery`（或 `evidence_check`/`forensics`；带参数用 `--json-args '{"value":"73.2","source":"results/eval.json"}'`）→ 只生成 `.aris/gates/<name>.cmd` 并把门禁置 `pending`，把那条单行命令打印出来；
   - ② 用 ops_bash 执行打印出的命令（`cd <项目> && ARIS_HOME=... python <脚本> <项目> > out 2>&1`）；
   - ③ `node bin/aris.mjs gate <name> --record <退出码>` 回填 `pass`/`fail`、退出码与输出末尾摘要，CLI 退出码跟随门禁结果。
4. **要审查**：`node bin/aris-review.mjs --project <项目> --target <草稿> --slot 1 --tier T1`
   → 送独立模型（默认本机 Ollama qwen3:8b，可换任意 OpenAI 兼容端点），落 `.aris/reviews/<ts>-slot1.{md,json}`。
5. **看进度**：`node bin/aris-status.mjs --project <项目>`（`--watch` 刷新，`--json` 给机器读）。
   图形界面：DSH 侧栏「ARIS 流水线」面板（`dsh-aris`）有「流水线 / 产物 / Kimi 交接 / 设置」四个 tab；
   「产物」tab 只读扫描论文与实验产物、预览 PDF/图片、一键编译（`paper.build`）。
   知识库：侧栏「ARIS 知识库」（`@local/aris-wiki`）只读浏览 `references/docs/**` 与项目文献/笔记。
6. **编论文**：`node bin/paper-build.mjs --project <项目> --all --out build --json`
   → 自动判引擎（ctex → xelatex）、latexmk 优先、逐目录汇总 `{ok,pages,errors}`；退出码 0/1/2。
7. **核引用**：`python .dsh/skills/aris/tools/cx_verify.py --project <项目> --json`
   → 每处 `\cite`/`[@key]` 判 supported / weak / unsupported / orphan；退出码 2 表示有对不上的引用。
8. **定下一步**：`node bin/aris.mjs next`；手动挪阶段用 `set-phase <名>`，阶段名只有 `literature|idea|experiment|writing|review|done`。长时间无人值守时用 `schedule_create` 定时唤醒本会话再跑一轮（见下）。

### 审查桥的两种投递方式

同一条桥，两种取件方式，按审稿人在哪选：

- **直连**（默认）：`--project <项目> --target <草稿> --slot 1 --tier T1` → 立刻 POST 到 OpenAI 兼容端点（本机 Ollama / Moonshot / 任何兼容服务）。
- **邮箱**（外部人工或 Kimi Work 定时任务）：分两段，本机不碰网络。
  - 跨机共享邮箱用已授权目录：`--mailbox "<SYNC>/aris-mailbox"`（Kimi 已授权该工作区，只放 md/json 合规文本）。
  - 投递：`--enqueue` 把请求写进 `<项目>/.aris/mailbox/in/<ts>-slot<N>.request.md`（元信息注释块 + 逐字 SYSTEM/USER PROMPT），并打印一句可粘进 Kimi 定时任务的取件指令。
  - 收件：取件人把模型回复原文写成 `out/<同名>.reply.md`（第一行 `Reviewer-Model:`），`--collect` 解析成 `.aris/reviews/<ts>-slot<N>.{md,json}` 并登记 `state.json`；已收文件名记在 `mailbox/processed.json`，重复跑不会重复入账。
  - 多项目共用一个邮箱：`--collect-all --mailbox <邮箱>` 一次收完，按 `mailbox/projects.json` 把每条回复送回它自己的项目（各自 `.aris/reviews/`）；归属不明的回复会列出来并返回 2。
  - 自动收件走 Windows 计划任务 `bin/aris-collect-all.cmd`（任务名「ARIS Mailbox Collect」，每 10 分钟，日志 `.dsh/logs/aris-collect.log`），不依赖 DSH 会话。
  - 空回复不给 verdict（跳过、无有效入账时返回 2）；没有 `Reviewer-Model` 行则身份记 `unverified`。
  - 邮箱目录用 `--mailbox <dir>` 换（相对路径按项目解析）；协议说明由脚本写成 `mailbox/README.md`。
  - 入账成功的一对请求/回复会自动移到 `mailbox/trash/<base>/`（不再留在 in/、out/）；旧版本遗留的已入账文件在下次 `--collect` 时顺带归档。清空保留期外的归档用 `--purge-trash [天数]`（默认 30 天，只在显式调用时删除）。
  - 让取件人（Kimi）自己读文件：`--include <路径>`（可重复）把绝对路径+大小写进请求的「可直接读取的参考文件」，不嵌正文、不给截断；被审文件仍是唯一证据。
  - 定时收件：`schedule-38f583a6`（cron `47 1-23/2 * * *`）在 Kimi 任务每次运行后 30 分钟收件。
  - 项目放 kimi 目录时用 `--state-dir <绝对路径>`（或 `ARIS_STATE_DIR`）把 `.aris` 状态留在工作区，否则自动收件会卡审批；邮箱根目录的 `queue.md` 是给取件人的单文件索引（`PENDING: n`），比遍历 `in/` 快。

## 与原版的差异（DSH 适配）

- 上游的 `ARIS_REPO` 变量统一改写为 `ARIS_HOME`；`~/.codex/skills/`、`~/.claude/skills/` → `$ARIS_HOME/references/skills/`；`python3` → `python`。
- 原版用 `mcp__codex__codex` / `claude-review` / `gemini-review` 等 MCP 当审稿人；本机没有这些 CLI，改用 `bin/aris-review.mjs`（OpenAI 兼容 HTTP）。技能正文里的 MCP 调用名请按审查桥的契约理解。
- 原版 slash 命令 `/novelty-check "..."` ≡ 本版「读 `references/skills/novelty-check/SKILL.md` 并按其步骤执行，参数照旧传」。
- 原版 `CronCreate`/`goal-pulse` 定时看护 ≡ 本版 `schedule_create`（每 30 分钟唤醒一次，跑 `aris.mjs next` + `aris-status.mjs`）。
- **缺 MCP 的技能已加显式降级横幅**（81 个声明 `mcp__` 的技能里 73 个已插三行横幅，8 个原有横幅跳过）：
  判据是「宁可 `BLOCKED:` 停下，不许静默降级凭记忆写」；替代矩阵见 `MCP_REPLACEMENTS.md`。
- 上游 `tools/cx_verify.py` 在本版缺失且被 `citation-crosscheck` 引用，已用 stdlib 重写补齐；`citation-crosscheck` 的「悬空引用」不再是死路。
- 新增 `bin/paper-build.mjs`（编译）与 `tools/cx_verify.py`（引用核验）——上游没有这两个 DSH 侧工具。
- `tests/`：上游 82 个 pytest 复制到 `tests/upstream/` 做环境分类，另在 `tests/dsh/` 补 DSH 侧五块测试（状态机、门禁两段式、邮箱协议、prompt 渲染、bib 合并）。
- 二进制素材（`assets/` 图片、`community_papers/` 示例 PDF）未随包移植；需要时回上游取（`tests/` 夹具已单独补回）。

## 限制

- 上游技能按 Unix 写（`bash`、`/tmp`、`sed -i`）。Windows 上跑前先确认命令可用；把 `python3` 换成 `python`。
- 审查桥的独立性取决于你配的后端；本机只有 Ollama 时是同机异模型审稿，属 `same-host` 独立性，判定要按此降级记录。
- 技能里的 `allowed-tools` 是上游宿主的声明，DSH 不强制执行；以 DSH 实际工具为准。
- 状态契约（外部脚本读 `.aris/state.json` 时注意）：顶层含 `tools_dir`；`gates.<name>.detail` 是对象 `{cmd, script, exit_code, out, snippet}` 而非字符串；旧项目若缺 `.aris/installed-skills.txt`，`aris.mjs check` 会报缺失，需 `init --force` 重建。
