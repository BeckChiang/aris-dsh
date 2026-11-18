# ARIS 流水线与面板使用手册

> 适用版本：跨机包 2.14.2（2026-11-12）
> 读者：在本机用 DSH 跑科研流水线的人（不是开发者）
> 范围：`Aris_Dsh` 面板、`Aris_Wiki` 面板、底层流水线逻辑、CLI 速查

---

## 1. 这套东西由哪几块组成

| 层 | 是什么 | 在哪 |
|---|---|---|
| 宿主 | 桌面版 DSH 进程。它同时开着 Web 界面和**节拍器**（每 60 秒 tick 一次，决定要不要起下一轮） | 你正在用的这个 App |
| 面板 | 两个 Web 插件：`Aris_Dsh`（写面：启停/门禁/编译/设置）、`Aris_Wiki`（读面：计划/产物/文档） | 侧栏两个入口 |
| 运行器 | `bin/aris-run.mjs` + `bin/lib/aris-runner.mjs`，负责起一轮「headless DSH 子进程」 | 工作区 `<WORKSPACE>\bin` |
| 项目状态 | 每个流水线自己的 `pipeline/state.json`（阶段、待办、门禁、指令、产物登记） | 项目目录内 |
| 运行账本 | `.aris-run/runtime.json`（本轮状态、下次时间）、`costs.jsonl`（每轮费用）、`runs/<runId>/`（每轮产物） | 项目目录内 |
| 审查通道 | 邮箱协议：请求写进 `…\kimi\aris-mailbox\in\`，Kimi 桌面客户端取件作答，回复落 `out\`，再由 `--collect` 收进 `.aris/reviews/` | 同步盘 |
| 知识库 | ARIS 上游文档 + 替代矩阵 + 项目文献/笔记/检索日志的只读索引 | `.dsh/skills/aris/references/…` + 项目目录 |

一句话概括：**宿主按节拍起一轮 → 子进程读 state 做一件原子事 → 写 `runs/` → 需要时送审 → 收尾回写 state → 面板只读地把这一切显示出来。**

---

## 2. 一条流水线的生命周期

### 2.1 阶段（phase）
科研流程被切成 11 个阶段，阶段 id 形如 `S4a_match`：

```
S0_prepare   准备（仓库、环境、数据入口）
S1_formal    形式化（定义、符号、命题）
S2_data      数据管线（生成、校验、归档）
S3_baseline  基线（方法实现 + 12 格评测）
S4a_match    匹配（层级匹配核心）      ← 当前在这里
S4b_plan     规划（掩码编译、四配置消融）
S4c_unfold   展开（模板库 + DAG 调度）
S4d_bridge   桥接（IFS 编码、金标准对照）
S5_experiments 端到端实验（消融、迁移、显著性）
S6_writing   写作（英文主稿、引用核验、三级审）
S7_submission 投稿（匿名稿、cover letter、预检）
```

每个阶段在 `state.json` 里是一条 `{status, todo[], done[]}`：
- `status`：`pending` / `in_progress` / `done` / `blocked_on_user`
- `todo`：还没做的条目（往往以 `S4a.1a` 这样的步骤号开头）
- `done`：已完成条目，长句中文，写清了做了什么、验证了什么

### 2.2 门禁（gate）
阶段之间不是自动推进，要过门禁。当前项目 4 个门禁：

| 门禁 | 判据 | 现在 |
|---|---|---|
| `G1_week5` | 判据覆盖率 ≥30% 且可分解率 ≥60% | 已裁：`NO_GO_FALLBACK_CONTINUE`（覆盖 20%，改叙事不改路线） |
| `G2_week11` | 基线齐、数据 5k | 已裁：`GO`（2026-11-12 15:01） |
| `G3_week16` | 4 配置单测通过且 fallback<10% | 待做 |
| `G4_bridge` | 自动 A_m ≥ 手工 A_m | 待做 |

门禁字段含义：`criteria` 判据、`status` 状态、`decision` 裁决词、`observed` 实测值、`completed` 裁决时间、`evidence` 证据文件列表。

> 通用 ARIS 项目的门禁名是 `idea_discovery` / `forensics` / `evidence_check`，判定逻辑相同。

### 2.3 一轮（wake / round）到底做了什么

每轮子进程拿到的提示词是 7 步固定动作：

1. 读 `state.json` + `pipeline/handoff/latest.md`
2. 判断：paused / blocked / done → 直接退出（`RESULT: idle`）
3. 用 `python pipeline/gate.py pipeline/state.json A` **认领 A 角色租约**（A/B 互斥，20 分钟冷却，70 分钟租约，每天 25 次唤醒上限）
4. 只做一个**原子块**（一个可验证的小目标，不做半成品）
5. 自测全绿后写 `runs/<runId>-dsh.md`（做了什么、证据、下一步）
6. 每轮**最多送审一次**（`pipeline/review/mailbox_bridge.py … send`），额度紧张时跳过
7. 收尾 `gate.py … A --finish`（若已送审加 `--async-wait`），末尾只打印一行 `RESULT: <done|idle|blocked> <一句话>`

这一轮的产物：`runs/<runId>/`（事件流、日志、提示词、meta.json）、`costs.jsonl`（一条费用）、`runtime.json`（状态与下次时间）。

### 2.4 预算与额度

`pipeline/budget.json` 控制单轮上限：

- 每轮 **40 次模型调用 / 200k 上下文**；32 次预警，36 次后**禁止开新块**，40 次或触顶必须收尾
- 主控段 120k / 80 次
- 工具输出：成功 1600 字、失败 6000 字（超长会被截断）

面板与 Wiki 显示的「上下文 68%」「22/40」即来自这里。**逼近上限不是错误，是设计**：逼本轮收尾而不是硬撑。

---

## 3. `Aris_Dsh` 面板（写面）

侧栏点 `Aris_Dsh`。顶部四个页签：**流水线 / 产物 / Kimi 交接 / 设置**。

### 3.1 流水线页

顶部可添加流水线：填项目根目录 → 「添加」→ 选 driver（`auto` 会识别 `frrs` 或通用 `aris`）。

每条流水线是一张可展开的卡片，摘要行从左到右：

| 元素 | 含义 |
|---|---|
| 状态文字 | 见下表 |
| `未送审 N 轮` | 连续 N 轮没有送审（评审空转，提示你去查额度或 gate） |
| `Kimi 未取件 N 分钟` | 最老的待回件已等 N 分钟，超过阈值 → 检查 Kimi 定时任务是否在跑 |
| 流水线名 | 项目名 |
| 最近一句 `RESULT:` | 上一轮的结论摘要 |
| 阶段 id | 当前阶段（如 `S4a_match`） |
| `上轮 ¥x` / `总计 ¥y` / `N 轮` | 费用与轮数 |
| `下次运行 时间` | 节拍器预计起下一轮的时间（禁用时不显示） |

状态词义：

| 状态 | 含义 |
|---|---|
| 待命 | 已启用，等节拍起下一轮 |
| 正在运行 | 有一个 headless 子进程正在跑本轮 |
| 等待审核 | 在途审稿 ≥1 条，回件之前不会起新轮（省 token） |
| 等待人工 | 本轮被 `blocked_on_user` 卡住，或 state 里登记了 block，需要人裁决 |
| 停止中 | 已登记停止：本轮跑完即停，不中断 |
| 已停止 | 已禁用，不会自动起轮（在途审稿回件也不起） |
| 出错 | 连续失败/启动失败，看日志 |

展开卡片后四块：

1. **正在做什么**：模型、已运行分钟、回合 id；运行中会显示当前动作摘要；未运行则显示「上一轮已收尾，等节拍起下一轮」
2. **总计划 · 计划与事件**：完成百分比、当前阶段与状态；明细在卡片底部两列（计划项 / 事件流）
3. **运行数据**：上轮结论（`done`/`failed`）、审核结果（最近一次 verdict + 分数）、最近会话 id
4. **操作**：见下

操作按钮逐个说明：

| 按钮 | 作用 | 风险 |
|---|---|---|
| 启用 / 停用 | 打开/关闭自动节拍 | 停用后**在途审稿回件也不会起轮**；重新启用要手动点或等下一次节拍 |
| 运行一次 | 立刻起一轮（不看 nextAt） | 若已有进程在跑则不可用 |
| 停止 | 登记「本轮跑完即停」 | 不中断当前轮，避免半截提交 |
| 强制停止 | 立刻杀本轮进程 | 可能留下未提交改动、审查请求未回写；gate 租约会 70 分钟后自然过期 |
| 取消停止 | 撤回停止意图 | — |
| 检查回复 | 收件：把 `out/` 的回复收进 `.aris/reviews/` | 只读 inbox/outbox，不改 state |
| 检查恢复 | 把「显示运行中但进程已消失」的回合标为中断 | 只修运行时记录 |
| 清空运行记录 | 把运行记录、费用台账归档到 `.aris-run/history` 并清零面板统计 | 不影响 state 与论文产物 |
| 提示词 / 重置提示词 | 查看/恢复本轮提示词模板 | 重置只影响后续轮次 |
| 日志 | 打开最近日志 | 只读 |
| 会话 | 只读查看本轮 headless 会话（提问、工具调用、结果） | 运行中按钮显示「会话 · 运行中」并带「运行中 · headless 持有」标签，**不要在里面发消息**（会和 headless 抢写同一会话日志） |
| 移除 | 从面板移除这条流水线登记 | 不删项目文件，只是不再监控 |

### 3.2 产物页

- **主论文**卡固定置顶：显示 `label · 文件名`、体积、生成时间，按钮「打开 PDF」「看源码」「编译论文」
- **编译论文**：调用 `bin/paper-build.mjs`，自动判引擎（有 `ctex/xeCJK/fontspec` → xelatex，否则 pdflatex），PDF 写到各目录 `build/`；面板逐目录显示「通过 xelatex 23 页 / 失败 + 首个错误」
- **引用体检**：`未被引用 N`、`缺失 N`、`空章 N`（解析 `\includegraphics` 与章节字数）
- 六组只读浏览在 `Aris_Wiki` 的「产物」页，这里不再重复

### 3.3 Kimi 交接页

- **DSH 接管 / 交回 Kimi Work**：切换 `handoff.mode`
  - `dsh`：节拍器在 DSH 里自动起轮（推荐，本机常开时用这个）
  - `kimi`：不在 DSH 起轮，改由 Kimi 侧定时任务拉起
- **取件提示词**：给 Kimi 桌面客户端用的整段提示词，含邮箱路径、间隔、该模型自报 `Reviewer-Model`
- **复制 / 存到文件**：把提示词带走
- **立即收件**：等价于「检查回复」

> Kimi 侧没有 API、没有 CLI，只能靠应用内定时任务 + 邮箱。Kimi 应用关掉时任务不跑，所以面板上的「Kimi 未取件 N 分钟」是唯一可靠信号。

### 3.4 设置页

| 字段 | 含义 | 建议 |
|---|---|---|
| 邮箱目录 | `…\kimi\aris-mailbox` | 同步盘绝对路径 |
| 模型 | 子进程用的模型（现 `deepseek-flash`） | 换更贵的模型前先看单轮成本 |
| 并发 | 同时最多跑几条流水线 | 1–2，机子只有一块 4060 Laptop |
| 单轮分钟上限 | 超时即收尾 | 120 足够 |
| 每卡事件条数 | 事件流显示多少条 | 默认即可 |
| Kimi 间隔 / 起始时间 | 提示词里的取件节奏与起点 | 与 Kimi 应用内定时任务一致 |

### 3.5 GPT 外审页（接本机已装的 ChatGPT）

不另开 API key，直接用这台机器上装好的 Codex/ChatGPT 桌面端（订阅登录）当第三个审稿族。

**通道卡**
| 字段 | 含义 | 默认 |
|---|---|---|
| 启用 GPT 外审 | 总开关，关掉后所有派单一律拒 | 关 |
| 每小时上限 | 滑动 60 分钟内的调用次数上限 | 4 |
| 每日上限 | `0` = 不限 | 0 |
| 单次超时 | 超时即 kill | 8 分钟 |
| 代理 | codex 走 HTTPS，直连 chatgpt.com 不通 | `http://127.0.0.1:7897` |
| 沙箱 | `read-only` 只把正文喂进去；`danger-full-access` 才让它自己读工程 | `read-only` |

