---
type: decision
title: 배포본 진단은 이 PC 안에만 남긴다 — 회전 로그 파일, 쓰기 시점 가림, 사용자가 내보내는 묶음
date: 2026-10-24
sources:
  - src/main/diagnostics/redact.ts
  - src/main/diagnostics/log-file.ts
  - src/main/diagnostics/logger.ts
  - src/main/diagnostics/install.ts
  - src/main/index.ts
---

## Context

앱은 `console.*` 로만 기록했다. 배포본에서는 stdout 을 아무도 받지 않아 사용자가 "안 돼요" 라고 해도 볼 것이 없었다.
main 의 uncaught 예외·거부된 promise·자식 프로세스 종료, 렌더러 오류를 받는 곳도 없었다. 배포본 DevTools 는
`@electron-toolkit/utils` 의 `watchWindowShortcuts` 가 단축키를 막아 열 수 없었다.

## Decision

- main 의 모든 기록은 `userData/logs/main.log` 한 파일로 모은다. 5MB 를 넘으면 `main.1.log` … `main.3.log` 로 밀고 더 옛것은 지운다.
  일반 줄은 대기열에 쌓았다가 다음 틱에 한 번에 쓰고, 프로세스가 죽을 수 있는 줄(uncaught)과 종료 직전은 대기열째 바로 쓴다.
  쓰기가 실패하면(디스크 가득·잠김) 30초 쉬었다 다시 쓰고, 그 사이 버린 줄 수를 한 줄 남긴다. 폴더 0700·파일 0600.
- 기존 `console.*` 호출처는 고치지 않는다. 로거가 console 을 감싸 원래 출력은 그대로 내고 파일에도 남긴다.
- 비밀은 **쓰기 시점에** 두 겹으로 가린다(`redact()`). ① 아는 값 — 설정의 MCP 서버 env 값은 어떤 모양으로 찍혀도 문자 그대로 지운다
  (시작할 때와 MCP 설정을 저장할 때 등록). ② 모르는 값 — 모양과 이름: GitHub 토큰(`gh*_`·`github_pat_`), `Bearer`, git 의
  `AUTHORIZATION: basic`, URL 사용자 정보(`//user:pass@`), `sk-`·`xox*-`·`glpat-`, MCP 설정 인자(`--mcp-config` JSON 은 줄 끝까지,
  `mcp_servers.*.env={…}`), URL 쿼리와 이름이 token·secret·password·api key·authorization·credential 인 값.
  홈 경로는 `~` 로 바꾼다. 한 줄은 4KB 에서 자른다. 파일·진단 묶음 어디로 가든 같은 함수를 거친다.
  정규식 전에 먼저 줄이는 길이는 4KB + 여유분 + 가장 긴 아는 값이다 — 상한에 걸친 긴 비밀이 앞부분만 남지 않게.
- uncaught 예외는 지금까지처럼 오류 상자를 띄우고 앱을 계속 돌린다. 기록만 더한다.
- IPC 핸들러는 등록 전에 한 번 감싸 던진 오류와 1초를 넘긴 호출을 남긴다.
- 원격 전송(Sentry 등)과 crashReporter(minidump)는 쓰지 않는다. 기록은 사용자가 내보내기를 누를 때만 PC 밖으로 나간다.
- 진단 정보 zip 은 기록 파일 + 앱·OS 버전 + 허용 목록 설정이다. 내보낼 때 줄마다 한 번 더 가리고, 기록 본문의 보관함 경로는 `<vault>` 로 바꾼다.
- 개발자 모드(기본 꺼짐)는 켤 때 main 대화상자로 묻는다 — DevTools 에 남이 시킨 코드를 붙여 넣는 사기를 한 번 막는다. 켜면 기록이 debug 로
  자세해지고, 배포본 DevTools·프로세스 사용량·성능 기록이 열린다. 이 손잡이들은 main 이 개발자 모드를 다시 보고 거절한다.
- 성능 기록(`contentTracing`)은 DevTools Performance 패널이 읽는 카테고리와 `node.fs.sync` 만, 32MB 고리 버퍼로 남긴다(`profiling.ts`
  `TRACE_CONFIG`). `'*'` 는 15초에 110MB 남짓을 쓰고 이어 켜면 Tracing Service 가 250MB 넘게 쥐었다 — 줄인 설정은 45MB 안팎·기록 중 40MB 대.
  멈춘 직후 Tracing Service 가 200MB 남짓 쓰는 것은 Chromium 이 JSON 으로 내보내는 몫이라 설정과 무관하고, 1분 안에 돌려준다.
  진단 기록 폴더에 최근 3개까지, 5분이면 저절로 멈춘다. **zip 에는 넣지 않는다** — trace 는 웹 탭 URL·
  OAuth code·서명 쿼리·`vault://` 파일 이름·문자열 안의 JSON 을 싣는데, 줄 가림은 trace JSON 을 깨거나 상한 없는 줄에서 오래 멈춘다.
  필요하면 개발자가 폴더에서 직접 골라 보낸다.

## Alternatives

- **electron-log** — 회전·렌더러 수집을 다 해 주지만 자체 preload·IPC 를 주입한다. 이 앱은 contextIsolation·sandbox 와
  `ipc-contract.ts` 의 타입 계약으로만 렌더러와 말한다. 필요한 기능(회전·가림)은 짧아서 직접 쓴다.
- **호출처를 로거 호출로 교체** — 수십 곳을 고쳐야 하고 개발 터미널 출력이 바뀐다. console 감싸기로 같은 결과를 얻는다.
- **`app.getPath('logs')`** — e2e 는 `SECOND_BRAIN_USER_DATA` 로 userData 만 격리한다. 로그도 userData 아래에 두면 같이 격리되고
  진단 묶음이 읽을 자리가 한 곳이다.

## Consequences

- 단일 인스턴스 잠금이 없어 앱 두 개가 같은 파일에 쓰면 회전이 엇갈릴 수 있다. 회전 rename 실패는 무시하고 이어 붙인다.
- 기존 console 호출 중 채팅 답·diff 일부를 찍는 것이 있다. 4KB 상한으로 자르고, 이 PC 에만 남는다.
