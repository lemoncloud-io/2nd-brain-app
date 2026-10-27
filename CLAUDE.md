# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

2nd-brain — 비개발자가 앱 하나로 Claude/Codex CLI 연결 → 개인 볼트(자료 보관함) → 클리핑 → 위키화 →
승인까지 하는 Electron 앱 (macOS arm64 · Windows x64). 기능 목록은 `README.md § 기능`, 사용자·제품 전제는
`PRODUCT.md`, 화면 설계·토큰·화면 문구 규칙은 `DESIGN.md`, 설계 결정 기록은 `docs/decisions/`.

## 명령

패키지 매니저는 pnpm.

```sh
pnpm install
pnpm dev              # 개발 창
pnpm lint             # eslint --cache + 화면 한글 스캐너(scripts/ui-hangul.mjs src — 0 이어야 한다)
pnpm typecheck        # tsconfig.node.json(main·preload·shared·e2e) + tsconfig.web.json(renderer·shared)
pnpm test             # vitest — src/**/*.test.ts(x), e2e/**/*.test.ts
pnpm test:e2e         # build 후 Playwright (e2e/**/*.spec.ts)
pnpm test:e2e:stray   # 스위트 뒤 남은 앱 프로세스 수 — 0 이어야 한다
pnpm build:mac        # mac arm64 dmg (Windows 빌드는 CI .github/workflows/installer.yml)
```

PR 검사는 `.github/workflows/ci.yml` — macOS 에서 build·lint·test·e2e. 같은 순서로 로컬에서 돌리면 CI 와 같다.

**머지 조건** — `ci` 체크가 초록이어야 main 에 머지된다(브랜치 보호).

단일 테스트:

```sh
pnpm vitest run src/main/engine/work-branch.test.ts
pnpm vitest run -t '<테스트 이름>'
pnpm build && pnpm playwright test e2e/sync.spec.ts   # e2e 는 out/ 빌드 산출물을 띄운다
```

- vitest 는 `unit` 프로젝트 병렬 + `watch`(fs.watch 타이밍) 단독 순차 — `pnpm test` 가 순서대로 돌린다.
  fs.watch 테스트는 `src/main/vault/vault-watcher.test.ts` 하나뿐이다. DOM 이 필요한 파일은 `*.dom.test.ts(x)` +
  첫 줄 `// @vitest-environment jsdom`.
- `vault-verify.test.ts` 는 개발 PC 의 `python3` 로 vault-kit 원본 스크립트를 같이 돌려 판정을 대조한다.
- 코드 스타일: prettier (작은따옴표, 세미콜론 없음, 폭 100, trailing comma 없음). 함수 반환 타입 명시(eslint).

## 외부 입력

- **vault-kit** — 볼트 뼈대·`vault-ingest-agent.md`·검증 스크립트는 `resources/vault-kit` 에 커밋돼 있다.
  처음엔 `lemoncloud-io/2nd-brain` 에서 뽑아 왔지만 이제 이 레포가 정본이다 — 에이전트 계약은 여기서 고친다.
- 앱은 사용자 PC 의 git·Python 을 쓰지 않는다 — git 은 `dugite` 번들(`src/main/git.ts`), 병합 전 검증은 Python
  원본을 TS 로 옮긴 `src/main/verify/`.

## 아키텍처

electron-vite 3 진입점: `src/main`(Node) · `src/preload` · `src/renderer`(React 19 + Tailwind 4 + zustand).
`src/shared` 는 양쪽이 import 하는 순수 TS (두 tsconfig 모두에 포함되므로 Node·DOM API 를 쓰지 않는다).

**IPC 계약** — `src/shared/ipc-contract.ts` 가 정본: `APP_CHANNELS`(채널 이름)·`AppApi`(렌더러에 노출되는 타입)·
이벤트 타입. 새 IPC 는 ① 계약에 채널·타입 ② `src/preload/index.ts` 에 `ipcRenderer.invoke`/`on` 래퍼
③ `src/main/ipc/*-handlers.ts` 에 핸들러(`src/main/index.ts` 가 `register*Handlers()` 로 등록) 세 곳을 같이 고친다.
main → renderer 푸시는 `ipc/broadcast.ts`.

