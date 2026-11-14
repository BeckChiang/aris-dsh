#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""cx_verify.py — 引用可溯源核验（citation-crosscheck 的内核）

判据边界（重要，别误用）：
  本工具只做「可解析、可溯源」这一层：
    有引用标记 → 能在文献库里对上一条记录 → 该记录带持久标识（DOI / arXiv）
  它**不做**「这条论断是否被论文支持」的语义判断——那属于审查者（Kimi 邮箱）的活。
  因此 `supported` 的含义是「引文指向的文献确实存在且可复核」，不是「论断正确」。

状态（与 citation-crosscheck 技能约定一致）：
  supported    能在文献库对上，且带 DOI/arXiv 持久标识
  weak         对上了，但没有持久标识（只有标题/URL），复核成本高
  unsupported  对不上任何记录（最危险：凭记忆写的引用）
  orphan       文献库里有、正文从未引用（不算错，但值得清理）

用法：
  python .dsh/skills/aris/tools/cx_verify.py --project <dir>
  python ... --project <dir> --papers a.json b.json --claims paper.md --out tmp/
  python ... --project <dir> --json

退出码：0 全 supported/weak；2 存在 unsupported；3 找不到文献库。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path

TEXT_EXT = {".md", ".tex", ".txt"}
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "build", "_cn_r8test"}

# [@key] / [@a; @b] / \cite{a,b} / \citep{a} / \citet*{a}
RE_MD_CITE = re.compile(r"\[@([^\]]+)\]")
RE_TEX_CITE = re.compile(r"\\cite[a-zA-Z]*\*?(?:\[[^\]]*\])?\{([^}]+)\}")
RE_BIB_ENTRY = re.compile(r"@(\w+)\s*\{\s*([^,\s]+)\s*,")
RE_BIB_FIELD = re.compile(r"(\w+)\s*=\s*\{(.*?)\}\s*,?", re.S)


@dataclass
class Record:
    key: str = ""
    title: str = ""
    year: str = ""
    doi: str = ""
    arxiv: str = ""
    url: str = ""
    venue: str = ""
    source: str = ""
    authors: list[str] = field(default_factory=list)

    @property
    def persistent_id(self) -> str:
        return self.doi or self.arxiv

    def surnames(self) -> list[str]:
        """取每条作者名的最后一段当姓（'Mark H. Yim' → 'yim'）。"""
        out = []
        for a in self.authors:
            a = (a or "").strip()
            if not a:
                continue
            last = re.split(r"[\s,]+", a)[-1]
            n = norm_key(last)
            if n:
                out.append(n)
        return out


@dataclass
class Finding:
    file: str
    line: int
    marker: str
    key: str
    status: str
    matched_title: str = ""
    note: str = ""


@dataclass
class Report:
    papers_file: list[str] = field(default_factory=list)
    claims_file: list[str] = field(default_factory=list)
    records: int = 0
    citations: int = 0
    supported: int = 0
    weak: int = 0
    unsupported: int = 0
    orphans: list[str] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# ---------- 归一化 ----------

def norm_doi(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"^https?://(dx\.)?doi\.org/", "", s)
    s = re.sub(r"^doi:\s*", "", s)
    return s.strip().rstrip(".,;")


def norm_title(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def arxiv_from(url: str) -> str:
    m = re.search(r"arxiv\.org/(?:abs|pdf)/([0-9]{4}\.[0-9]{4,5}|[a-z\-]+/\d{7})", url or "", re.I)
    return m.group(1) if m else ""


# ---------- 读文献库 ----------

def load_papers_json(path: Path) -> list[Record]:
    try:
        # utf-8-sig：Windows 侧工具常写 BOM，直接 utf-8 会解析失败
        data = json.loads(path.read_text(encoding="utf-8-sig", errors="replace"))
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] 读不了 {path}: {exc}", file=sys.stderr)
        return []
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = data.get("records") or data.get("papers") or data.get("items") or []
    else:
        rows = []
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        title = str(r.get("title") or "").strip()
        if not title:
            continue
        url = str(r.get("url") or "")
        authors = r.get("authors") or r.get("author") or []
        if isinstance(authors, str):
            authors = [a.strip() for a in re.split(r";|,|\band\b", authors) if a.strip()]
        elif not isinstance(authors, list):
            authors = []
        out.append(Record(
            key=str(r.get("bibkey") or r.get("key") or "").strip(),
            title=title,
            year=str(r.get("year") or "").strip(),
            doi=norm_doi(str(r.get("doi") or "")),
            arxiv=str(r.get("arxivId") or r.get("arxiv") or "") or arxiv_from(url),
            url=url,
            venue=str(r.get("venue") or ""),
            source=path.name,
            authors=[str(a) for a in authors],
        ))
    return out


