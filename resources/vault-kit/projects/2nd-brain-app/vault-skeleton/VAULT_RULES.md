# Vault Rules

This vault is a personal AI Second Brain created by 2nd-brain Desktop and readable in
Obsidian.

These rules are model-neutral. Use them with Claude, Codex, or any other LLM that can read
and edit this vault. Session read order and vault-root resolution are in `CLAUDE.md`; this
file is the contract layer.

## Directory Contract

| Directory | Role |
| --- | --- |
| `Clippings/` | New source inbox |
| `raw/` | Processed source originals. Append-only. Contract: `docs/raw-layout.md` |
| `wiki/` | Concept articles, one concept per file |
| `wiki/topics/` | Topic index pages |
| `outputs/` | Durable answers and reports; per-run logs in `outputs/runs/` |
| `templates/` | Note and output templates |
| `docs/` | Vault contracts |

## Core Rules

- `raw/` is append-only: no content edits, no renames, no deletions. Filename normalization
  and ingest gates: `docs/raw-layout.md`.
- Preserve source provenance. See § Note Contracts.
- Prefer updating existing wiki notes over creating duplicate notes.
- Use matching files in `templates/` before inventing a new note or output structure.
- Use English kebab-case filenames for wiki notes.
- Write new wiki article body prose in Korean. See § Language Convention.
- Use `[[wikilinks]]` for related wiki concepts. Do not use wikilinks for raw source files.
- Use Obsidian aliases as `[[note-slug|Alias]]`; do not escape the pipe character — except
  inside a Markdown table cell, where escaping it is required (`[[note-slug\|Alias]]`).
- Mark unsupported or time-sensitive claims as `needs-update`.
- Remove personal data (phone/ID numbers), credentials, and health content at ingest time;
  keep role-level descriptions only.
- `wiki/VAULT_MEMORY.md` is capped at 8 KB (`wc -c`) and holds static state and pointers
  only — never a per-run log or counter. Each run's record is a run-log note at
  `outputs/runs/YYYY-MM-DD-<kind>-<author-slug>.md` (template `templates/run-log.md`,
  frontmatter `summary` ≤ 200 bytes).
- Runtime state (`.locks/`) is not tracked.

## Note Contracts

`templates/` holds the frontmatter and section contract for every note type — read the
matching template rather than a copy of it here. The rules below are the parts templates
cannot carry.

**Enums**

- wiki `type`: `concept` · `tool` · `model` · `framework` · `pattern` · `protocol` ·
  `topic` (reserved for `wiki/topics/` pages only)
- wiki `status`: `stub` (under 350 words) · `draft` · `complete` · `needs-update`

**Frontmatter links** — in any `related` or `sources`, vault Markdown notes use quoted
wikilinks (`"[[path|Alias]]"`). `sources` keeps raw paths and URLs as strings
(`"raw/<file>.md"`).

**`next_action`** — wherever a note's frontmatter carries it, it holds one action per string:
a quoted scalar for one action, a block sequence (one `- "..."` item per line) for more, or
`""` for none. Each item is at most 300 bytes and never joins clauses with `;` — detail goes
in the body. Inline flow sequences and block scalars are not used. `vault_verify.py` checks
this on every tracked Markdown file outside `raw/` and `archive/`.

**Topic pages** — body is a one-line list of related wiki articles with `[[wikilinks]]`. Set
`up: "[[topics/parent-topic]]"` except on root topics. Full topic list → `wiki/TOPIC_MAP.md`.

## Language Convention

Wiki article body prose is written in Korean. Keep in English inside the body: section
headings, frontmatter keys and values, proper nouns and product/tool/model names, and inline
code, commands, file paths, and CLI flags.

## Workflows

Ingest runs in the app lane of the `vault-ingest-agent` job spec: the agent commits its
result on a work branch `app/ingest-<YYYY-MM-DD>` and never pushes or merges. The user then
approves or rejects each wiki page in 2nd-brain Desktop, and the app cleans up rejected pages
deterministically, runs `vault_verify.py --lane ingest`, and merges the work branch into the
default branch only when verification passes. Page rejection cleanup contract:
`vault-ingest-agent.md` § 페이지 거절 정리 (shipped inside the app).
