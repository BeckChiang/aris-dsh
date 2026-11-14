# DSH 文献取数覆盖（ARIS 技能通用）

> 本文件是 ARIS 上游技能在本机的**取数契约**。凡技能正文写着 Zotero MCP、Obsidian MCP、
> `WebSearch`、`semantic-scholar` 之类的步骤，本机一律改走 `bin/lit.mjs`。
> 上游正文保留不动，作为「没有内核时」的兜底说明。

## 1. 一句话

取数只有一个入口：`node bin/lit.mjs`。它负责多源检索、去重、领域过滤、Zotero 读写、
BibTeX 导出、真伪校验；ARIS 技能只负责**读底稿、写正文**。

## 2. 命令对照

| 场景 | 命令 |
|---|---|
| 主题检索 / 综述底稿 | `node bin/lit.mjs lit "<topic>" --project <项目> [--max 40] [--expand "同义词;变体"] [--year-min 2015] [--import]` |
| 单次检索（只看结果） | `node bin/lit.mjs find "<query>" --sources arxiv,crossref,openalex --max 30 [--out papers.json]` |
| 项目 bib ↔ Zotero 对账 | `node bin/lit.mjs reconcile --bib <refs.bib> --collection "<collection 名>"` |
| 按 bib 缺口补条目 | `node bin/lit.mjs fill --bib-missing <bib-missing.json> --collection "<名>" --import --tags lit-fill` |
| 单文件真伪校验 | `node bin/lit.mjs verify papers.json --out verified.json` |
| 金标准召回评估 | `node bin/lit.mjs eval --gold gold.json --queries queries.json --report recall.json --gaps gaps.md` |
| 库内检索（含中文） | `node bin/lit.mjs zot search "关键词" --limit 20 --json` |
| 导出 BibTeX | `node bin/lit.mjs zot bib --collection "<名>" --no-file --out refs.bib` |

## 3. `lit` 的产物契约

```
<项目>/literature/<slug>/
  papers.json   机器可读：query/sources/retrievedAt/total/scanned/verdict/records[]
  papers.md     人读概览表（年份/标题/作者/来源/引用/DOI/校验）
  review.md     写作底稿：元信息 + 概览 + 逐篇要点（含摘要 520 字）+ 待写小节
```

- `records[].verify = { status, method, confidence, reason }`，由 ARIS `tools/verify_papers.py`
  三层回退产生（arXiv API → CrossRef DOI → Semantic Scholar 标题匹配）。
- `verdict.verdict`：`PASS` / `WARN`（有 transient 失败或待核）/ `BLOCKED`（幻觉率 > 0.2）。
- **写作只允许引用 `papers.json` 里的条目**。需要新条目就重跑命令，不要凭记忆添加。

## 4. 各技能的接法

| 上游技能 | 本机做法 |
|---|---|
| `research-lit` | 先跑 `lit` 出底稿 → 只读 `review.md` 写综述；补充检索再跑 `lit --slug <同名>` 覆盖 |
| `novelty-check` | 用 idea 的 3–5 个关键词各跑一次 `lit`，合并 `papers.json` 做标题级查重；`BLOCKED` 时先剔除未核实条目 |
| `idea-creator` | 方向的文献依据 = `literature/<slug>/review.md`；引用必须能在 papers.json 找到 |
| `citation-audit` | `reconcile` 对账 bib↔Zotero，`verify` 逐条查真；未通过 verify 的按幻觉处理 |
| `paper-writing` | 正文引用从 Zotero 导出的 `refs.bib`（`zot bib`）或 `lit-bibmerge.mjs` 合并结果里取 |

## 5. 环境前提

- **代理**：本机 Clash 在 `127.0.0.1:7897` 时 `lit.mjs` 自动带 `NODE_USE_ENV_PROXY` 重跑；
  关代理/想直连用 `LIT_DIRECT=1`，自定义用 `LIT_PROXY`。
- **Zotero**：本地 API 要 Zotero 在运行且已授权（凭据 `.dsh/lit-local-key.json`）；
  `doctor` 的 `zotero-local-api` 一项为绿才可写入。
- **python**：`verify_papers.py` 用系统 `python`（可用 `LIT_PYTHON` 覆盖）；
  它的 `--input` 必须是**数组**，`{papers:[...]}` 会报 `PaperInput() argument after ** must be a mapping`。
- **中文文献**：arXiv/Crossref/OpenAlex 基本不覆盖，走 `zot search`（库内）或先入库再加 `lit-fill`。

## 6. 已知边界

- Semantic Scholar 无 key 时 429，`verify` 里标题层的条目会落到 `verify_pending`（不算幻觉，但需人工确认）。
- `--import` 只建元数据条目，不抓 PDF；PDF 用 `oa --attach` 或人工补。
- 单测没有：`lit` 的行为靠 `doctor` + 实际检索验证，改代码后至少跑一次 `lit "<已知主题>" --max 5`。

## 7. 跨机同步（换机也要能用）

本机对技能的改动**不能只留在本地**，否则换一台机器安装 ARIS 就拿不到覆盖层。同步目标：

| 位置 | 内容 |
| --- | --- |
| `<WORKSPACE>\.dsh\skills\aris\` | 本机生效的 ARIS（含本文件与横幅） |
| `<SYNC>\ARIS\` | 跨机副本（上游仓库形态：`skills/` 91 个 + 三族变体） |

两处的改动必须一致，重打横幅用同一个脚本（幂等，先删旧块再插新块）：

```bash
node bin/aris-sync-lit.mjs                                        # 本机树
node bin/aris-sync-lit.mjs --tree "<SYNC>\ARIS"
```

跨机副本另外带了 `DSH-LIT.md`（接入说明）与 `tools/lit.mjs`、`tools/aris-sync-lit.mjs`（内核与脚本副本）。
换机安装时按 `DSH-LIT.md` 第 2–4 步做：复制内核到工作区 `bin/`、建只含 mailto 的 `.dsh/lit-env.json`、
把 OpenAlex key 放进用户环境变量 `OPENALEX_API_KEY`，然后跑 `doctor`。

横幅文本是**自包含**的，并且写明「本机没有 `bin/lit.mjs` 时按下文流程执行」，所以在非 DSH 环境里
这四个技能不会因为覆盖层而失效。

## 8. 人工下载兜底（付费墙 / 中文库）

内核拿不到全文时**不要静默跳过**，按这两步走：

```bash
node bin/lit.mjs gaps --project <项目> --collection <名>     # 出 references/download-todo.md
# 人工下载 → 放进 <项目>/references/inbox/
node bin/lit.mjs inbox --dir <项目>/references/inbox --project <项目> --create
```

inbox 用 pdfcheck 认身份：文中主 DOI 优先，退化到标题覆盖率（条目标题 ≥70% 的词出现在 PDF 首页且共享 ≥5 词）。
状态 `attached/created/already/ambiguous/no-match/invalid/error` 写进 `references/inbox-report.json`。
中文 PDF 常无 DOI、标题为中文 → 先 `zot add` 建条目，或人工在 Zotero 里挂。
