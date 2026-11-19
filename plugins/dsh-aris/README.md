# @local/dsh-aris

DSH 客户端插件：侧栏「ARIS 流水线」按钮 → 中央面板，同时监控并操作多条在跑的 ARIS 流水线。

## 五个页签

| 页签 | 作用 | 分级 |
| --- | --- | --- |
| 总览 | 8 格 KPI、今日轮次 / 成本横条、全部流水线总表；点行进详情 | L0 |
| 流水线 | 列表 + 单条独立详情（两栏：现在 / 计划项 / 轮次历史 ｜ 总计划 / 阶段树 / 每轮指标 / 结论分布 / 最近事件）+ 全部写操作 | L0–L3 |
| 产物 | 主论文卡、目录编译状态、引用体检、文件表 + 预览（文本 / 图片 / **PDF 内嵌**）；左表与预览撑满页签，可拖分隔条 | L0 / 编译 L1 |
| 审核 | Kimi 邮箱与 ChatGPT 后台两组通道、待人工裁决、稿件列表（按流水线 chips 过滤）、审核锁、结论 / 通道分布两张环形图 | 至 L2 |
| 设置 | 节拍、邮箱、工作区、余额上限等面板配置 | L1 |

详情页与产物页都是「点一行 → 独立视图」，顶部可返回；多流水线用页内 chips 直接切换，不必回总览。

## 数据来源（不新建存储）

| 来源 | 用途 |
| --- | --- |
| `bin/lib/aris-control.mjs` 的 `snapshot()` | 面板唯一快照：流水线、计划、历史、门禁、审核、余额、额度 |
| `<项目>/.aris-run/runtime.json` | 本轮状态、pid、下次时间、错误 |
| `<项目>/.aris-run/costs.jsonl`、`runs/<runId>/meta.json` | 每轮费用、步数、结论 |
| `<项目>/.aris/reviews/*.json` | 审查裁决、分数、MUST 条数 |
| `<项目>/pipeline/state.json`、`PIPELINE.md`、`budget.json` | 阶段、计划项、门禁、预算 |
| `.dsh/aris-projects.json`、`.dsh/aris-dashboard.json` | 流水线注册表、面板配置、审核线路 |

余额与 GPT 额度是后端缓存读数：面板显示「N 分钟前」，过期加「可能过期」；写动作成功后前端强制重拉一次快照。

## HTTP 路由（宿主半边）

```http
GET  /api/dsh-aris/state?name=<流水线>     -> 全库快照
POST /api/dsh-aris/action                  -> { action, input }，白名单受控
GET  /api/dsh-aris/artifacts?name=<流水线> -> 产物扫描结果
GET  /api/dsh-aris/file?name=<流水线>&path=<rel>  -> { mime, text | dataUrl }（PDF 也走 dataUrl）
GET  /api/dsh-aris/session?name=<流水线>   -> 本轮 headless 会话（只读） |
```

## 动作白名单（`ACTIONS`，`index.js:58`）

36 个动作，全部经 `control()` 或专用分支执行，客户端传不了任意命令：

- 流水线：`add` `remove` `start` `stop` `run` `tick` `resume` `recover` `runtime.reset`
- 只读 / 诊断：`refresh` `logs` `prompt.get` `guard.test` `balance.check` `codex.state` `codex.models` `codex.session`
- 配置：`prompt.set` `prompt.reset` `settings.save` `limits.save` `handoff.set` `workspace.register` `workspace.list` `workspace.unregister` `task.delete`
- 审核：`mailbox.collect` `human.reply` `review.route` `lease.release` `kimi.prompt` `codex.save` `codex.run` `sessions.name` `sessions.retitle`
- 产物：`paper.build`

## 安装

```bash
# 用 plugin_manager install_bundle，target 是包目录绝对路径
# <工作区>/plugins/dsh-aris
```

装完刷新页面即可；只改 `client.js` 刷新生效，改 `index.js` / `lib/*.mjs` 需 `plugin_manager` 关再开。

## 结构

```
index.js              宿主半边：5 条路由、动作白名单与受控执行、退出确认守卫
client.js             客户端半边：侧栏图标 + 五页签面板（样式在文件前段）
lib/collect.mjs       只读快照
lib/actions.mjs       白名单动作 → argv
lib/artifacts.mjs     产物扫描（文件表 / 预览取内容）
lib/session-view.mjs  headless 会话读取与渲染
locale/*.json    文案
cordis.patch.yml 插入 aris 插件
```
