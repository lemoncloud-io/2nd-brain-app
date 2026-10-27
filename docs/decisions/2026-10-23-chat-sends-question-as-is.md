---
type: decision
title: 채팅은 질문을 그대로 보낸다 — 검색 문서 주입·근거 양 설정을 걷고 앱 규칙은 시스템 프롬프트로
date: 2026-10-23
sources:
  - src/main/chat/prompts.ts
  - src/main/chat/chat-service.ts
  - src/main/chat/cited-refs.ts
  - src/main/engine/engine.ts
  - src/main/engine/claude-engine.ts
  - src/main/engine/codex-engine.ts
  - src/main/ipc/chat-handlers.ts
  - src/renderer/src/views/chat/chat-message-list.tsx
  - src/renderer/src/views/chat/composer-assist.tsx
  - src/shared/chat-defaults.ts
  - src/main/chat/skills.ts (삭제 — `2026-10-23-chat-keeps-session-open.md`)
  - src/renderer/src/lib/chat-commands.ts
  - docs/decisions/2026-10-14-chat-desktop-parity.md
---

## Context

사람 확인(2026-10-23): 채팅에 "hello?" 라고 했더니 볼트 문서를 요약했고, 답마다 질문과 무관한 문서 칩이 붙었다.
같은 볼트를 Claude Code 데스크탑에서 열고 같은 말을 하면 인사만 한다. 도구·권한은 이미 데스크탑과 맞췄지만
(`2026-10-14-chat-desktop-parity.md`), 앱이 질문마다 지시문 한 단락("검색이 뽑아 온 1차 근거로 먼저 답하라")과
키워드 검색이 고른 문서 본문(근거 양 설정, 기본 32K 토큰)을 질문 앞에 붙여 보냈다. 이 주입은 "볼트를 맨손으로 훑으면
토큰이 많이 든다" 는 가정으로 들어왔다(`daa0362`).

실측(2026-10-23, 실제 볼트 `knowledge-wt-hybrid-app-harness`, Claude CLI 2.1.309, sonnet-5-5, 같은 4턴 대화를 조건마다 1회):

| 조건 | "hello?" 답 | 입력 토큰 1→4턴 | 4턴 비용 |
|---|---|---|---|
| 데스크탑식(질문 그대로, 앱 규칙 없음) | 인사 | 4.8만 → 10만 | $1.19 |
| 검색 주입(수정 전) | eureka-hello-api 요약 | 10만 → 114만 | $3.31 |
| 검색 주입(한 글자 토큰 제거·점수 하한 뒤) | eureka-hello-api 요약 | 10만 → 56만 | $2.22 |
| **이 결정(질문 그대로 + 앱 규칙 시스템 프롬프트)** | 인사 | 4.8만 → 10만 | $0.89 |

주입은 토큰을 아끼지 않았다 — 질문마다 예산을 채우고, 이어 묻는 대화(`--resume`)는 앞 턴 주입분을 이력으로 들고 가
턴이 갈수록 불었다. 검색 품질을 고쳐도(한 글자 토큰 제거·1위 대비 하한) 실제 볼트에서는 턴마다 4~11개 문서가 그대로 실렸다.

## Decisions

