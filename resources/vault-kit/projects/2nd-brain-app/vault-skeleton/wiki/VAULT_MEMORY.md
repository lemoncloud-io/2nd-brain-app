# Vault Memory

Loaded at the start of every vault operation. Keep this file under 8 KB (`wc -c`) — the budget
is bytes, not lines. 현재 상태와 포인터만 둔다: 정책은 `VAULT_RULES.md`, 실행 이력은
`outputs/runs/`의 run-log 노트가 진실원이다.

## Policy Pointers

- 디렉터리 역할·append-only 경계 → `VAULT_RULES.md` § Directory Contract, `docs/raw-layout.md`
- 노트 규칙·이 파일의 계약 → `VAULT_RULES.md` § Core Rules
- frontmatter enum·provenance·topic 규칙 → `VAULT_RULES.md` § Note Contracts + `templates/`
- ingest 작업 브랜치·페이지 승인 → `VAULT_RULES.md` § Workflows
- 세션 읽기 순서, `VAULT_DIR` 해석 → `CLAUDE.md`

## Current State

- 최근 ingest → `ls outputs/runs/ | tail` (run-log frontmatter `kind`·`processed`·`summary`)
- Canonical lists: wiki 문서 목록 `wiki/INDEX.md`, 토픽 목록 `wiki/TOPIC_MAP.md`

## Open Threads

Vault 수준의 살아있는 액션만, 최대 5개. 닫히면 삭제한다.
