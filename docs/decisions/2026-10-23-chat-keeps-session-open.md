---
type: decision
title: 채팅은 대화마다 AI 프로그램을 켜 둔다 — Claude 는 Agent SDK, Codex 는 app-server
date: 2026-10-23
supersedes:
  - docs/decisions/2026-10-14-chat-desktop-parity.md (승인 왕복 구현 행 — SDK 기각)
sources:
  - src/main/chat/session/chat-session.ts
  - src/main/chat/session/chat-sessions.ts
  - src/main/chat/session/claude-session.ts
  - src/main/chat/session/codex-session.ts
  - src/main/ipc/chat-handlers.ts
  - src/main/engine/claude-engine.ts
  - src/main/engine/codex-engine.ts
  - src/main/engine/cli-process.ts
  - src/shared/chat-defaults.ts
  - electron-builder.yml
---

## Context

채팅은 질문마다 `claude -p --resume <id>`(Codex 는 `codex exec resume <id>`)를 새로 띄웠다. 그래서 질문마다
사용자 설정의 훅(이 PC 에서 SessionStart 10개, claude-mem 경고 포함)이 다시 돌고 시작 비용이 들었다. `/` 스킬 목록은
따로 CLI 를 한 번 더 띄워 `system/init` 줄에서 받았다(`src/main/chat/skills.ts`). Obsidian 플러그인 Claudian 은 같은 일을
Agent SDK `query()` 에 메시지 채널을 넘겨 프로세스 하나로 한다(설치본 v2.2.6 을 풀어 확인).

`2026-10-14-chat-desktop-parity.md` 는 승인 왕복을 CLI stream-json 제어 줄로 직접 짜고 SDK 를 기각했다 — 근거는
"SDK 가 플랫폼별 바이너리를 앱에 더 싣는다" 였다. SDK 는 `pathToClaudeCodeExecutable` 로 사용자 PC 의 claude 를 띄울 수 있고,
플랫폼 패키지는 패키징에서 빼면 된다. 그 근거는 더 이상 맞지 않는다.

## Decisions

| Choice | Options | Selected | Rationale |
|--------|---------|----------|-----------|
| 수명 | 질문마다 실행 · 대화마다 켜 둠 | 대화마다 켜 둠 | 앞 대화를 프로세스가 들고 있고, 훅·경고가 질문마다 다시 돌지 않는다 |
| Claude 연결 | stream-json 직접 · Agent SDK | Agent SDK `query()` + 메시지 채널 | 승인(`canUseTool`)·멈춤(`interrupt`)·모드·모델 바꾸기·`/` 목록(`supportedCommands`)이 메서드로 있다 |
| Claude 실행 파일 | SDK 번들 · 사용자 PC claude | 사용자 PC claude | 앱이 이미 찾아 띄운다. 플랫폼 패키지(mac arm64 약 260MB)는 `electron-builder.yml` 에서 뺀다 |
| Codex 연결 | `exec resume` 유지 · `app-server` | `app-server` thread, 승인 없음 + 턴별 sandbox | 두 엔진이 같은 수명으로 돈다. app-server 가 없는 옛 Codex 는 exec 로 돌아가지 않고 업데이트를 안내한다 |
| 읽기 전용 턴 | 별도 프로세스 · 같은 프로세스 | 같은 프로세스 | 대화 기억을 잃지 않는다. Claude 는 PreToolUse 훅 + `canUseTool` 이 쓰기 도구와 앱이 켜지 않은 MCP 서버(사용자 설정의 것)를 거절하고, Codex 는 그 턴만 `readOnly` sandbox |
| 이어 붙이기 | 늘 새 세션 · 열 때 한 번 resume | 열 때 한 번 | 앱을 다시 켜도 대화가 이어진다. 앞 세션이 사라졌으면(`No conversation found`·`no rollout found`) 알리고 새로 연다 |
| 풀 | 무제한 · 셋 + 10분 | 셋, 10분 쉬면 끄기, 꽉 차면 가장 오래 쉰 것부터 | 메모리 상한. 도는 턴은 끊지 않는다 |
| 세션 열쇠 | — | 엔진·실행 파일·보관함·시스템 프롬프트·MCP·내 Claude 설정 | 이 중 하나가 바뀌면 다음 질문에서 새로 연다. 모델·권한 모드는 열린 세션에 control 로 바꾼다 |
| 사용자 설정 | 늘 project 만 · 늘 user 포함 · 설정 | 설정, 기본 user 포함 | 데스크탑과 같게 사용자 스킬·MCP 를 쓴다. 대신 `~/.claude` 의 규칙·출력 스타일이 답에 섞이므로(실측) 고급 → 내 Claude 설정에서 끈다 |
| `/` 목록 | 따로 CLI 프로브 · 열린 세션 | 채팅 칸이 뜰 때 세션 하나를 미리 열어 `supportedCommands()` | 새 대화 첫 질문이 그 세션을 이어받아 첫 답이 빠르다. `skills.ts` 는 지웠다 |
| 범위 | 모든 엔진 실행 · 채팅만 | 채팅만 | 위키화·AI 점검·위키 초안·선택 영역 고치기는 한 번 돌고 끝나는 일이라 `cli-process` 그대로. 옛 chat·note 프로필은 지웠다 |

