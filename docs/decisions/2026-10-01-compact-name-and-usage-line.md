---
type: decision
title: 대화 압축은 "압축" 으로 부르고, 지표 줄은 다른 AI 도구의 상태 줄 표기를 따른다
date: 2026-10-01
sources:
  - https://code.claude.com/docs/en/commands
  - https://google-gemini.github.io/gemini-cli/docs/cli/commands.html
  - https://cursor.com/changelog/1-6
  - src/renderer/src/lib/usage-text.ts
  - src/renderer/src/views/chat/chat-status-bar.tsx
---

## Context

채팅 입력칸 아래의 "가볍게" 단추와 확인창("대화를 가볍게 할까")을 사용자가 이상하다고 짚었다. 같은 날 고급
표시의 지표 줄("대화 찬 정도 8% · 남은 여유 5시간 56% (2시간 뒤) …")도 이해하기 어렵다는 지적이 나왔다.
DESIGN.md 화면 말 표는 그전까지 `/compact`·압축을 "가볍게"로, 한도를 "남은 비율 + `남은 여유` 한 번"으로 정해 두고 있었다.

## Findings

- 같은 기능을 Claude Code·Codex CLI 는 `/compact`, Gemini CLI 는 `/compress`, Cursor 는 `/summarize`(자동일 때
  "Chat context summarized")라고 부른다. 공식 한국어 화면 문구는 찾지 못했다(미검증).
- "가볍게" 는 무엇이 가벼워지는지 말하지 않는다. "대화 찬 정도" 는 무엇이 차는지 말하지 않는다.
- 괄호 안 시간(다시 채워지는 때)은 툴팁에만 설명돼 있었고, "5시간"·"7일" 은 한도를 세는 단위 기간인데 남은 시간처럼 읽혔다.

## Decisions

- **기능 이름은 "압축"이다** — 단추 "압축", 확인창 "대화를 압축할까 / 압축한다", 명령 `/압축`. 사용자 판정:
  "그냥 compact 가 나을거같은데 다른 ai 서비스들은 어떻게 되어있는지 먼저 찾아" → 조사 뒤 "대화 압축" 선택.
  확인창 설명("AI 가 앞부분을 요약해서 기억한다…")은 그대로 둔다 — 낯선 낱말의 뜻은 거기서 푼다.
- **지표 줄은 `기억 8%` 와 `5h 49% (1h 32m) · 7d 16% (6d 17h) · Fable 0%` 로 쓴다** — 쓴 비율, 괄호는 다시
  채워지기까지 남은 시간. 사용자 판정: "보통 이런식으로 표현하지". 이 줄은 설정 `고급 표시` 를 켠 사람에게만
  보이므로, 비개발자 화면 말 규칙보다 그 사람들이 익숙한 표기를 따른다. 85% 이상 쓰면 숫자를 강조한다.

## Rejected

- "앞부분 요약" — 하는 일을 그대로 말하지만 길고, `/요약`(문서 요약)과 헷갈린다.
- 영어 "Compact" 그대로 — 기본 화면(고급 표시 밖)에 영어 낱말이 나온다.
- 지표 줄을 풀어 쓴 문장("5시간 한도 56% · 2시간 뒤 채워짐") — 좁은 칸(320px)에서 줄이 길어지고, 사용자가 짧은 표기를 골랐다.

## Provenance

- commits: 5192f43
