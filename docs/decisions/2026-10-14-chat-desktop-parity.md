---
type: decision
title: 채팅을 Claude Code 데스크탑처럼 — 도구 제한 해제·승인 창·권한 모드·도구 진행 표시
date: 2026-10-14
sources:
  - src/shared/chat-permission.ts
  - src/shared/ipc/engine.ts
  - src/shared/ipc/chat.ts
  - src/main/engine/engine.ts
  - src/main/engine/cli-process.ts
  - src/main/engine/claude-engine.ts
  - src/main/engine/create-engine.ts
  - src/main/chat/chat-service.ts
  - src/main/ipc/chat-handlers.ts
  - src/preload/index.ts
  - src/renderer/src/views/chat/use-chat-session.ts
  - src/renderer/src/views/chat/permission-card.tsx
  - src/renderer/src/views/chat/composer-assist.tsx
  - src/renderer/src/views/chat/chat-message-list.tsx
  - src/renderer/src/lib/tool-text.ts
  - docs/decisions/2026-10-14-chat-engine-web-tools.md
---

## Context

`2026-10-14-chat-engine-web-tools.md` 는 채팅에 웹 조회·검색만 열고 셸은 열지 않았다. 사용자 범위 답
(2026-10-14) "전부 + 승인 창": Claude Code 데스크탑에서처럼 Bash·gh·서브에이전트·사용자 설정의
MCP/스킬까지 쓰고, 허용 범위 밖 호출은 승인 창에서 묻고, 권한 모드와 도구 진행 표시를 둔다.

## Decisions

| Choice | Options | Selected | Rationale |
|--------|---------|----------|-----------|
| 승인 왕복 구현 | A CLI stream-json 제어 줄 직접 · B `@anthropic-ai/claude-agent-sdk` | A | 실측으로 동작 확인. 앱이 이미 사용자 PC 의 CLI 를 찾아 띄우고, SDK 는 5.5MB + 플랫폼별 바이너리를 앱에 더 싣는다 — **2026-10-23 대체**: 채팅은 SDK 로 대화마다 켜 둔다(`2026-10-23-chat-keeps-session-open.md`) |
| 넓히는 실행 | 노트를 쓸 수 있는 Claude 채팅만 · 읽기 전용 답까지 | 노트 쓸 수 있는 실행만 | 읽기 전용은 위키화 중·다른 대화가 쓰는 중이라 보관함을 못 건드리는 때다. 셸을 열면 그 약속이 깨진다 |
| `note-run` 사후 판정 | 유지 · 폐기 | 유지 | 보관함 규칙(위키 페이지는 승인 화면으로만 바뀐다)은 승인 창과 다른 층이다. 셸을 쓴 실행은 이미 Codex 에서 같은 판정을 탄다(`record.shell`) |
| 기본 권한 모드 | 물어보기 · 파일 고치기는 바로 | 물어보기 | 사용자는 CLI 를 모른다(`PRODUCT.md`). 묻지 않는 쪽은 고른 사람만 |
| 모드 값 | CLI 여섯 개 전부 · 셋 | 셋(manual·acceptEdits·bypassPermissions) | plan·dontAsk·auto 는 화면에 설명할 말이 없다 |
| 모드 저장 자리 | 설정 파일 · 입력칸 상태(질문마다 실어 보냄) | 입력칸 상태 | "위키 빼고 묻기"와 같은 자리·같은 수명. 앱을 다시 켜면 물어보기로 돌아온다 |
| 설정 출처 | project 만 · user,project,local | user,project,local | 사용자 범위 답("사용자 설정의 MCP/스킬 포함") |
| 질문 도구·플랜 모드 | 지원 · 끔 | 끔(`--disallowedTools`) | 답을 `updatedInput` 으로 돌려줄 화면이 없다 |

- **노트 쓰기 Claude 프로필은 도구를 줄이지 않는다.** `--disallowedTools AskUserQuestion,EnterPlanMode,ExitPlanMode` 만
  두고 `--input-format stream-json --permission-prompt-tool stdio --setting-sources user,project,local` 로
  돌린다. 허용 범위 밖 호출은 `control_request(can_use_tool)` 로 와서 채팅 칸의 승인 카드(허용·이 대화에서
  계속 허용·거절)로 답하고, 승인을 기다리는 동안 전체 시간 제한을 세지 않는다. 다른 프로필(읽기 전용 답·선택 영역
  고치기·압축·위키화·점검·초안)과 Codex 인자는 그대로다.
