# Claude Instructions

Before vault work, read:

1. `VAULT_RULES.md` — directory contract, note contracts, workflows
2. `wiki/VAULT_MEMORY.md` — current state and pointers
3. `wiki/INDEX.md` — canonical wiki article list
4. The matching file in `templates/` when creating a note or output

## Vault Root

`VAULT_DIR` is the vault root. Use the user-provided value when present; otherwise infer it
from the current working directory **only** when `VAULT_RULES.md`, `wiki/`, `raw/`,
`Clippings/`, `outputs/`, and `templates/` are all present. If the root is unclear, ask
before reading or writing. Read and write only under the resolved root.

## Hard Invariants

- `raw/` is append-only. Never edit, rename, or delete files there.
  Contract: `docs/raw-layout.md`.
- `wiki/VAULT_MEMORY.md` is loaded every session and capped at 8 KB (`wc -c`) — bytes, not
  lines. Never append per-run narrative to it. Contract: `VAULT_RULES.md` § Core Rules.

## Gotchas

- Never leave machine-specific absolute paths in vault documents. Prefer relative vault
  paths (`wiki/INDEX.md`, `raw/<file>.md`).
- Source provenance is the string `"raw/<source-file-name>.md"`, not a raw-file wikilink.
- Obsidian aliases are `[[note-slug|Alias]]`. Do not escape the pipe — except inside a
  Markdown table cell, where escaping it is required (`[[note-slug\|Alias]]`); an unescaped
  pipe there splits the cell.
- Use the matching `templates/` file before inventing a note or output structure.

## Workflows

This vault is operated by 2nd-brain Desktop. Ingest runs on a work branch and is merged
only after the user reviews each page in the app — see `VAULT_RULES.md` § Workflows.
