# Wiki helper resolution chain (Codex mirror)

Codex-side resolution chain for `research_wiki.py`. Same purpose as the
CC mirror at `../shared-references/wiki-helper-resolution.md`, adapted
for Codex's install layout (the helper may live under
`$ARIS_HOME/references/skills/research-wiki/` for global installs).

## The chain

```bash
ARIS_HOME="$ARIS_HOME:-$(awk -F'\t' '$1=="repo_root"{print $2; exit}' .aris/installed-skills-codex.txt 2>/dev/null)}"
# Global pointer file written by install_aris*/smart_update* at ~/.aris/repo
# (#366) — same file the CC chain reads; covers global copy-installs with
# no project-local manifest.
if [ -z "$ARIS_HOME:-}" ] && [ -f "$HOME/.aris/repo" ]; then
    ARIS_HOME=$(cat "$HOME/.aris/repo" 2>/dev/null) || true
fi
WIKI_SCRIPT=""
[ -n "$ARIS_HOME" ] && [ -f "$ARIS_HOME/tools/research_wiki.py" ] && WIKI_SCRIPT="$ARIS_HOME/tools/research_wiki.py"
[ -z "$WIKI_SCRIPT" ] && [ -f tools/research_wiki.py ] && WIKI_SCRIPT="tools/research_wiki.py"
[ -z "$WIKI_SCRIPT" ] && [ -f $ARIS_HOME/references/skills/research-wiki/research_wiki.py ] && WIKI_SCRIPT="$ARIS_HOME/references/skills/research-wiki/research_wiki.py"
```

After the chain:

- `[ -n "$WIKI_SCRIPT" ]` → helper located, use as `python "$WIKI_SCRIPT" <subcommand>`
- `[ -z "$WIKI_SCRIPT" ]` → helper missing; pick a variant below

## Variant A — hard-fail (for `/research-wiki` itself)

```bash
[ -n "$WIKI_SCRIPT" ] || {
  echo "ERROR: research_wiki.py not found. Set ARIS_HOME, rerun install_aris_codex.sh/smart_update_codex.sh (refreshes ~/.aris/repo), copy to tools/, or use Codex global install." >&2
  exit 1
}
```

## Variant B — warn + skip (for caller skills)

```bash
[ -n "$WIKI_SCRIPT" ] || {
  echo "WARN: research_wiki.py not found. Primary output will still be produced; wiki update is skipped." >&2
}
```

After Variant B, every helper invocation must be guarded:

```bash
[ -n "$WIKI_SCRIPT" ] && python "$WIKI_SCRIPT" ingest_paper research-wiki/ --arxiv-id "$id"
```

## Differences from the CC chain

| | CC | Codex |
|---|---|---|
| Manifest filename | `installed-skills.txt` | `installed-skills-codex.txt` |
| Symlink layer (`.aris/tools/...`) | yes (PR #174 / #192) | no — Codex install model is direct copy under `$ARIS_HOME/references/skills/`, no symlink |
| Global-install layer (`$ARIS_HOME/references/skills/<name>/...`) | no | yes |
| `cd "$(git rev-parse --show-toplevel)"` preamble | yes — guards subdir cwd | optional — Codex usually invokes from project root |
| Global pointer file (`~/.aris/repo`) | yes (layer 4, #366) | yes — same file, read before the `$ARIS_HOME/references/skills/...` global-install layer |

Outcome of both chains is the same: a populated `$WIKI_SCRIPT` env var
or an empty string + warning.

## See also

- [`integration-contract.md`](integration-contract.md) §2 — canonical-helper invariant
- `../research-wiki/SKILL.md` (Codex side) — uses Variant A
- CC-side mirror: `../../shared-references/wiki-helper-resolution.md`
