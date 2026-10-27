# 2nd-brain

[한국어](README.md)

<img src="docs/brand/lockups/2nd-brain-horizontal-light.svg" alt="2nd-brain" height="64">

A desktop app (macOS arm64, Windows x64) that lets non-developers build a personal knowledge wiki with an AI
coding agent — connect Claude or Codex, create a vault, clip material, turn it into wiki pages, and approve
each page, all from one app. The Korean [README](README.md) is the full feature reference; this page is a summary.

## Features

- **Getting started** — the app installs the Claude or Codex CLI for you, signs you in to GitHub, and creates
  a vault (a git repository) from a template. No terminal needed.
- **Clipping** — drop in text, URLs, PDF, Hangul (.hwpx/.hwp), Excel, Word and PowerPoint files; the app
  extracts text and tables into Markdown under `Clippings/`.
- **Wiki-fy** — the AI agent reads your clippings and writes wiki pages on a work branch. You review each page,
  keep or revert it, and merge the result. Every change in the vault is a git commit.
- **Chat** — ask questions about your vault; answers cite pages and can be partially undone.
- **Editor and graph** — live-preview Markdown editor, tabs and split view, keyword search, and a page graph.
- **Team vaults** — share a vault through a private GitHub repository; pull teammates' changes and open review
  requests for your edits.
- **Screen language** — Korean (default) and English.

No server of ours: your AI subscription, GitHub account and files stay yours.

## Development

Requirements: Node 22, pnpm 10.

```sh
pnpm install
pnpm dev        # development window
pnpm lint
pnpm test       # vitest
pnpm test:e2e   # build, then Playwright
pnpm build:mac  # mac arm64 dmg
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request checklist and [CLAUDE.md](CLAUDE.md) for architecture notes.

## License

[MIT](LICENSE)