**엔진** — `src/main/engine/`. `Engine` 인터페이스(`run(job): AsyncIterable<EngineEvent>`, `cancel()`)를
`claude-engine.ts`·`codex-engine.ts` 가 CLI 자식 프로세스(`cli-process.ts`)로 구현하고 `create-engine.ts` 가 설정대로 고른다.
위키화·AI 점검·위키 초안·선택 영역 고치기가 이 경로다 — 한 번 돌고 끝나고, 웹 도구 없이 보관함 안에서만 돈다.
채팅 곁일 중 대화 압축은 이 경로가 아니라 아래 채팅 세션에서 돈다.

**채팅 세션** — `src/main/chat/session/`. 채팅은 대화마다 AI 프로그램을 켜 두고 질문을 다음 턴으로 보낸다
(`docs/decisions/2026-10-23-chat-keeps-session-open.md`). `chat-sessions.ts` 풀(셋·10분 idle·LRU)이 대화 id 로 세션을 쥐고
`engineFor()` 로 `Engine` 모양을 돌려준다. Claude 는 `claude-session.ts` 가 Agent SDK `query()` 에 사용자 PC claude
(`pathToClaudeCodeExecutable`)를 넘기고, 승인은 `canUseTool` → `EngineEvent permission` → `Engine.respond(id, allow)`,
읽기 전용 턴은 PreToolUse 훅이 쓰기 도구를 거절한다. Codex 는 `codex-session.ts` 가 `codex app-server` JSON-RPC thread 하나로
돌고 턴마다 sandbox 를 정한다. MCP 서버(`mcp-args.ts`)와 웹 도구는 채팅 세션과 선택 영역 고치기(MCP 만)에만 넘긴다.

**볼트 = git 저장소** — 볼트의 모든 변경은 커밋이다.
- 위키화: 에이전트가 `app/ingest-YYYY-MM-DD(-n)` 작업 브랜치를 만들고 커밋까지만 한다. 앱이 실행 전 상태를
  고정하고 실행 후 계약을 확인한다(`engine/work-branch.ts`). 승인 화면(`src/main/review/`)이 페이지별 확정·원복 후
  기본 브랜치(main/master)에 병합한다.
- 사람이 앱에서 고친 것은 `edit: …`, 채팅 답의 부분 되돌리기는 `undo: …` 커밋.
- 팀 동기화(`vault/sync-service.ts`·`ipc/sync-handlers.ts`): 주기적으로 원격을 보기만 하고 알림, 한 번 눌러 받기.
  내 수정 공유는 `app/edits-<시각>` 브랜치 push + GitHub PR(`src/main/github/` — device flow 로그인, REST).
  GitHub 인증은 그 로그인 토큰 하나다: 네트워크 git 은 `spawnGit()` 이 github.com 으로 갈 때만 토큰을 환경 변수 헤더로
  싣고(`gitAuthEnv`), 로그인 전이면 띄우지 않고 `login` 실패로 끝낸다. 앱 커밋 작성자는 `vault/app-identity.ts` 한 곳.
- 파일 감시는 `vault/vault-watcher.ts`, 볼트 파일을 렌더러에 주는 커스텀 프로토콜은 `vault/vault-protocol.ts`.

**검색** — 키워드 BM25(한글 부분 일치). 위키 파싱·검색·린트·그래프 로직은 `src/shared/wiki/` (순수 함수).

**렌더러** — 셸은 왼쪽 사이드바 · 가운데 문서 자리(탭·좌우 분할) · 오른쪽 채팅 칸. 탭·기록·화면 상태는
`renderer/src/store/`(zustand), 화면은 `views/`, 순수 로직은 `lib/`(대부분 테스트 동반). 편집기는 CodeMirror 6
라이브 미리보기(`lib/live-preview.ts`).

