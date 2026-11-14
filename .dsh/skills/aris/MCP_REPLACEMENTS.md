# MCP 替代矩阵：缺失 MCP 的显式降级

**适用对象**：本机（Windows，DSH 工作区 `<WORKSPACE>`）安装的 ARIS 技能库
`.dsh\skills\aris\`。数据清点日期：2026-11-07。

## 为什么要有这份表

上游 ARIS 的 87 个技能里，**52 个**在 `SKILL.md` 的 frontmatter `allowed-tools` 中声明了
本机根本不存在的 MCP server（`mcp__codex__*`、`mcp__claude-review__*`、`mcp__zotero__*` 等）。
两份变体族（`skills-codex/`、`skills-codex-gemini-review/`）又有 29 个文件同样如此。

MCP server 不存在时，**技能不会报错**：工具调用落空、技能照常往下走，最常见的失败形态是
静默降级——执行者顺着正文「让 Codex 审一遍 / 去 Zotero 查文献」的字面意思，改成凭记忆写一段
审查意见、引用条目、实验结论或数据表。产物格式正常、语气专业，但毫无外部依据，比直接失败
更难发现，也更危险。

所以每个受影响的 `SKILL.md` 正文开头都有一条 `> **DSH 本机覆盖**` 横幅，把「本机没有什么、
该换什么、换不了怎么办」放在执行者第一眼能看到的位置。本文件是这些横幅的对照表和判定依据，
横幅与本文冲突时以本文为准。

## 判据：宁可 BLOCKED，不许静默降级

- **有本机替代** → 走替代，并在产物或 `.aris/` 记录里写明实际走的通道（如
  `reviews/<时间>-slotN.md` 路径、`literature/` 产物路径）。
- **替代不可用**（缺脚本、缺凭据、邮箱不通、模型不可达）→ **停止**，输出一行
  `BLOCKED: <原因>`，交回人工。
- **禁止**：凭记忆补写引用/文献条目、结论、数字、图表数据、审查意见；禁止把「我读过 / 审过 /
  验证过」写进交付物；禁止用同一族模型自审冒充跨家族审查。
- 判断标准是「产物里每一条是否有可追溯来源」，不是「任务有没有跑完」。宁可交一个
  `BLOCKED`，也不交一份看起来完整、实则编造的稿件。

## 替代矩阵

| 缺失 MCP | 本机替代 | 替代不可用时 |
|---|---|---|
| codex-exec / grok-exec / antigravity-exec | 场景是「让另一个模型跑一段活」→ 用 DSH 的 `subagent` 工具；非审查类也可以 `node bin\model-worker.mjs` | 停，输出 `BLOCKED: <原因>` |
| claude-review / gemini-review / minimax-chat | 审查统一走 **Kimi 邮箱**（`node bin\aris-review.mjs --enqueue` / `--include`），这是本机唯一审查通道 | 停，`BLOCKED: 无审查通道` |
| model-worker | 仅非审查用途：`node bin\model-worker.mjs`（需显式 backend）；**审查用途禁止**用它 | 停 |
| codex-image2 | `dsh-image-gen`（生成图片）或 TikZ/matplotlib 出图 | 用绘图代码 |
| zotero / obsidian-vault | `node bin\lit.mjs`（检索/入库/BibTeX）与项目内 `literature/`、`notes/` | 停 |
| gemini-cli | 无替代 | 停 |
| llm_chat | 任意 OpenAI 兼容端点（本机未配） | 停 |
| manual-review | 人工裁决，无自动化替代 | 停，报人工 |
| feishu-bridge | 无（turn-notify 已禁用） | 只写日志 |

说明：

- 上表的 `bin\...` 路径以工作区根 `<WORKSPACE>` 为基准，均已核实存在：
  `bin\lit.mjs`、`bin\aris-review.mjs`、`bin\model-worker.mjs`。
- **审查走的 Kimi 邮箱**细节（送审/收件/入账、邮箱路径、禁止同族自审）见
  `references/dsh-model-override.md`，那是审查流程的权威说明，本表只负责「哪个 MCP 换成什么」。
- `model-worker.mjs` 是 DeepSeek 直连、与执行者同族，只能做翻译/压缩/代码/规划等粗活；
  `--role reviewer` 参数存在但**不得用于正式审查**。
- 替代命令跑成功不等于结论可信：`literature/` 里必须有 `papers.json`/`papers.md` 等落盘产物，
  审查必须有 `reviews/` 文件，否则仍按「无据」处理。

## 横幅约定

受影响的 `SKILL.md` 在 frontmatter 结束的 `---` 之后、正文第一个标题之前，有一条
`> **DSH 本机覆盖**` 横幅（每行以 `> ` 开头，后接一个空行），形状为：

```
> **DSH 本机覆盖**：本机无 `<mcp 名>`（缺 CLI/凭据）。此类工作改走 `<替代>`。
> 替代不可用时**停止并输出 `BLOCKED: <原因>`**，禁止凭记忆补写引用、结论、数据或审查意见——
> 静默降级产出的内容看起来正常但无据，比失败更糟。详见 `MCP_REPLACEMENTS.md`。
```

一个技能声明多个缺失 MCP 时合并为一条横幅，逐项列出（例如 `codex`/`grok` → `subagent`，
`claude-review` → Kimi 邮箱）。横幅是**唯一**允许的正文插入；已有 `DSH 本机覆盖` 的文件跳过
（幂等），既不重复插入，也不改写既有横幅。

## 命名与扫描口径

- 矩阵中的 `manual-review` 在 frontmatter 中写作 `manual_review`（下划线），是同一条。
- `gemini-review` 变体族声明的是 `mcp__gemini-review__*`，归入「审查」行，走同一个 Kimi 邮箱。
- 扫描口径：每个 `SKILL.md` frontmatter（首个 `---` 到第二个 `---`）内匹配
  `mcp__<server>__<tool>`；同一文件同一 server 只计一次；`mcp__zotero__*`、
  `mcp__obsidian-vault__*`、`mcp__gemini-cli__*` 这类通配工具名按 server 归组。
- 判定「缺失」= 本机 DSH 未安装该 MCP server。当前 DSH 没有配套的 MCP 客户端连接
  （`codex`、`antigravity`、`grok`、`claude-review`、`gemini-review`、`model-worker`、
  `zotero`、`obsidian-vault`、`gemini-cli`、`codex-image2`、`llm_chat`、`manual_review`
  全部缺失）。

## 清点结果（2026-11-07）

| 技能族 | SKILL.md | frontmatter 声明 `mcp__` | 其中已有横幅（跳过） | 本次插入 |
|---|---:|---:|---:|---:|
| `skills/`（上游 87 技能） | 87 | 52 | 7 | 45 |
| `skills/skills-codex/` | 87 | 27 | 1 | 26 |
| `skills/skills-codex-claude-review/` | 8 | 0 | 0 | 0 |
| `skills/skills-codex-gemini-review/` | 15 | 2 | 0 | 2 |
| **合计** | **197** | **81** | **8** | **73** |

主族 52 个文件的每 server 出现次数与任务给出的统计逐项吻合（codex 48、antigravity 36、
grok 36、claude-review 36、manual_review 6、model-worker 3、zotero 2、obsidian-vault 2、
gemini-cli 1、codex-image2 1、llm_chat 1），合计 172 次。四个技能族合计 255 次，涉及
12 个 MCP server：antigravity 61、claude-review 61、grok 61、codex 48、manual_review 6、
model-worker 5、obsidian-vault 3、zotero 3、gemini-cli 2、codex-image2 2、gemini-review 2、
llm_chat 1。

全库现在共有 **87 个** `SKILL.md` 带横幅 = 本次插入 73 + 此前已有 14（其中 8 个属于上面
「已有横幅（跳过）」的声明文件，另 6 个变体 overlay 未声明 MCP 但此前已加过横幅）。

## 已知未覆盖面（需人工决定，本次未动）

1. **已有横幅的 8 个文件按幂等规则跳过**，其横幅是早先针对 lit/审查写的，措辞与本表不完全
   同构（如 `research-lit` 保留「本机没有该脚本时按下文原有流程执行」的软回退）。是否统一改写，
   需另行授权——本次未改任何既有横幅。
2. **23 个文件的 frontmatter 没有 `allowed-tools` 字段**，但正文提到 `mcp__...`
   （集中在 `skills-codex-claude-review/` 8 个、`skills-codex-gemini-review/` 9 个，以及
   `auto-review-loop-llm`、`auto-review-loop-minimax`、`skills-codex/research-lit` 等）。
   它们不在本次「frontmatter 声明」的扫描口径内，未插横幅；其中 4 个此前已有横幅，
   其余 19 个没有。这些 overlay 一旦被单独执行，仍有静默降级风险。
3. `skills-codex-claude-review/` 8 个文件全部没有 `allowed-tools` 字段，本次 0 命中。

## 本轮决定（2026-11-07，lead）

- **口径按 81 处理**（primary 52 + skills-codex 27 + skills-codex-gemini-review 2），不是只有 primary 的 52。
- **`research-lit` 的软回退横幅保留不改**：本机确实有 `bin/lit.mjs`，那条「没有该脚本时才按下文原流程」是
  真实可用的回退分支，不是静默降级；与「宁可 BLOCKED」不冲突（BLOCKED 针对的是**该有证据却没有**的场合）。
- **23 个只在正文提 `mcp__` 的文件不逐个改**：它们是 overlay 变体，正常主线不会单独执行；风险已在上面
  第 2 条登记，视为已知未覆盖。若日后要跑 `skills-codex-claude-review/` 这一族，先回来读本节。
- `manual-review`（矩阵写法）与 `manual_review`（frontmatter 写法）是同一条；`feishu-bridge` 没有技能声明，
  仅列在矩阵里备查。