- **`codex.exe` 是否找到**：`WindowsApps` 目录不可枚举（EPERM），所以走 `Get-AppxPackage OpenAI.Codex` 取安装位；版本升级后自动跟到新目录
- **本小时剩余 / 连续失败**：口径与预算文件 `.dsh/codex-budget.json` 一致；连续失败 3 次自动停摆，需在面板手动恢复
- **保存即回读**：保存后显示的是从磁盘重读的配置，不是前端乐观回显

**环节 → 模型**（每个环节一行，可单独改模型/强度，或关掉该环节）

| 环节 | 默认模型 | 强度 | 理由 |
|---|---|---|---|
| S1_formal / S2_data | `gpt-6-luna` | low | 格式与数据核对，规则明确 |
| S3_baseline / S4_core | `gpt-6.2-sol` | medium | 常规改动审查的日常档 |
| S5_experiments | `gpt-6.2-astra` | high | 跨材料、多步验证 |
| S6_writing | `gpt-6.2-sol` | medium | 写作审读 |
| kill_argument | `gpt-6.2-astra` | high | 找致命反驳 |
| claim_audit / layout_check | `gpt-6.1-terra` | medium | 版面与图表需要视觉 |
| citation_audit | `gpt-6-luna` | low | 元数据比对，机械活 |