def load_bib(path: Path) -> list[Record]:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] 读不了 {path}: {exc}", file=sys.stderr)
        return []
    out = []
    for m in RE_BIB_ENTRY.finditer(raw):
        key, body = m.group(2), raw[m.end(): m.end() + 4000]
        fields = {k.lower(): v.strip() for k, v in RE_BIB_FIELD.findall(body)}
        title = re.sub(r"[{}]", "", fields.get("title", "")).strip()
        if not title:
            continue
        out.append(Record(
            key=key,
            title=title,
            year=fields.get("year", ""),
            doi=norm_doi(fields.get("doi", "")),
            arxiv=arxiv_from(fields.get("url", "")) or fields.get("eprint", ""),
            url=fields.get("url", ""),
            venue=fields.get("journal", "") or fields.get("booktitle", ""),
            source=path.name,
            authors=[a.strip() for a in re.split(r"\s+and\s+", fields.get("author", "")) if a.strip()],
        ))
    return out


def discover_papers(project: Path) -> list[Path]:
    found = []
    for pat in ("literature/**/papers.json", "**/papers.json", "references/*.bib", "**/*.bib"):
        found.extend(project.glob(pat))
    seen, out = set(), []
    for p in found:
        if not p.is_file():
            continue
        rp = str(p.resolve())
        if rp in seen or any(part in SKIP_DIRS for part in p.parts):
            continue
        seen.add(rp)
        out.append(p)
    return sorted(out)


# ---------- 读正文 ----------

def iter_text_files(root: Path) -> list[Path]:
    out = []
    for p in root.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in TEXT_EXT:
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        # 本工具自己的产出不能当成正文再扫一遍（否则第二轮会自我污染）
        if p.name.startswith("citation-audit"):
            continue
        try:
            if p.stat().st_size > 2_000_000:
                continue
        except OSError:
            continue
        out.append(p)
    return sorted(out)


