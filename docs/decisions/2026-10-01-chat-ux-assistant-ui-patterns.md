---
type: decision
title: 채팅 UX 는 assistant-ui 패턴을 화면 층에서만 빌린다 — 재생성은 빼고 고치기는 입력칸 채우기로
date: 2026-10-01
sources:
  - https://www.assistant-ui.com/llms.txt
  - https://github.com/assistant-ui/assistant-ui (packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx, markdown-text.tsx, reasoning.tsx)
  - src/renderer/src/views/chat/chat-thread.tsx
  - src/renderer/src/lib/chat-markdown.tsx
---

## Context

채팅 칸의 UI/UX 를 assistant-ui(thread·message·composer) 수준으로 올리되, 세션 상태(`use-chat-session.ts`)·IPC·
`ChatMessage` 구조는 건드리지 않고 assistant-ui 패키지도 들이지 않는다는 조건이 있었다. 갭 목록 11개를 먼저
보이고 사용자가 고른 10개(Esc 로 정지 제외)를 기존 컴포넌트를 고쳐 넣었다. 색은 우리 토큰 그대로다.

## Decisions

- **재생성은 넣지 않는다.** `ChatSession` 에는 실패한 질문의 `retry` 만 있다. `sendText(이전 질문)` 로 흉내 내면
  답이 바뀌지 않고 같은 질문이 대화에 한 번 더 쌓인다 — 상태 불변 조건 안에서는 제대로 만들 수 없다.
  분기(BranchPicker)도 같은 이유로 뺀다.
- **내 질문 "고쳐서 다시 묻기" 는 입력칸 채우기다** (`setDraft` + focus). 원래 질문은 그대로 두고, 다시 보내면
  새 턴으로 붙는다. 추천 질문 칩도 보내지 않고 채운다 — 기존 DESIGN.md 규칙(보이고, 고칠 수 있고, Enter 한 번이면 간다)과 같다.
- **답하는 중에도 입력칸은 열려 있다.** 막는 것은 보내기뿐이다(`composer-assist` `submit` 이 `running` 이면 돌아간다).
  같은 대화에 두 질문이 겹치면 CLI 세션이 엉킨다는 기존 가드는 그대로 남는다.
- **답 아래 단추는 마지막 답(과 방금 남긴 답)만 늘 보이고 지난 답은 hover·focus 때 보인다** — assistant-ui
  `autohide="not-last"`. 높이가 흔들리지 않게 숨김은 `opacity` 로 한다.
- **자동 스크롤은 "맨 아래를 볼 때만 따라간다" 를 유지한다.** 위를 읽는 동안 새 답은 "맨 아래로" 단추의 점으로
  알린다. 내가 물었거나 대화를 바꾸면 맨 아래로 간다. 메시지가 그대로여도 높이가 바뀌는 경우(Mermaid 가 늦게
  그려짐, 입력칸이 자람)는 ResizeObserver 가 따라간다.
- **답 렌더러의 `components` 는 `useMemo` 로 고정한다.** 렌더마다 새 함수를 주면 React 가 다른 컴포넌트로 보고
  코드 블록·Mermaid 를 다시 만든다 — 스크롤 한 번에 복사 표시가 지워지고 다이어그램을 다시 그렸다.

## Rejected

- assistant-ui 패키지 도입 — 조건으로 막혔고, 우리 세션 모델(`ChatSession`)을 그 런타임에 맞추려면 상태를 갈아엎어야 한다.
- 지난 답 단추를 아이콘만으로 — 이 앱은 아이콘 뜻을 배우지 않아도 읽게 글자를 쓴다(DESIGN.md). 복사만 아이콘이다.

## Open

- 어두운 테마에서 Mermaid 상자가 흰색으로 그려진다 — 이번 변경 전부터다.
- 메시지 항목 단위 `memo` 분리는 측정(Profiler) 없이 미뤘다. 지금은 `ChatMarkdown` `memo` 가 지난 답 재파싱을 막는다.

## Provenance

- commits: 7c6ce06