**手动派单**：选流水线根 → 填目标文件相对路径 → 选环节 → 派单。后台跑，结果落 `<项目>/.aris/reviews/<时间>-codex-<环节>.md`，面板只读展示上次结果与回复预览。

**最近调用**：每次的时间/环节/模型/成败/tokens/耗时，明细在 `.dsh/codex-runs.jsonl`。

> **两条不可信**：① 模型自报身份经常是错的（实测 `-m gpt-6-luna` 执行、自报 `gpt-6.2-sol`），以 CLI 首行 `model:` 为准，两者都记；② 默认模型会随账号漂移，所以每次都用 `-m` 钉死，型号从清单里消失就拒单，不静默回退。
>
> **沙箱实测**：本机 `read-only` 与 `workspace-write` 都起不了 codex 的 shell 辅助进程（`orchestrator_helper_exit_nonzero`），只有 `danger-full-access` 能执行命令。因此默认 `read-only` 的含义是「只把稿件正文当提示词喂进去」，不给它读工程。

---

## 4. `Aris_Wiki` 面板（读面，全链路只读）

顶部三个页签：**计划 / 产物 / 文档**，右上只有一个「刷新」——流水线的选择被收进各自页签内部。

### 4.1 计划页

**状态词与 `Aris_Dsh` 面板同一套**（正在运行 / 停止中 / 等待审核 / 等待人工 / 待命 / 已暂停 / 已停止 / 出错）。两个面板看到同一件事必须说同一句话，所以 `lib/plan.mjs` 的 `statusOf()` 照抄 `Aris_Dsh` 的判定顺序：出错 → 等待人工（`state.block` 或 `blocked_on_user`）→ 停止中 → 正在运行 → 已停止 → 等待审核（有在途审稿）→ 待命。

