<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockups/2nd-brain-horizontal-dark.svg">
    <img src="docs/brand/lockups/2nd-brain-horizontal-light.svg" alt="2nd-brain" height="72">
  </picture>
</p>

<h3 align="center">A personal wiki the AI writes and you approve</h3>

<p align="center">
  Drop in your material, the AI turns it into wiki pages, and you review them page by page.<br>
  A desktop app: no terminal, no git, no Obsidian setup.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-FF8A3D?labelColor=20242C"></a>
  <img alt="macOS arm64 · Windows x64" src="https://img.shields.io/badge/macOS_arm64_·_Windows_x64-20242C?labelColor=20242C&color=20242C">
  <img alt="Claude Code · Codex" src="https://img.shields.io/badge/engine-Claude_Code_·_Codex-FF8A3D?labelColor=20242C">
  <a href="README.md"><img alt="한국어" src="https://img.shields.io/badge/README-한국어-20242C?labelColor=20242C&color=20242C"></a>
</p>

<p align="center">
  <img src="docs/media/graph-growth.gif" alt="A 3D graph of a wiki growing from a single point to 2,359 pages along its links" width="860">
  <br>
  <sub>The graph's <b>growth replay</b>: the wiki grows from one point to the whole, following its real links. (Captions in the clip are Korean.)</sub>
</p>

---

## What it is

Connect Claude or Codex, drop in material, and approve the pages the AI writes one by one. The wiki you end up with is
linked, drawn as a graph, and ready to search and ask about. The Korean [README](README.md) has the full feature reference.

```mermaid
flowchart LR
  A["Collect<br/>text · URL · PDF · Hangul · Excel · Word · PowerPoint"] --> B["AI wiki-fies<br/>commits on a work branch"]
  B --> C{"You review<br/>page by page"}
  C -->|approve| D["Merged into the wiki"]
  C -->|reject| E["Reverted"]
  D --> F["Read · search · graph · chat"]
```

- **No terminal.** The app installs the Claude or Codex CLI and walks you through sign-in. Nothing else to install first.
- **Your accounts, no server.** It runs on your own AI subscription and GitHub account; this project runs no server, subscription or billing.
- **The vault is a git repository.** Every change is a commit you can undo, and the vault keeps working in Obsidian without the app.
- **Only approved pages enter the wiki.** Wiki pages the AI makes need your approval. Your own notes and plans are written at once and can be undone any time.
- **Teams too.** One GitHub sign-in lets you push, pull and open review requests (PRs) against a team repository.
- **Korean and English** screens, switchable in settings.

## Screens

### Read and write

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/en-doc-dark.png">
    <img src="docs/media/en-doc-light.png" alt="File tree on the left, a wiki document in the middle, chat on the right" width="860">
  </picture>
</p>

File tree, document, chat. Documents are a live-preview editor, so you read and edit in one place, and hovering a `[[link]]` previews that page.
In the chat on the right you ask for things in plain words ("Create today's note"); answers land as files with an undo card.

### Find

<p align="center">
  <img src="docs/media/en-search.png" alt="Keyword search results with highlighted snippets" width="860">
</p>

Keyword search (BM25, title-weighted, Korean partial matching) finds documents by content and files such as PDFs and images by name.

### Graph

<p align="center">
  <img src="docs/media/en-graph.png" alt="A 3D graph of pages linked by wikilinks" width="860">
</p>

A 3D graph you can turn around. The more links a page has, the bigger and brighter it looks. Point at a node to keep only its neighbors; click it to open that page beside the graph.

> These screens use a sample vault of about 80 pages of AI-agent notes.

## Getting started

**Installers** — download the mac `.dmg` or the Windows `setup.exe` from [Releases](https://github.com/lemoncloud-io/2nd-brain-app/releases). The first run asks one question ("What do you want to organize?"), connects your AI and creates a vault. GitHub sign-in can wait.

**From source** — Node 22, pnpm 10.

```sh
pnpm install
pnpm dev
pnpm lint
pnpm test       # vitest
pnpm test:e2e   # build, then Playwright
pnpm build:mac  # mac arm64 dmg
```

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md). Architecture notes are in [CLAUDE.md](CLAUDE.md), product assumptions in [PRODUCT.md](PRODUCT.md), design rules in [DESIGN.md](DESIGN.md), and past decisions in [`docs/decisions/`](docs/decisions) (Korean).

## License

[MIT](LICENSE)
