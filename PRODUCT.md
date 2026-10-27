# Product

<!-- impeccable:product-schema 1 -->

## Platform

desktop

Electron desktop app. The renderer is a web UI (React + Tailwind), not a native design language.
Ship targets: macOS arm64 and Windows x64 (2nd-brain `projects/2nd-brain-app/design.md` § 4.5).
CI runs on macOS only; Windows gets an installer smoke test (`.github/workflows/installer.yml`).

## Users

- **Primary:** non-developers, both individuals and small teams (customer-company staff included).
  They want a personal knowledge vault without learning Obsidian, the CLI, or git.
  Their day is a loop, not a project: open today's note, see what is still open from yesterday,
  tell the assistant what to write, tick items off where they read them, and wrap the day up.
  Turning material into wiki pages and approving them is the slower second loop around that one.
- **Scale they bring:** a first vault is empty, but a mature one holds hundreds of pages.
  The 232-page `knowledge` testbed vault is the reference. Every surface must stay usable at that size.
  That means filterable lists, an index that completes, and a readable graph.

## Product Purpose

2nd-brain replaces the Obsidian + Claude Code + Hermes setup with one installable app.
The user signs in with their **own** Claude (or ChatGPT) subscription and GitHub account.
From there, clipping, wikifying, approving, reading, searching, asking, and linting all happen by button.

Success (design.md § 12, confirmed 2026-09-15; the daily-note criterion added 2026-09-18):
- Three non-developers (Windows 2, macOS 1) go from install to their **first today note** with no help,
  and to their first approved wiki page with no help.
- On a fresh PC, install to first approved page takes 10 minutes or less.
- All conditions are judged on the Claude engine.

## Positioning

- **No server of ours.** lemoncloud runs no server, subscription, or billing. Every account and all usage belong to the user.
- **The vault contract is the authority.** The app is one client of `VAULT_RULES.md`. The vault keeps working without the app, in Obsidian alone, the CLI, or Hermes.
- **A person approves what the AI made for the wiki and for the team; what it wrote in my own notes and plans lands at once and can be undone at any time.** Generated pages enter the wiki only after someone accepts them; lines a person edits themselves save straight away as `edit: <slug>` commits. Chat writes notes without asking, and only notes: it may create and edit `.md` files under `private/`, `outputs/` and `projects/*/outputs/` (tracked ones become one `note: <slug>` commit), anything it touches outside that is reverted, and every answer that wrote shows a card with open and undo, plus a per-file review that splits the edit into hunks you keep or revert one by one (a revert is an `undo: <slug>` commit). This answers the "I can't control what goes into the wiki" complaint about llm_wiki.
- **Deterministic by default.** Conversion, INDEX, lint, graph, and keyword search are plain code. The LLM only synthesizes.

## Operating Context

- **Vault layout:** `raw/` holds append-only originals. `Clippings/` is the inbox for wikifying. `wiki/` holds the generated pages. `projects/<name>/`, `outputs/`, `areas/` and `docs/` hold the team's working documents — the app reads, searches and edits those too. `VAULT_RULES.md` and templates define the schema.
- **Core flow (daily):** open today's note (the app opens on it) → carry over what is still open from yesterday → tell chat what to write or fix → tick items off in the reader → wrap the day up. Nothing in this loop needs approval, and every write chat makes is undoable from the answer.
- **Second flow (knowledge):** clip (drop a file, paste a URL) → wikify (runs the `vault-ingest-agent` skill on a local work branch) → approve per page, or approve all. Approval merges into the default branch and, when a team repository is connected, opens a pull request there; a rejected page is reverted. Merging that pull request stays with the team on GitHub — the app only opens it. The person's own edits take the same road without wikifying: "팀에 확인 요청" in the sidebar receives team changes first, pushes the un-uploaded edits under an `app/edits-<time>` name and opens a pull request; while that request is open, later edits are added to it.
- **Around the core:** a document reader that saves a checkbox where you tick it and carries a section outline with `n/m` per section, a live-preview editor that reads and writes on one screen (pasted or dropped images land in `attachments/` and ride the same `edit: <slug>` commit as the page that embeds them), editable properties in the reader, template insertion from `templates/`, and "AI로 고치기" on a selection (the proposal sits beside the current text and goes in only when the person accepts it, so saving it is an `edit:` commit); a sidebar with files, tags (frontmatter and inline `#tags`, searchable as `#tag`) and bookmarks kept in Obsidian's own `.obsidian/bookmarks.json`; a left/right split whose right pane reads and edits a second document, a link pane under every page (backlinks, unlinked mentions that become links with one click, and links pointing nowhere that become notes with one click, also listed vault-wide in Lint), Sources, Search (keyword), Graph, Lint (structural + AI; when AI lint finds two pages on one concept it proposes one merged page, which goes in only when the person accepts it — one `edit:` commit that keeps the old title as an alias, fixes links and removes the old file, undoable right after), multi-conversation Chat (which writes daily notes and plans, attaches the open document and any `@`-picked documents to the question, runs `/` commands such as 오늘정리·위키화·점검, and can use MCP servers the person adds and switches on in Settings — chat and note runs only, never wikify or lint). The Deep Research queue was removed 2026-10-13 and stays removed, but since 2026-10-14 chat reads the links in a question and its engine can fetch and search the web on its own (chat and note runs only, never wikify, lint or drafts); since 2026-10-14 the note-writing Claude chat can also run shell commands and the person's MCP/skills, asking first with an approval card (allow · allow for this conversation · deny) unless the person picks "edits" or "all" in the composer, and showing the tool in use while the answer streams; outside material still enters the vault only by clipping a file or a URL.
- **Engine:** the official `claude` or `codex` CLI runs as a subprocess, logged in as the user. The app never reads or stores tokens.
- **Nothing runs in the background — with one stated exception.** Lint and reports start only from a button, so subscription usage is never spent without the user knowing. The exception is receiving team changes: the app fetches and merges the team vault on open, on vault switch, before wikifying and before uploading. While the app is running it also looks at the team vault (on macOS that includes while its window is closed, since closing hides the window and only ⌘Q quits) — fetch only, nothing merged — whenever its window comes to the front (at most every 15 seconds) and every 10 minutes, and the sidebar line (and on macOS the Dock badge) says how many team changes are waiting; one click receives them. It spends no subscription usage (plain git). Before merging it saves unsaved edits to tracked documents as a `save:` commit (the upload screens list the files that will go out). If the vault was left on yesterday's work branch, it returns to the main line when that work has already landed in the team vault (the branch stays), carrying over the `edit:`/`save:`/`note:` commits the app made on that branch, and otherwise merges team changes in place. It never touches a wikify branch awaiting approval, reloads what changed, and says what it received.
- **Adopting an existing Obsidian vault:** opening a folder that has notes but is not a vault offers to use it as one. The app adds only the skeleton files that are missing (a same-named file the person already has is kept; `.gitignore` only gains missing lines), copies the notes into `Clippings/` so wikify works on the copies, and never changes or moves an existing file. It starts git if there is none, or commits only what it added on top of the person's own history.
- **Obsidian stays available:** "Open in Obsidian" is one click away.
- **Testbeds:**
  - `lemon/2nd-brain` may be mutated.
  - `lemon/knowledge` (232 pages) is read-only unless mutation is authorized.