**默认是总览（卡墙）**：4 个 KPI（在跑 / 累计 / 需人工 / 等回件）+ 每条流水线一张卡，五行：

1. 卡片头：状态点 + 名称 + 状态徽章 + `需人工` / `等回件 n` 徽章（有才显示）
2. 阶段行：`6/11 · 4-B 混合规划，5 周 · S4b_plan`（序号 / 中文阶段名 / 状态机 id）
3. 11 段阶段 rail（绿=已完成、橙=进行中、灰=待做），**可点**，点哪段就打开那条流水线并直接定位到该阶段
4. 现在：`本轮 09:38 起 · 已跑 15 分钟 · 110/60 步 · 上下文 39%`（没在跑时显示上一轮）
5. 页脚：`轮 68 · ¥35.82 · 门禁 2/4 · 阻碍 3 · 下轮 10:07`；有需人工项时卡片左侧红条；最顶一条阻碍单行显示

**点卡片进入单条详情**，头部左上角有 **「← 返回计划列表」**，右上显示**完整** `runId` 与 pid。详情页自上而下，除状态条外**每个区都能折叠**（默认只展开当前阶段 / 阻碍 / 门禁）：

1. **状态条**：状态、阶段（序号 / 中文名 / id）、现在（本轮起点、已跑时长、步数、上下文）、回件（在途条数、最久已等、是否超阈值）、成本（累计轮数 / 费用 / 今日 / 下轮）
2. **工具条**：展开全部 / 全部收起 + `共 N 阶段（完成 · 进行 · 未开始）`
3. **当前阶段**：默认展开的那一段，体内分组见第 6 条
4. **阻碍**：见下方规则表；每条带严重度、类型（`state-block` / `blocked-on-user` / `stopping` / `gate` / `blocked-until` / `error` / `review-pending` / `gate-pending` / `budget` / `never-run`）、说明、证据，`需人工` 标出必须人裁决的
5. **门禁**：id、状态（已裁/待做）、裁决词、判据、实测值
6. **总计划**：11 个阶段全部列出，每行显示 `计划 a/b · 待做 n`，点行展开/收起；展开后按五组显示，**每组单独可折叠**：
   - 进入 / 退出条件（`pipeline/PIPELINE.md`）
   - 计划项（PIPELINE.md 的 `- [ ]` 条目，全量不截断）：`☑/◐/☐` + 右侧「N 步」表示对应几个状态机步骤
   - 待做（自己能干）：`阶段序号.步序` + 状态机 id 徽标 + 摘要
   - 等外部回件：送审 / 待回复类步骤单列，避免和可自干项混排
   - 已完成步骤：同上；若同一步骤编号也出现在 `todo` 里，标「仍挂在待做」，只显示一次