- **"계속 허용"은 이 대화의 메모리에만 둔다.** 설정 파일에 저장하지 않고, 앱을 다시 켜면 권한 모드는 물어보기로 돌아온다.
- **셸의 "계속 허용"은 그 명령만이다**(`src/main/chat/session-allow.ts`). 도구 단위로 기억하면 `git status` 하나를 허용한 뒤
  파일을 지우는 명령까지 묻지 않고 돈다. CLI 가 승인 요청에 실어 보내는 제안 규칙(`permission_suggestions` 의 `git status *` 꼴)이
  있으면 그 앞부분으로, 없으면 그 명령 그대로 기억한다. 앞부분이 같아도 `;`·`&&`·`|`·`$( )`·리다이렉트가 든 다른 명령은 다시 묻는다.
  셸이 아닌 도구(웹 조회·연결 도구 등)는 도구 단위다. 카드 단추도 셸이면 "이 명령은 이 대화에서 계속 허용" 이라고 말한다.
- **화면을 다시 읽어도 기다리던 승인은 잃지 않는다.** 승인을 기다리는 동안 실행은 시간 제한 없이 멈춰 있으므로, main 이 대기 중
  요청을 들고 있다가 대화를 열 때(`loadChat`) 카드를 되살린다. 승인 답은 보낸 창이 연 보관함의 대화에만 쓴다.
- **노트 범위 밖 쓰기는 사람이 승인했어도 되돌린다.** 셸을 쓴 실행은 Codex 와 같은 `record.shell` 판정을 탄다.

## Verified

- 가짜 CLI + 단위 테스트: 허용·거절·멈춤(`engine.test.ts`), 대기 중 시간 제한 정지(`cli-process.test.ts`),
  인자 표(`create-engine.test.ts`), 모드 전달·도구 진행·계속 허용·대기 아닌 id 무시(`chat-service.test.ts`),
  승인 카드·진행 줄·모드 고르기(DOM 테스트).
- 실제 CLI 2.1.296 실측(`/tmp/parity-probe/`): manual 모드에서 거절하면 실행되지 않고 `permission_denials` 가 1이다.
  bypassPermissions 는 묻지 않고 실행한다.
- UI 실측(2026-10-14, 빌드본 + 실제 Claude 2.1.299 + 임시 userData·보관함, 스크린샷 `/tmp/parity-probe/ui-*.png`):
  "셸로 date 실행해 줘" 계열 3턴 — 부작용 명령(`uuidgen > run-id.txt && cat …`)에서 승인 카드가 뜨고
  허용을 누르면 실행돼 답이 나오며, `touch DENY-MARKER` 를 거절하면 파일이 생기지 않고,
  모드를 "전부 바로" 로 바꾸면 카드 없이 바로 실행된다. 승인한 쓰기라도 노트 범위 밖이면
  `note-run` 이 되돌린다(화면의 "쓸 수 없는 곳이라 되돌렸어요: run-id.txt" 카드로 확인).
- 읽기 전용 셸 명령(`date`, `date +%s`)은 CLI 가 묻지 않고 실행한다(manual 모드에서도 `control_request` 가
  오지 않음 — 2.1.299 직접 확인). 승인 카드가 뜨는 것은 부작용 명령부터다. 앱의 버그가 아니다.

## Open — 남은 위험

- **셸이 열린다.** 노트 쓰기 채팅이 사용자 PC 에서 셸 명령을 돌릴 수 있다 — 승인 창과 `note-run` 사후 판정이 막는 층이지,
  명령 자체를 가두는 sandbox 가 아니다(Codex 의 sandbox 와 다르다).
- **사용자 설정의 hooks/MCP 가 앱 채팅에서 돈다.** `--setting-sources user,project,local` 이라 사용자 PC 의 설정·훅·MCP
  서버가 채팅 실행에 실린다. 악의적인 설정이 도구를 더 열 수 있다.
- **"전부 바로" 모드.** 묻지 않고 실행한다 — 고른 사람만 쓰는 모드고 기본값은 물어보기다.
- **`note-run` 사후 판정은 유지된다.** 승인한 쓰기라도 노트 범위 밖이면 되돌린다 — 승인 창이 보관함 규칙을 대신하지 않는다.
- **Codex 는 적용하지 않는다**(`codex exec` 에 승인 왕복이 없다). 질문 도구(AskUserQuestion)·플랜 모드도 끈 채다.
- **읽기 전용 답·선택 영역 고치기·압축에는 넓히지 않는다.**

## Provenance

- sources: 위 frontmatter 와 같다
