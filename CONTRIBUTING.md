# Contributing

Thanks for your interest in 2nd-brain. Issues and pull requests are welcome.

## Setup

Requirements: Node 22, pnpm 10, macOS (arm64) or Windows (x64).

```sh
pnpm install
pnpm dev
```

## Before opening a pull request

Run the same checks CI runs (`.github/workflows/ci.yml`):

```sh
pnpm build
pnpm lint
pnpm test
pnpm exec playwright test
```

- Branch from `main` and open the pull request against `main`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) with an English subject,
  e.g. `fix(chat): keep scroll position after reply`.
- Screen text lives in the i18n dictionaries (`src/shared/i18n/ko`, `src/shared/i18n/en`), not in components.
  `pnpm lint` fails on stray Korean literals.
- When a change alters a feature, update the matching line in `README.md § 기능` in the same pull request.

Architecture notes, test infrastructure and wording rules are in [`CLAUDE.md`](CLAUDE.md),
design rules in [`DESIGN.md`](DESIGN.md), and past design decisions in [`docs/decisions/`](docs/decisions).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