7. **进展时间线**：轮次 / 审查回件 / 门禁裁决三类事件按时间倒序
8. **最近 8 轮执行**表：轮次、开始、步数、成本、结果（含 exit）
9. **日志抽屉**：阻碍里点「看日志 / 看样子」就在页内弹出 `.aris-run/runs/<runId>/final.txt`（轮次摘要）或 `stderr.log` / `runtime.json`，不用离开面板

**计划项与步骤怎么对应**：不按序号硬配（PIPELINE.md 的条目顺序与状态机步骤号并不一一对应，实测 S4b 第 1 条是 GMM 策略、第 3 条才是 `S4b.1a` 做的判据掩码预编译）。用最长公共子串 ≥5 个连续字符匹配，一条步骤只认一个计划项；对不上就显示「未开工」，不做假勾选。

**阻碍动作按钮**：`看日志 / 看样子 / 看门禁 / 看判据 / 看是哪一步` 直接可用（页内滚动或弹抽屉）；`打开邮箱队列 / 看预算` 要跨到 `Aris_Dsh` 面板，没有公开跳转 API，降级为**复制路径 + 提示去 `Aris_Dsh` 操作**，不做点了没反应的假按钮。

阻碍规则表（`lib/plan.mjs` 的 `blockersOf()`，按严重度排序）：

| 类型 | 何时出现 | 算需人工 | 动作 |
| --- | --- | --- | --- |
| `state-block` | `state.block` 有内容，且之后没有成功轮次 | 是 | 看是哪一步 |
| `blocked-on-user` | `state.status` 或任一阶段 = `blocked_on_user` | 是 | 看是哪一步 |
| `gate` | `runtime.gateReason` 非空且流水线没在跑 | 是 | 看门禁 |
| `error` | `runtime.lastError` 或连续错误 ≥2 | 否 | 看日志 |
| `stopping` | 已登记停止、本轮收尾后不再起轮 | 否 | — |
| `blocked-until` | `runtime.blockedUntil` 还在未来（预检退避） | 否 | 看样子 |
| `review-pending` | 邮箱 `projects.json` 登记、且 `in/<base>.request.md` 仍在的在途请求 | 否 | 打开邮箱队列（复制路径） |
| `gate-pending` | 门禁 `status=pending` | 否 | 看判据 |
| `budget` | 最近一轮上下文 ≥80% | 否 | 看预算（复制路径） |
| `never-run` | 从没跑过 | 否 | — |

在途审稿的判据与 dsh 流水线同源（`bin/lib/aris-runner.mjs` 的 `pendingReviews`）：邮箱索引 + 在途请求文件双条件，超时阈值 = `max(30, 2×Kimi 取件周期)` 分钟（当前 Kimi 周期 15 分钟 → 30 分钟）。超阈值**只标「已超阈值，Kimi 可能没取件」**，不转人工——这条以前看 `.aris/reviews/*.json` 的 mtime，而那是只增不删的归档目录，导致流水线明明在跑却长期报「需人工」。


### 4.2 产物页

- 顶部 chips 选流水线（**产物按流水线分开**）
- 主论文卡：`主论文 · 中文稿`、文件名、体积、生成时间、「打开 PDF」「看源码」
- 左列六组：论文（`.tex/.md`）、图、实验（`dataset_gen/out`、`pipeline/out`、`runs`）、审查、运行、幻灯片
- 右列预览：文本按 Markdown 渲染、图片直显、PDF 内嵌
- 只读：编译与写操作在 `Aris_Dsh`