**패키지 자리** — 렌더러만 쓰는 패키지(CodeMirror·mermaid·three·그래프·마크다운·zustand 등)는 `devDependencies` 에 둔다.
렌더러는 vite 가 `out/renderer` 로 묶고, `dependencies` 는 electron-builder 가 node_modules 째 앱에 싣는다 — 잘못 두면 같은 코드가
두 번 실린다. main·preload 가 `import` 하는 것만 `dependencies`. 앱에서 빼는 파일(다른 OS 네이티브, dugite 의
Git Credential Manager)은 `electron-builder.yml` `files` 한 목록과 `scripts/after-pack.mjs` 가 정한다.

## 테스트 인프라

- 엔진 CLI 는 가짜로 돈다: `test/fixtures/fake-claude/<시나리오>/claude`·`fake-codex/…` 를 `CLAUDE_CLI_PATH` 등
  env 로 넘긴다. GitHub 은 `e2e/fake-github.ts` 가짜 서버(`SECOND_BRAIN_GITHUB_API`·`SECOND_BRAIN_GITHUB_WEB`).
- e2e 에서 앱을 띄우는 spec 은 `@playwright/test` 가 아니라 `./fixtures` 에서 `test` 를 가져온다 — `launch` fixture 가
  실패·시간 초과 뒤에도 앱과 임시 폴더를 치운다. 앱마다 격리된 userData(`SECOND_BRAIN_USER_DATA`), 임시 폴더는
  실행당 한 그루 `$TMPDIR/2nd-brain-e2e/<runId>`.
- 화면 이동은 `e2e/helpers.ts` 의 함수로만 한다 — 셸 구조가 바뀌면 거기만 고친다.
- 부하 높은 머신에서는 60초 timeout 으로 무관한 spec 이 흔들린다 — 실패 spec 은 단독 재실행으로 가린다.

## 화면 문구

사용자는 CLI·git·frontmatter 를 모른다. 저장 구조 이름(vault, merge, `raw/`, orphan…)을 화면에 내지 않고
`DESIGN.md § 화면 말` 의 표를 따른다. 원문(경로·엔진 오류)은 툴팁·"자세히" 에 남긴다. 실패 메시지는
무엇이 안 됐는지(`lib/user-error.ts`) + 다음 할 일 하나 + 접어 둔 원문. 몇 분 걸리는 일은 경과 시간·진행 수를 같이 보인다.
화면 언어는 한국어(기본)·영어다(`docs/decisions/2026-10-23-i18n-typed-dictionary.md`). 새 문구는 컴포넌트·main 에
한글로 쓰지 않고 사전에 둔다 — `src/shared/i18n/ko/<영역>.ts` 가 정본, `en/<영역>.ts` 는 `typeof ko` 라 키·인자가 어긋나면
typecheck 가 막는다. 읽는 곳: 컴포넌트 `useT()`, 콜백·이펙트 `getT()`(renderer `lib/i18n`), main `mainT()`(`main/i18n.ts`),
shared `currentT()`. 모듈 최상단 상수에 `mainT()`·`getT()` 결과를 담지 않는다 — 언어를 바꿔도 남는다(`main/i18n.test.ts` 가 main 을 감시).
조사는 ko 함수 안에서 `josa()`, 영어 복수는 en 함수 안에서. 용어 대응은 `DESIGN.md § 영어 화면`. 볼트에 남는 글(씨앗·run-log·
커밋·PR 본문·충돌 파일 이름)과 AI 프롬프트는 한국어 그대로 두고 `ui-hangul-ignore: <사유>` 를 단다 — `pnpm lint` 가 스캐너로
나머지 한글 리터럴 0을 확인한다. 새 영역은 ko·en 파일을 만들고 두 `index.ts` 에 등록한다.

## 문서 동기화

기능을 바꾸면 `README.md § 기능` 서술도 같은 커밋에서 고친다. 커밋은 Conventional Commits
(`feat(scope): …`, 영어 subject).
