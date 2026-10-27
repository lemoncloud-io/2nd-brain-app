---
type: decision
title: 화면 언어는 라이브러리 없이 타입 사전 하나로 — 한국어가 정본, main 도 완성 문장을 사전에서 만든다
date: 2026-10-23
sources:
  - src/shared/i18n/index.ts
  - src/shared/i18n/ko/index.ts
  - src/shared/i18n/en/index.ts
  - src/shared/language.ts
  - src/main/i18n.ts
  - src/renderer/src/lib/i18n.ts
  - scripts/ui-hangul.mjs
  - scripts/ui-hangul-allow.json
---

## Context

사용자가 한국어(기본)·영어 두 언어를 설정 > 화면(라이트/다크 옆)에서 고르게 해 달라고 했고, 범위는 앱 전체
(renderer 화면 + main 이 보내는 오류·진행 문구)로 정했다. 그 전까지 화면 문구 약 2,450줄이 컴포넌트·main 에 한국어
리터럴로 박혀 있었고, main 오류는 완성된 한국어 문장(reason)으로 renderer 에 건너가 `toUserError` 가 앞말과 이어 붙였다.

## Decisions

- **i18next 를 들이지 않고 타입 사전을 직접 둔다** — `src/shared/i18n/ko/<영역>.ts` 가 정본이고 `en/<영역>.ts` 는
  `typeof ko` 다. 키가 빠지거나 함수 인자가 어긋나면 typecheck 가 막는다. main·renderer·shared 가 init 없이 같은
  사전을 쓰고, 한국어 조사(`josa()`)와 영어 복수는 각 언어 함수 안에서 처리한다. 두 언어·번역 도구 없음이라 라이브러리의
  로딩·감지·ICU 는 쓸 데가 없다.
- **main 은 오류를 코드로 바꾸지 않고 현재 언어의 완성 문장을 만든다** — reason 171곳과 `DETAIL_MARK` 원문 프로토콜을
  그대로 둔다. main 은 메모리에 언어 값 하나를 들고(`main/i18n.ts`), 설정의 언어 저장 핸들러가 저장 → main 언어 →
  모든 창 알림 순으로 바꾼다. 그래서 한 오류 문장 안에서 main 쪽 말과 renderer 쪽 말의 언어가 같다.
- **기본은 한국어 고정, 바꾸면 즉시** — OS 언어를 보지 않는다. 고른 값은 `settings.json` `language` 에 남고, 창은 첫 페인트 전에
  `additionalArguments` 로 받아 `<html lang>` 까지 맞춘다. 바꾸면 zustand 구독으로 다시 그리고 다른 창은 방송으로 따라온다.
- **문구는 쓰는 시점에 읽는다** — 컴포넌트 `useT()`, 콜백 `getT()`, main `mainT()`, shared `currentT()`. 모듈 최상단 상수에 담으면
  import 순간의 언어로 굳는다. 슬라이스 08 리뷰에서 실제로 하나(`SYNC_BLOCKED`)가 나와, `main/i18n.test.ts` 가 src/main 의
  최상단 `const … = mainT()` 를 찾아 실패시킨다. 문구 표가 필요한 곳은 문장 대신 사전을 읽는 함수를 담는다.
- **이어 붙는 꼬리말도 사전 값으로 넘긴다** — "…한 뒤 저장해 주세요" 처럼 부르는 쪽이 할 일을 넘기던 자리
  (`notOnDefaultReason`·`commitBlockedReason`)는 `mainErrors.then*` 를 넘긴다. 한국어 꼬리가 영어 문장에 붙지 않는다.
- **볼트 데이터와 AI 프롬프트는 번역하지 않는다** — 새 보관함 씨앗·run-log·커밋·팀 요청 제목과 본문·충돌 파일 이름은
  디스크와 팀이 보는 데이터라 화면 언어와 따로 가고, AI 지시는 범위 밖이다. 이 자리에는 `ui-hangul-ignore: <사유>` 를 단다
  (파일째면 `scripts/ui-hangul-allow.json`). 칩·명령 라벨처럼 AI 입력을 겸하는 문구는 화면 언어를 따른다 — AI 는 질문 언어로 답한다.
- **남은 한글은 스크립트가 센다** — `scripts/ui-hangul.mjs` 가 TypeScript AST 의 문자열·JSX 텍스트에서 한글을 찾는다.
  슬라이스마다 범위를 주어 0 을 확인했고, 끝에 `src` 전체 0 이 되어 `pnpm lint` 에 묶었다.
- **새 노트·폴더 기본 이름은 화면 언어** — 이름 칸에 미리 채워 사람이 고치는 값이라 화면 문구로 본다. 이미 디스크에 있는 이름은 건드리지 않는다.

## Consequences

- 새 화면 문구는 사전 두 파일(ko·en)과 쓰는 곳을 같이 고친다. 영어를 빠뜨리면 typecheck, 한글 리터럴을 남기면 `pnpm lint` 가 막는다.
- `messages.test.ts` 가 두 사전의 키 모양이 같은지와 영어 값에 한글이 없는지를 본다.
- 세 번째 언어를 더하려면 `Language` 에 값을 더하고 `<언어>/` 사전을 `typeof ko` 로 만든다. 조사 같은 언어 규칙은 그 언어 함수 안에 둔다.
- 영어 용어 대응·말투는 `DESIGN.md § 영어 화면` 이 정본이다.
- 언어 단추는 main 에 먼저 알리고(`setLanguage`) 화면을 바꾼다 — 바뀐 직후 다시 읽는 목록이 main 의 새 언어로 답을 받는다.
  이미 받은 main 문장은 실패해 둔 트리·문서·위키 목록만 다시 읽고, 나머지(동기화 알림·올리기 오류)는 다음에 새로 받을 때 바뀐다.
- 문장으로 분기하지 않는다 — main 이 부르는 쪽에 알려야 할 실패 종류는 `exists`·`relogin` 같은 표시로 넘긴다. 언어가 바뀌면 문장 비교가 깨진다.
- `useMemo` 안에서 사전을 읽으면 의존성에 `t` 를 넣는다 — 빠지면 다음 입력 전까지 옛 언어가 남는다.