产物扫描上限：单组 400 文件、总 1500、文本 2MB、二进制 4MB、深度 4；越界路径直接 404。

### 4.3 文档页

知识库索引：ARIS 上游文档（`references/docs`）、`MCP_REPLACEMENTS.md`、各项目 `literature/` `notes/` `search_logs/`。一级按流水线分组、二级按文件类型（chips）、支持搜索与阅读器（60 秒缓存，最多 2000 条）。

---

## 5. 信息从哪来（对得上就看得懂）

| 面板上看到的 | 来源文件 |
|---|---|
| 阶段、待办、门禁、block、指令、产物登记 | `<项目>/pipeline/state.json` |
| 本轮状态、pid、下次时间、等待、最后错误、累计 | `<项目>/.aris-run/runtime.json` |
| 每轮费用、步数、结论 | `<项目>/.aris-run/costs.jsonl`、`runs/<runId>/meta.json` |
| 审查裁决与分数 | `<项目>/.aris/reviews/*.json`、`.aris/meta/events.jsonl` |
| 在途审稿（等回件几条、等了多久） | `~/.dsh/aris-dashboard.json` 的 `mailbox` → `<邮箱>/projects.json` + `<邮箱>/in/<base>.request.md`（与 dsh 流水线同源；`runtime.json` 的 `waiting` 兜底） |
| 日志抽屉内容（轮次摘要 / 错误） | `<项目>/.aris-run/runs/<runId>/final.txt`、`stderr.log`、`.aris-run/runtime.json` |
| 阶段的进入/退出条件与计划项 | `<项目>/pipeline/PIPELINE.md` |
| 预算阈值 | `<项目>/pipeline/budget.json` |
| 会话（提问/工具/结果） | `~/.dsh/sessions/--<工作区转义>--/session-<uuid>/session.v4.jsonl.zstd` |
| 论文与图 | `paper2/en`、`paper2/cn`、`paper2/figures`、`build/main.pdf` |

---

## 6. 审查闭环（Kimi 3.1 Pro / GPT 两条通道）

`via` 决定走哪条：`kimi-mailbox`（人工/Kimi 客户端取件）、`codex`（本机 ChatGPT 直跑）、`direct`（OpenAI 兼容端点）。

```
子进程写请求 → .aris/mailbox/in/<ts>-slot1.request.md
        ↓（Kimi 桌面客户端定时取件，人工/自动作答）
回复落 aris-mailbox/out/<ts>-slot1.reply.md
        ↓（面板「检查回复」或每轮启动时的 collect-all）
.aris/reviews/<ts>-slot1.json    ← 记 verdict、score、identity=reviewer-declared:<模型>
        ↓（本轮收尾或下一轮）回写 state：把 MUST/SHOULD 转成下一块的 todo
```

要点：
- **身份靠自报**：回复首行 `Reviewer-Model:` 决定 `identity`；缺失即视为未验证
- **同族审查只能算 provisional**：执行是 DeepSeek，审稿必须跨族（Kimi/Claude/GPT）才算真对抗
- **面板不伪造结论**：所有裁决只从 `.aris/reviews/*.json` 与 `state.json` 读，不接受手填
- 额度：订阅制，不进 `costs.jsonl`；比 API 更容易撞 5 小时窗/周上限

**GPT 通道（via=codex）**不必等外部取件，一轮内同步跑完：

```
prompts → codex.exe exec（stdin 喂提示词，-o 落 stdout 文件）
        ↓  超时 kill、单飞锁、每小时限额、tokens 记账
.aris-run/codex/<stamp>-<gate>.task.md   ← 送进去的原文
        ↓
.aris/reviews/<时间>-slot<N>.md          ← 审稿正文，首行 model/effort 以 CLI 头部为准
.dsh/codex-runs.jsonl                    ← 每次调用的 model/effort/tokens/耗时/成败
```

- 配置在 `bin/aris-review.mjs --via codex`，环节用 `--gate` 选（决定模型与强度），`--model/--effort` 只对这一次生效
- 复现旧结论用「按原配置重跑」，读 `codex-runs.jsonl` 里那次的 model/effort；**复现不要揉进日常迭代**，否则失去可比性
- 不加 Windows 计划任务：只由 DSH 运行期（一轮开始时、或面板手动派单）触发

---

## 7. 常用剧本