## Capabilities and Constraints

- **Language:** Korean first, English available (Settings > Appearance, or the first-run Start screen).
  - All screen copy, including errors the main process sends, lives in a typed dictionary:
    `src/shared/i18n/ko/*` is the source, `en/*` must match its shape (`docs/decisions/2026-10-23-i18n-typed-dictionary.md`).
  - Vault data (seed files, run logs, commit and PR text, conflict file names) and AI prompt bodies stay Korean
    regardless of the screen language.
- **Naming (Anthropic policy, design.md § 8):**
  - Never use "Claude Code" or "Anthropic" in the product, feature, or company name, or in a logo.
  - Plain prose such as "runs Claude Code" is allowed.
  - The app must never offer its own Claude.ai login, ask for a Claude password, or store Claude
    credentials of its own. Logging in stays the CLI's job.
  - It may read the token the CLI already stored (macOS Keychain, else `~/.claude/.credentials.json`, honouring `CLAUDE_CONFIG_DIR`)
    for one purpose: showing how much of the account's allowance is left. The token stays in main
    process memory, is never written to disk, a log, or an IPC payload, and only the computed
    percentages and reset times reach the renderer (2026-09-21).
- **Telemetry:** crash reports only. They are opt-in, off by default, and stripped of document content and paths. No usage analytics.
- **Window:** 1200×800 by default, 1040×640 minimum.
- **Out of v1:**
  - Chrome web clipper
  - Background or scheduled runs
  - Team sync server
  - Admin policy
  - Local LLMs
  - Linux, macOS Intel, and Windows arm64 builds
- **License:** MIT. llm_wiki (GPLv3) is a UX reference only; copying its code is not allowed.

## Brand Commitments

- **Name:** 2nd-brain.
- **Visual lineage:** colours come from the 2nd-brain logo (Ink `#20242C`, Paper `#F6EFE2`, Spark `#FF8A3D`); type, spacing and motion follow the dou-app desktop system (`DESIGN.md`). Spark is reserved for three uses: the primary action, the highlighter, and body links.
- **Logo:** four quarter discs whose empty centre forms a sparkle; one piece in Spark. The app icon files are `build/icon.{icns,ico,png}`.

## Evidence on Hand

- **App icons:** `resources/icon.png` (dev preview). The packaged app icon files are `build/icon.{icns,ico,png}`.
- **Absent:** no user research results, testimonials, customer names, benchmarks, or pricing exist yet. Do not fabricate them.

## Product Principles

1. **The user owns everything.** Accounts, usage, vault, and history belong to them. The app is a replaceable client.
2. **Approval before generated pages land — but not in my own notes.** The wiki and the team's paths grow only through pages a person accepted; what a person writes themselves, and what chat writes into their notes and plans, saves at once and can be undone at any time.
3. **Plain code first, the LLM for synthesis.** Spend the user's tokens only where judgment is needed.
4. **Legible to a non-developer, capable at hundreds of pages.** Hide git, CLI, and branch concepts behind plain actions without capping the vault's size.
5. **Nothing happens unseen, and nothing is one-way.** No background runs except receiving team changes, which is always reported; progress and cancel are visible, and every AI write says what it touched and offers to undo it.

## Accessibility & Inclusion

- **Contrast:** placeholder and body text hold 4.5:1 (DESIGN.md).
- **Keyboard:** panel resize and navigation must work from the keyboard.
- **Themes:** light and dark are both supported.
- Open decision: no formal WCAG level has been committed.