| Choice | Options | Selected | Rationale |
|--------|---------|----------|-----------|
| 볼트 근거 | 앱 검색이 골라 주입 · 엔진이 CLAUDE.md·읽기 도구로 찾음 | 엔진이 찾음 | 데스크탑과 같은 반응. 위 실측에서 비용도 더 낮다 |
| 앱 규칙 자리 | 질문 앞 · 시스템 프롬프트 | 시스템 프롬프트 | 사용자 메시지는 질문 그대로 남는다. 싣는 자리는 세션 교체 뒤 Claude SDK `systemPrompt.append`·Codex `developerInstructions`(`2026-10-23-chat-keeps-session-open.md`) |
| 턴마다 다른 값 | 시스템 프롬프트 · 질문 앞 한 줄 | 기본과 다를 때만 질문 앞 한 줄 | CLI 가 첫 요청의 시스템 프롬프트를 기록해 resume 마다 그대로 쓴다(`--system-prompt-snapshot` 기본 on, 2.1.309 `--help`). 읽기 전용·승인 대기는 턴마다 바뀐다 |
| 오늘 날짜 | 시스템 프롬프트에 적기 · CLI 가 아는 날짜 | CLI 가 아는 날짜 | 스냅샷이 첫 턴에 굳어 자정을 넘긴 대화에 어제 날짜가 남는다. 실측: 질문만으로 `private/2026-10-23.md` 를 답했다 |
| 근거 양 설정 | 유지 · 삭제 | 삭제 | 주입이 없으면 손잡이가 아무것도 바꾸지 않는다. 남은 `contextBudgetTokens` 키는 읽지 않는다 |
| "위키 빼고 묻기" | 삭제 · 질문 앞 한 줄 | 삭제(설정 단추째) | 검색 필터가 사라지면 엔진에 거는 부탁 한 줄만 남는다 — 지키는지 잴 수 없고 데스크탑에 없다. 사람 확인(2026-10-23) |
| 보고 있는 문서 | 저절로 붙이기(설정 기본값·칩 ×) · `@` 문서 | `@` 문서 | 붙이기는 `@` 하나로 — 입력칸 위 `@ <제목>` 단추와 빈 `@` 목록 맨 위가 보고 있는 문서를 권한다. "지금 보고 있는 문서는 …" 안내 줄도 뺐다. `/` 명령(요약 등)은 보고 있는 문서를 `@` 문서로 싣는다. 사람 확인(2026-10-23) |
| 참조 칩 | 실은 문서 전부 · 읽거나 인용한 것 | 엔진이 Read 한 문서 + 붙인 문서 중 답이 경로로 인용한 것, 답이 끝난 뒤 | 실었다는 것만으로는 답이 기댄 근거가 아니다 |
| `/` 목록 | 앱 명령 6개(오늘정리·요약·위키초안·점검·압축·새대화) · 사용자 스킬 | 사용자 스킬만 | 앱 명령은 정한 문장을 대신 치거나 이미 탭·단추가 있는 화면을 연다. 스킬 이름은 CLI `system/init` 줄의 `skills` 에서 받는다 — `/context` 를 보내 init 을 받고 끝내면 모델 호출 없이 약 3.4초(2.1.309 실측, 보관함에서 131개). `-p` 에 `/vault-reach` 를 보내면 스킬이 실제로 돈다(실측). 질문 앞 안내가 있으면 `/이름` 줄을 맨 앞에 둔다. 사람 확인(2026-10-23) |
| 붙여 넣은 그림 | 붙여 넣기 안 됨(끌어 놓으면 자료로 넣기) | 질문에 싣기 | Claude 는 stream-json 입력의 `image` 블록(base64) — 읽기 전용 채팅도 그림이 있는 턴만 `--input-format stream-json`. 32px PNG 로 실측해 두 프로필 인자 모두 "Red"($0.0013, 2.1.309). Codex 는 앱 임시 폴더에 써서 `-i`(다른 옵션 앞에 — 값을 여럿 받아 `-` 를 먹지 않게), 끝나면 지운다(실행은 미검증). 긴 변 1568px 로 줄이고 PNG 가 3.75MB 를 넘으면 JPEG. 대화 기록에는 그림 수만. 끌어 놓기는 예전처럼 자료로 넣기. 사람 확인(2026-10-23) |
| 답 전 점 셋 | 칩이 연 말풍선 · 따로 그림 | 따로 그림(`chat-pending`) | 칩이 답 뒤로 가면서 첫 글자 전까지 기다림 표시가 사라졌다 |

- 사이드바 검색의 한글 한 글자 토큰 제거(`shared/wiki/search.ts`)는 그대로 둔다 — 검색 화면에도 같은 잡음이 있었다.
- 사용자가 `@` 로 붙인 문서와 질문 속 주소에서 읽은 글은 지금처럼 싣는다 — 사용자가 고른 자료다.

## Verified

- 단위: `prompts.test.ts`(기본 턴 = 질문 그대로), `chat-service.test.ts`(질문·시스템 프롬프트 분리, resume 에도 같은 시스템 프롬프트,
  칩), `engine.test.ts`·`codex-engine.test.ts`(인자·앞붙임).
- e2e `shell.spec.ts`: 엔진 stdin 이 질문 그대로이고 인자에 `--append-system-prompt` 가 있다.
- 실제 CLI(위 표, 5턴째 "오늘 노트 파일 경로" → `private/2026-10-23.md`). 조건마다 1회라 비용 차이의 일부는 캐시 적중 차이일 수 있다.

## Open — 남은 위험

- 큰 보관함에서 엔진이 근거를 덜 찾을 수 있다 — 보관함 `CLAUDE.md` 의 읽기 규칙에 기댄다. 데스크탑과 같은 조건이다.
- Codex 는 앱 규칙이 여전히 질문 앞에 붙는다. `/` 스킬 목록도 없다.
- 읽기 전용 채팅 프로필(`chat`, 위키화 중)은 `--setting-sources project` 라 사용자 스킬을 `/` 로 불러도 실행되지 않을 수 있다 — 재지 않았다.

## Provenance

- 실측 스크립트·출력: `/tmp/chatrefs-repro/` (머신 로컬)