**启动一条流水线**
`Aris_Dsh → 流水线 → 启用`（或「运行一次」马上跑一轮）→ 看摘要行变「正在运行」→ 用「会话」旁观。

**暂停而不留半截**
点「停止」（等本轮跑完），不要「强制停止」。收尾后摘要变「已停止」。

**本轮卡在等人**
`Aris_Wiki` 里看到「等待人工」→ 进详情展开「阻碍」，红条那条就是卡住的原因（`state-block` / `blocked-on-user` / 门禁未过），点「看是哪一步 / 看门禁」直接定位 → 去 `Aris_Dsh` 或对话框裁决 → 需要写回 state 时用「提交并批准重启」。
注意：**在途等审稿不算「需人工」**，它显示为「等待审核」，超阈值只在阻碍里提示「已超阈值，Kimi 可能没取件」。

**审稿一直不回来**
计划页卡片会出现「等回件 N」徽章，详情状态条的「回件」写着最久已等多久、是否超阈值（阈值 = max(30, 2×Kimi 取件周期)）→ 确认 Kimi 应用是否开着、定时任务是否启用 → 或手动把 `out/` 的回复放进邮箱后点「检查回复」。

**只想看进度**
只开 `Aris_Wiki`：计划页卡墙看全局，点进去看总计划、步骤、阻碍、时间线。

**编译论文**
`Aris_Dsh → 产物 → 编译论文`；CN 稿走 xelatex 23 页，EN 稿当前因 32 行中文占位（`【TODO-EN】`）编不过，报 `Unicode character 【 (U+3010)` —— 这是**内容缺口**，不是工具问题。

**新增一条流水线**
`node bin/aris-run.mjs add --root <项目> --driver auto`，然后面板会自己出现。

---

## 8. CLI 速查

```bash
# 流水线（工作区根目录执行）
node bin/aris-run.mjs status                 # 所有流水线状态
node bin/aris-run.mjs add --root <项目> [--driver auto|frrs|aris] [--interval 30]
node bin/aris-run.mjs start|stop --root <项目>
node bin/aris-run.mjs run --root <项目> [--force]     # 手动跑一轮
node bin/aris-run.mjs tick [--force]                  # 走一次节拍判定
node bin/aris-run.mjs logs --root <项目> [--tail 40]
node bin/aris-run.mjs cost --root <项目> [--json]
node bin/aris-run.mjs remove --root <项目>

# 通用 ARIS 状态机
node bin/aris.mjs status|next|check
node bin/aris.mjs set-phase literature|idea|experiment|writing|review|done
node bin/aris.mjs advance [--force]
node bin/aris.mjs gate <name> [--json-args '{...}']       # 生成门禁命令
node bin/aris.mjs gate <name> --record <exit> [--out f]   # 回填结果
node bin/aris.mjs set-artifact <字段> <路径|->

# 审查
node bin/aris-review.mjs --project <项目> --slots          # 看槽位配置
node bin/aris-review.mjs --project <项目> --slot 1 --dry-run
node bin/aris-review.mjs --project <项目> --collect        # 收件
node bin/aris-review.mjs --project <项目> --slot 1 --via codex --gate S5_experiments
node bin/aris-review.mjs --project <项目> --slot 1 --via codex --gate S1_formal --model gpt-6-luna --effort low

# 论文与引用
node bin/paper-build.mjs --project <项目> --all --out build --json
python .dsh/skills/aris/tools/cx_verify.py --project <项目> --json

# 测试（首次会自动建 venv）
.dsh\skills\aris\tests\run-tests.cmd
```

---

## 9. 故障判读

