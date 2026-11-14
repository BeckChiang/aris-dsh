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

---

## 4. `Aris_Wiki` 面板（读面，全链路只读）

顶部三个页签：**计划 / 产物 / 文档**，右上只有一个「刷新」——流水线的选择被收进各自页签内部。

### 4.1 计划页

**默认是总览（卡墙）**：3 个 KPI（在跑 / 累计 / 需人工）+ 每条流水线一张卡：

- 卡片头：状态点 + 名称 + 状态徽章 + `阶段 x/y`
- 中间：11 段阶段 rail（绿=已完成、橙=进行中、灰=待做），**可点**，点哪段就打开那条流水线并定位到该阶段
- 再下：上下文与步数两条进度
- 页脚：`轮 N · ¥X · 门禁 a/b · 阻碍 n · 下轮 时间`
- 有需人工项时卡片左侧有红条

**点卡片进入单条详情**，头部左上角有 **「← 返回计划列表」**。详情页自上而下：

1. 流水线头：名称、状态、当前阶段与最近回合、轮数/费用/今日、下轮时间、「需人工」标记
2. 图例：共 N 阶段（完成 / 进行 / 待做）；说明「步骤 = 阶段内执行记录，编号『阶段序号.步序』」
3. 阶段 rail（可点，选中描边）
4. 四个门禁卡：id、状态（已裁/待做）、裁决词、判据、实测值
5. **总计划**：11 个阶段全部列出，点任意一行展开/收起，可「展开全部 / 收起全部」
6. 阶段展开区：
   - **进入 / 退出条件**（来自 `pipeline/PIPELINE.md`）+ 备注
   - **计划工作项**：PIPELINE.md 里该阶段的 `- [ ]` 条目
   - **已完成步骤 N**：编号 `5.3` + 状态机 id 徽标（如 `S4a.1a`）+ 摘要（悬停看全文）
   - **待做步骤 N**：同上，另附产出路径
7. **阻碍 N**：每条含严重度（红/橙/灰）、类型、说明、证据、建议动作；`需人工` 标记表示必须人来裁决
8. **进展时间线**：轮次 / 审查回件 / 门禁裁决三类事件按时间倒序，左侧色条=严重度（绿通过、橙待处理、红失败），下方一行是细节（RESULT 首句、审稿人、判据）
9. **最近 8 轮执行**表：轮次、开始、步数、成本、结果（含 exit）

阻碍是怎么判出来的（8 条规则，`lib/plan.mjs`）：
`state.block` → 严重；`runtime.waiting>0` → 等回件；`gateReason` → 门禁阻塞；`lastError` 或连续错误 ≥2 → 出错；最近一条 review 未推进 → 待处理（>60 分钟标需人工）；门禁 pending → 提示；上下文 ≥80% → 警告；从未跑过 → 提示。

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
| 阶段的进入/退出条件与计划项 | `<项目>/pipeline/PIPELINE.md` |
| 预算阈值 | `<项目>/pipeline/budget.json` |
| 会话（提问/工具/结果） | `~/.dsh/sessions/--<工作区转义>--/session-<uuid>/session.v4.jsonl.zstd` |
| 论文与图 | `paper2/en`、`paper2/cn`、`paper2/figures`、`build/main.pdf` |

---

## 6. 审查闭环（Kimi 3.1 Pro）

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

---

## 7. 常用剧本

**启动一条流水线**
`Aris_Dsh → 流水线 → 启用`（或「运行一次」马上跑一轮）→ 看摘要行变「正在运行」→ 用「会话」旁观。

**暂停而不留半截**
点「停止」（等本轮跑完），不要「强制停止」。收尾后摘要变「已停止」。

**本轮卡在等人**
状态「等待人工」→ 展开卡片看阻碍与最后一条 RESULT → 在 Kimi 或对话框里裁决 → 若需要把结论写回 state，用「提交并批准重启」。

**审稿一直不回来**
看 `Kimi 未取件 N 分钟` → 确认 Kimi 应用是否开着、定时任务是否启用 → 或手动把 `out/` 的回复放进邮箱后点「检查回复」。

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
| 阻碍 / blocker | 当前进退两难的原因（等回件、需人工、门禁未裁、错误） |
| 租约 / lease | `gate.py` 的 A/B 互斥锁，防止两个执行者同时改状态 |
| 交接 / handoff | `handoff.mode`：由 DSH 起轮还是由 Kimi 起轮 |
| 槽位 / slot | 审稿通道编号；`tier` 是审查深度档（L1/L2） |
| 预算 / budget | 单轮调用数与上下文上限，触顶强制收尾 |

---

*本手册随面板一起演进。改代码时若动了标签或字段含义，记得回来改这里。*
