# @local/dsh-aris

DSH 客户端插件：在 Web UI 的侧栏加一个「ARIS 流水线」按钮，点开是一个中央面板，同时监控多条在跑的 ARIS 流水线。

面板**不新建任何存储**，所有数字都从 ARIS CLI 已经写好的文件里读：

| 来源 | 用途 |
| --- | --- |
| `<stateDir>/state.json` | 阶段、轮次、门禁、产物、最近审查、下一步建议 |
| `<stateDir>/reviews/*.json` | 审查记录条数（与 state 里记录的取较大值） |
| `<邮箱>/queue.md` | `PENDING: N` 与待处理请求清单 |
| `.dsh/logs/aris-collect.log` | 最近一次收件的输出 |
| `.dsh/aris-projects.json` | 中央注册表；缺省时兜底扫 `.aris/*` 与 `work/*/.aris` |
| `.dsh/aris-dashboard.json` | 面板配置：`mailbox`、`pollMs`、可选 `nodePath`/`projectRoots` |

## 动作（白名单）

面板上的按钮只映射到这六个受控动作，参数由宿主侧拼成 argv，客户端无法传入任意命令：

| 按钮 | 实际执行 |
| --- | --- |
| 收件 | `node bin/aris-review.mjs --collect-all --mailbox <邮箱>` |
| 重算队列 | `node bin/aris-review.mjs --queue --mailbox <邮箱>` |
| 执行门禁 | `node bin/aris.mjs gate <name> --state-dir <dir> --json-args <json>` |
| 登记产物 | `node bin/aris.mjs set-artifact <field> <path> --state-dir <dir>` |
| 推进阶段 | `node bin/aris.mjs advance --state-dir <dir>`（门禁全 PASS 才可点） |
| 刷新 | 只重新读取状态快照 |

## 配置

工作区 `.dsh/aris-dashboard.json`：

```json
{
  "workspaceRoot": "<WORKSPACE>",
  "mailbox": "<SYNC>/aris-mailbox",
  "pollMs": 5000
}
```

- `mailbox` 是唯一必填项，缺省时面板显示「邮箱未配置」，收件按钮置灰。
- 工作区根默认从插件自身位置推导（`<ws>/plugins/dsh-aris` → `<ws>`），装在别处时用 `workspaceRoot` 或 bundle config 的 `workspace` 覆盖。

## 安装

```bash
# 在工作区根装进 DSH profile（一次即可，全 profile 生效）
# 用 plugin_manager install_bundle，target 是包目录绝对路径
```

装完重启 DSH（或刷新页面），侧栏出现「ARIS 流水线」。

## 结构

```
index.js         宿主半边：/api/dsh-aris/state 与 /api/dsh-aris/action 两条路由
client.js        客户端半边：sidebar.panellist 图标 + main 面板
lib/collect.mjs  只读快照（无 spawn、无写盘）
lib/actions.mjs  白名单动作 → argv，spawn 受控执行
cordis.patch.yml 插入 aris 插件
```