| 现象 | 真相 | 处理 |
|---|---|---|
| 会话里红色「任务已停止 · DSH 进程在本轮完成前退出」 | **误报**：真正执行者是另一个 headless 进程，桌面端看到未闭合的 step 就套模板 | 不用管；看面板状态与 `runtime.json` 才准 |
| 面板显示「已启用」但一直不起轮 | 节拍器被异常打断（如插件回调抛错） | 看 `.dsh/logs`、面板「运行一次」试跑；重启 DSH |
| 新会话不出现在侧栏 | headless 写共享存储但不通知已打开的界面 | Ctrl+R 或切一下工作区；会话标题格式 `<时间> · Dsh_Aris · <流水线>` |
| `Kimi 未取件 N 分钟` | Kimi 应用关闭 / 定时任务没建（本机没有 Windows 计划任务） | 打开 Kimi 或手动收件 |
| 编译报 `U+3010` | EN 稿里有中文占位 `【TODO-EN】` | 属于 S6 待写内容 |
| `ops_bash` 报 `EXECUTOR_UNAVAILABLE` | 之前的后台作业留下硬链接树 | 完全退出 DSH 后 `dsh-ops cache reclaim --kind exec-tree --all-hosts-stopped --yes` |
| 微信/同步盘写入报 `EIO 1175` | 云占位文件被回写 | 用 Node 写盘并回读校验，重试一次即可 |
| `Aris_Wiki` 说「需人工」但 `Aris_Dsh` 显示在跑 | 0.1.0 的旧口径（看 `.aris/reviews` mtime 判人工）；0.2.0 起与 dsh 同源 | 升级到 0.2.0；仍出现就看阻碍那条的类型 |
| 阻碍里的按钮点了没反应 | 0.1.0 把动作渲染成纯文本 span | 0.2.0 起 `看日志 / 看门禁 / 看样子` 直接生效；`打开邮箱队列 / 看预算` 是**设计降级**：复制路径并提示去 `Aris_Dsh` |
| GPT 外审报「找不到 codex.exe」 | `Get-AppxPackage OpenAI.Codex` 查不到安装位，或应用被卸载/改名 | 面板会显示解析结果；确认 ChatGPT 桌面端还在，必要时把路径写进环境或重装应用 |
| GPT 外审报 `SEC_E_NO_CREDENTIALS` / 连不上 | 沙箱内 HTTPS 拿不到凭据，或代理没开 | 确认 `127.0.0.1:7897` 在监听；codex 由插件宿主 spawn，不走 tool 沙箱 |
| GPT 外审报 `orchestrator_helper_exit_nonzero` | `read-only`/`workspace-write` 起不了 shell 辅助进程 | 默认档只喂正文就够；真要读工程才切 `danger-full-access` |
| 「连续 3 次失败，已自动停摆」 | 预算文件里失败计数到顶 | 面板恢复后重新派单；先看最近调用里的错误 |
| 报「模型 X 不在清单内」 | codex 升级后型号改了名（5.6→6 有 upgrades 映射） | 面板「环节→模型」重选；**不要**让它静默回退到默认型号 |

---

## 10. 边界与安全

- **只读 vs 写**：`Aris_Wiki` 全链路只读（没有任何写路径）；写操作只发生在 `Aris_Dsh`（启停、门禁、编译、设置、收件）
- **不伪造**：面板从不生成裁决，只展示 `state.json` / `reviews/*.json` 的既有记录
- **同步盘**：项目与邮箱在 `SynologyDrive` 上，写它需要提权；`.aris` 状态目录可用 `--state-dir` 留在本地工作区
- **会话**：只读查看器不会写入会话文件；运行中的会话**不要在里面发消息**，会和 headless 抢写
- **删除**：一律走 `node bin/recycle.mjs`，回收站或 `archive/trash/`，不做永久删除

---

## 11. 术语表

| 词 | 含义 |
|---|---|
| 轮 / wake / round | 一次子进程执行（几十分钟、几十步） |
| 步 / step | 一轮里的一个模型回合（含工具调用） |
| 原子块 | 一轮只做一件可验证的小事，不做半成品 |
| 门禁 / gate | 阶段之间的硬检查点，需人裁决或自动判据通过 |
| 阻碍 / blocker | 当前进退两难的原因（等回件、需人工、门禁未裁、错误）；分严重度 `error/warn/info` |
| 需人工 | 只有 `state.block`、`blocked_on_user`、门禁未过才算；流水线在跑但等审稿回件**不算** |
| 等回件 / 在途审稿 | 邮箱里已发、回来的 `in/<base>.request.md` 还在的请求数；超阈值（max(30, 2×Kimi 周期)）只告警 |
| 租约 / lease | `gate.py` 的 A/B 互斥锁，防止两个执行者同时改状态 |
| 交接 / handoff | `handoff.mode`：由 DSH 起轮还是由 Kimi 起轮 |
| 槽位 / slot | 审稿通道编号；`tier` 是审查深度档（L1/L2） |
| 预算 / budget | 单轮调用数与上下文上限，触顶强制收尾 |

---

*本手册随面板一起演进。改代码时若动了标签或字段含义，记得回来改这里。*