def scan_claims(files: list[Path]) -> list[tuple[str, int, str, list[str]]]:
    """返回 (文件, 行号, 原始标记, keys[])，跳过围栏代码块。"""
    hits = []
    for f in files:
        try:
            text = f.read_text(encoding="utf-8-sig", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        in_fence = False
        for lineno, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("```") or stripped.startswith("~~~"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for m in RE_MD_CITE.finditer(line):
                keys = [k.strip().lstrip("@").strip() for k in re.split(r"[;,]", m.group(1))]
                hits.append((str(f), lineno, m.group(0), [k for k in keys if norm_key(k)]))
            for m in RE_TEX_CITE.finditer(line):
                keys = [k.strip() for k in m.group(1).split(",")]
                hits.append((str(f), lineno, m.group(0), [k for k in keys if norm_key(k)]))
    return hits


# ---------- 核验 ----------

def build_index(records: list[Record]) -> dict:
    by_doi, by_arxiv, by_title, by_key = {}, {}, {}, {}
    for r in records:
        if r.doi:
            by_doi.setdefault(r.doi, r)
        if r.arxiv:
            by_arxiv.setdefault(r.arxiv.lower(), r)
        if r.title:
            by_title.setdefault(norm_title(r.title), r)
        if r.key:
            by_key.setdefault(norm_key(r.key), r)
    return {"doi": by_doi, "arxiv": by_arxiv, "title": by_title, "key": by_key}


def match(key: str, idx: dict, records: list[Record]) -> Record | None:
    """四段匹配：DOI → arXiv → bibkey → 标题原文 → 作者+年份兜底。"""
    k = key.strip()
    if not k:
        return None

    d = norm_doi(k)
    if d and d in idx["doi"]:
        return idx["doi"][d]

    a = arxiv_from(k) or (k if re.fullmatch(r"\d{4}\.\d{4,5}", k) else "")
    if a and a.lower() in idx["arxiv"]:
        return idx["arxiv"][a.lower()]

    nk = norm_key(k)
    if nk and nk in idx["key"]:
        return idx["key"][nk]

    # 直接拿标题当引用键（评审人常这么写）
    t = norm_title(k)
    if t and t in idx["title"]:
        return idx["title"][t]

    # 作者-年份式 key：smith2020foo / yim2007modular
    m = re.match(r"([a-z]+)((?:19|20)\d{2})", nk or "")
    if m:
        surname, year = m.group(1), m.group(2)
        cands = [r for r in records if r.year == year]
        if len(cands) == 1:
            return cands[0]
        for r in cands:
            for sn in r.surnames():
                if sn.startswith(surname) or surname.startswith(sn):
                    return r
        # 再兜一层：标题词命中
        for r in cands:
            if surname in norm_title(r.title):
                return r
    return None


def main(argv: list[str]) -> int:
    # Windows 下 python 默认 cp936 输出，而终端按 UTF-8 解码 → 中文变乱码；统一成 UTF-8。
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass

    ap = argparse.ArgumentParser(description="引用可溯源核验（不做语义判断）")
    ap.add_argument("--project", default=".", help="项目根目录（默认当前目录）")
    ap.add_argument("--papers", nargs="*", default=None, help="显式指定 papers.json / .bib")
    ap.add_argument("--claims", nargs="*", default=None, help="显式指定待核验文件（默认扫全项目正文）")
    ap.add_argument("--out", default=None, help="输出目录（默认当前目录）")
    ap.add_argument("--json", action="store_true", help="只输出 JSON 到 stdout")
    ap.add_argument("--allow-empty", action="store_true", help="文献库为空时不报错")
    args = ap.parse_args(argv)

    project = Path(args.project).resolve()
    rep = Report()

    if args.papers:
        paper_files = [Path(p).resolve() for p in args.papers]
    else:
        paper_files = discover_papers(project)
    rep.papers_file = [str(p) for p in paper_files]

    records: list[Record] = []
    for p in paper_files:
        if p.suffix.lower() == ".bib":
            records.extend(load_bib(p))
        else:
            records.extend(load_papers_json(p))
    rep.records = len(records)
    if not records and not args.allow_empty:
        msg = (f"[cx] 找不到可用文献库（扫了 {len(paper_files)} 个候选文件）。"
               f"用 --papers 指定，或先跑 node bin/lit.mjs lit。")
        if args.json:
            print(json.dumps({"ok": False, "error": "no_library", "message": msg,
                              "project": str(Path(args.project).resolve()),
                              "candidates": len(paper_files)}, ensure_ascii=False, indent=1))
        else:
            print(msg, file=sys.stderr)
        return 3

    idx = build_index(records)

    if args.claims:
        claim_files = [Path(c).resolve() for c in args.claims]
    else:
        claim_files = iter_text_files(project)
    rep.claims_file = [str(c) for c in claim_files]

    cited: set[str] = set()
    for path, lineno, marker, keys in scan_claims(claim_files):
        for key in keys:
            rep.citations += 1
            rec = match(key, idx, records)
            if rec is None:
                rep.unsupported += 1
                rep.findings.append(Finding(path, lineno, marker, key, "unsupported",
                                            note="文献库里没有这条，疑似凭记忆写"))
                continue
            cited.add(id(rec))
            if rec.persistent_id:
                rep.supported += 1
                rep.findings.append(Finding(path, lineno, marker, key, "supported", rec.title))
            else:
                rep.weak += 1
                rep.findings.append(Finding(path, lineno, marker, key, "weak", rec.title,
                                            note="无 DOI/arXiv，复核成本高"))

    rep.orphans = [r.title for r in records if id(r) not in cited]

    if rep.records and rep.citations == 0:
        rep.notes.append("正文里没有找到任何引用标记（[@key] 或 \\cite{}），检查是否用了别的引用格式")

    payload = {
        "project": str(project),
        "papers_file": rep.papers_file,
        "records": rep.records,
        "citations": rep.citations,
        "supported": rep.supported,
        "weak": rep.weak,
        "unsupported": rep.unsupported,
        "orphans": len(rep.orphans),
        "findings": [asdict(f) for f in rep.findings],
        "orphan_titles": rep.orphans[:200],
        "notes": rep.notes,
        "boundary": "只验证引用是否可溯源；论断是否被文献支持由审查者判断",
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        return 2 if rep.unsupported else 0

    out_dir = Path(args.out).resolve() if args.out else Path.cwd()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "citation-audit.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = [
        "# 引用核验报告",
        "",
        f"- 项目：`{project}`",
        f"- 文献库：{rep.records} 条（{len(rep.papers_file)} 个文件）",
        f"- 正文引用标记：{rep.citations} 处",
        f"- supported {rep.supported} · weak {rep.weak} · **unsupported {rep.unsupported}** · orphan {len(rep.orphans)}",
        "",
        "> 边界：本报告只回答「引文能否对上真实文献」，不回答「论断是否被该文献支持」。",
        "",
    ]
    bad = [f for f in rep.findings if f.status == "unsupported"]
    if bad:
        lines += ["## unsupported（必须处理）", "", "| 文件 | 行 | 标记 | 键 |", "|---|---|---|---|"]
        for f in bad[:200]:
            rel = f.file.replace(str(project), ".").replace("\\", "/")
            lines.append(f"| {rel} | {f.line} | `{f.marker}` | `{f.key}` |")
        lines.append("")
    weak = [f for f in rep.findings if f.status == "weak"]
    if weak:
        lines += ["## weak（建议补 DOI/arXiv）", "", "| 文件 | 行 | 键 | 标题 |", "|---|---|---|---|"]
        for f in weak[:100]:
            rel = f.file.replace(str(project), ".").replace("\\", "/")
            lines.append(f"| {rel} | {f.line} | `{f.key}` | {f.matched_title[:60]} |")
        lines += ["", f"另有 {max(0, len(weak) - 100)} 处未列出。", ""]
    if rep.orphans:
        lines += ["## orphan（库里有、正文未引用）", ""]
        lines += [f"- {t}" for t in rep.orphans[:50]]
        if len(rep.orphans) > 50:
            lines.append(f"- …… 另有 {len(rep.orphans) - 50} 条")
        lines.append("")
    if rep.notes:
        lines += ["## 提示", ""] + [f"- {n}" for n in rep.notes] + [""]

    (out_dir / "citation-audit.md").write_text("\n".join(lines), encoding="utf-8")

    print(f"[cx] 文献 {rep.records} 条 / 引用 {rep.citations} 处 → "
          f"supported {rep.supported} · weak {rep.weak} · unsupported {rep.unsupported} · orphan {len(rep.orphans)}")
    print(f"[cx] 报告：{out_dir / 'citation-audit.md'}")
    return 2 if rep.unsupported else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
