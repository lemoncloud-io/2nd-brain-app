# codex exec --json 녹화본

codex-cli 0.154.0, ChatGPT 로그인, 2026-09-15. 저장소 밖 임시 폴더에서 녹화했다.

- `exec-read-only.jsonl` — `codex exec --json --skip-git-repo-check -s read-only -C <tmp> "<prompt>"` (note.md 를 읽고 한 줄 답)
- `exec-bad-model.jsonl` — 같은 명령에 `-m no-such-model-xyz`, 프롬프트는 stdin(`-`). exit 1
- `exec-resume.jsonl` — `codex exec resume <thread_id> --json --skip-git-repo-check -` (stdin 후속 질문). exit 0

- `exec-workspace-write-git-denied.jsonl` — 새 git 저장소에서 `codex exec --json -s workspace-write -C <tmp> -`(브랜치 만들고 파일 추가 후 커밋하라는 stdin 프롬프트). 파일 추가는 `file_change` 로 되지만 `git switch -c` 가 `.git/refs` 잠금 실패(sandbox 가 `.git` 을 읽기 전용으로 둔다). exit 0, turn.completed
- `exec-workspace-write-add-git.jsonl` — 같은 프롬프트에 `--add-dir <tmp>/.git` 을 더했다. 브랜치 생성·커밋 성공(`[app/ingest-probe …] probe`)
- `codex login status` 는 stdout 을 비우고 `Logged in using ChatGPT` 를 stderr 로 낸다, exit 0

stderr 에는 JSONL 이 아니라 사람용 줄(`Reading additional input from stdin...`)이 나온다.