## Verified

- 실측(claude 2.1.309 · SDK 0.3.309): 없는 세션 resume 은 initialize 전에 `result` error_during_execution +
  `errors: ["No conversation found with session ID: …"]` 로 끝난다. 쉬는 세션에 interrupt 를 보내면 아무 출력이 없고 다음 턴은 정상이다.
- 실측(codex-cli 0.163.0): app-server 줄은 jsonrpc 필드 없는 `{id, method, params}`. initialize 약 0.3초, thread/start 약 2초
  (사용자 `~/.codex` MCP 를 같이 띄운다). 없는 thread resume 은 `-32600 no rollout found for thread id …`.
- 단위: `chat-sessions.test.ts`(풀·LRU·idle·미리 연 세션), `claude-session.test.ts`·`codex-session.test.ts`(가짜 CLI 로 턴·멈춤·승인·
  압축·사라진 세션·시간 초과·프로세스 죽음), `chat-service.test.ts`(사라진 세션 → 알림 뒤 새 세션). e2e 는 같은 가짜 CLI 의 세션 모드로 돈다.

## Open — 남은 위험

- Codex 턴·압축 알림 모양은 크레딧 소진으로 실제로 재지 못했다 — 가짜 app-server 는 `codex app-server generate-ts` 타입 정의를 따른다.
- Codex 의 곁일(대화 압축) 턴은 웹 검색을 끄지 못한다 — app-server 의 `web_search` 는 thread 설정이다. 읽기 전용 sandbox 만 건다.
- 미리 연 세션은 채팅을 하지 않는 실행에도 최대 10분 claude 프로세스 하나를 쓴다.
- Codex 읽기 전용 턴은 `readOnly` sandbox 만 건다 — MCP 도구 호출은 sandbox 밖이라 승인 없이 돈다(옛 `codex exec` 도 같았다).
  `turn/start` 의 `approvalPolicy` 가 MCP 호출을 묻게 하는지는 재지 못했다(크레딧 소진).
- 보안 스캔(2026-10-23)에서 이 교체 전부터 있던 것: 보관함 `.claude/settings*.json`·`.mcp.json` 의 훅·서버(팀 동기화로 받은 것 포함)가
  채팅 세션을 열 때 돈다(`settingSources` 의 `project` — 보관함 CLAUDE.md 도 이 자리라 빼지 않았다) · 읽기 전용 턴의 Read·Glob·Grep 은
  보관함 밖 경로를 막지 않는다 · 앱에 켠 MCP 서버는 묻지 않고 쓴다.
- 질문 2턴째 첫 글자 시간이 실제로 줄었는지는 `pnpm dev` 에서 손으로 잰다(플랜 AC-17).

## Provenance

