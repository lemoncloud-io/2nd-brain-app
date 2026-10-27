<p align="center">
  <img src="docs/media/banner.svg" alt="2nd-brain" width="560">
</p>

<h3 align="center">AI가 쓰고, 사람이 승인하는 개인 위키</h3>

<p align="center">
  자료를 모으면 AI가 위키로 정리하고, 사람은 페이지마다 확인만 합니다.<br>
  터미널도, git도, Obsidian 설정도 필요 없는 데스크톱 앱.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-FF8A3D?labelColor=20242C"></a>
  <img alt="macOS arm64 · Windows x64" src="https://img.shields.io/badge/macOS_arm64_·_Windows_x64-20242C?labelColor=20242C&color=20242C">
  <img alt="Claude Code · Codex" src="https://img.shields.io/badge/engine-Claude_Code_·_Codex-FF8A3D?labelColor=20242C">
  <a href="README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-20242C?labelColor=20242C&color=20242C"></a>
</p>

<p align="center">
  <img src="docs/media/graph-growth.gif" alt="위키가 링크를 따라 한 점에서 2,359쪽으로 자라는 3D 그래프" width="860">
  <br>
  <sub>그래프의 <b>성장 재생</b> — 위키가 실제 링크를 따라 한 점에서 전체로 자랍니다.</sub>
</p>

---

## 이런 앱이에요

Claude 또는 Codex 를 연결하고, 자료를 끌어다 놓고, AI가 정리한 페이지를 하나씩 **승인**하면 개인 위키가 쌓입니다.
위키는 링크로 이어져 그래프로 보이고, 검색과 채팅으로 바로 꺼내 쓸 수 있어요.

```mermaid
flowchart LR
  A["자료 모으기<br/>글 · URL · PDF · 한글 · 엑셀 · 워드 · PPT"] --> B["AI 위키화<br/>작업 브랜치에 커밋"]
  B --> C{"사람이 페이지별로<br/>승인 · 원복"}
  C -->|승인| D["위키에 병합"]
  C -->|거절| E["원복"]
  D --> F["읽기 · 검색 · 그래프 · 채팅"]
```

- **터미널 없이.** Claude·Codex CLI 는 앱이 직접 설치하고 로그인까지 이어 줍니다. 다른 선행 설치가 없어요.
- **내 계정, 서버 없음.** 내 AI 구독과 GitHub 계정으로 돌고, 이 프로젝트는 서버·구독·결제를 두지 않습니다.
- **보관함은 git 저장소.** 모든 변경이 커밋이라 언제든 되돌릴 수 있고, 앱 없이 Obsidian 으로 열어도 그대로 동작합니다.
- **위키는 승인한 것만.** AI가 만든 위키 페이지는 사람이 승인해야 들어갑니다. 내 노트·계획은 바로 쓰이고, 언제든 되돌릴 수 있어요.
- **팀으로도.** GitHub 로그인 하나로 팀 저장소에 올리고, 받고, 확인 요청(PR)을 엽니다.
- **한국어 · English.** 화면 언어를 설정에서 바꿀 수 있어요.

## 화면

### 읽고 쓰기

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/ko-doc-dark.png">
    <img src="docs/media/ko-doc-light.png" alt="왼쪽 파일 트리, 가운데 위키 문서, 오른쪽 채팅 칸" width="860">
  </picture>
</p>

왼쪽 파일 트리, 가운데 문서, 오른쪽 채팅 칸. 문서는 읽으면서 바로 고치는 라이브 미리보기 편집기이고, `[[링크]]` 는 마우스를 올리면 그 페이지 앞부분이 곁에 뜹니다.
오른쪽 채팅에는 "오늘 노트 만들어줘" 처럼 말로 일을 시킵니다. 답은 되돌리기 카드와 함께 파일로 남아요.

### 찾기

<p align="center">
  <img src="docs/media/ko-search.png" alt="키워드 검색 결과와 강조된 스니펫" width="860">
</p>

키워드 검색(BM25, 제목 가중, 한글 부분 일치)은 문서를 내용으로, PDF·그림 같은 파일을 이름으로 찾습니다.

### 그래프

<p align="center">
  <img src="docs/media/ko-graph.png" alt="wikilink 로 이어진 페이지를 3D 로 그린 그래프" width="860">
</p>

링크로 이어진 페이지를 돌려 볼 수 있는 3D 그래프. 많이 이어진 페이지일수록 크고 밝게 보이고, 점을 짚으면 이웃만 남기고, 누르면 그 페이지를 옆 칸에 엽니다.

> 위 화면은 AI 에이전트 운영 노트 80여 쪽으로 만든 예시 보관함입니다.

## 시작하기

**설치본으로** — [Releases](https://github.com/lemoncloud-io/2nd-brain-app/releases) 에서 mac(`.dmg`) 또는 Windows(`setup.exe`)를 받아 설치하세요. 첫 실행은 질문 하나("무엇을 정리하고 싶으세요?"), AI 연결, 보관함 만들기 순으로 안내합니다. GitHub 로그인은 나중에 해도 돼요. 자세한 설치·삭제는 [아래](#설치와-삭제).

**소스에서** — Node 22, pnpm 10.

```sh
pnpm install
pnpm dev
```

기여는 [CONTRIBUTING.md](CONTRIBUTING.md), 취약점 제보는 [SECURITY.md](SECURITY.md). 사용자·제품 전제는 [PRODUCT.md](PRODUCT.md), 화면 설계는 [DESIGN.md](DESIGN.md), 설계 결정 기록은 [`docs/decisions/`](docs/decisions).

## 기능

**시작과 보관함**

- 첫 실행 다섯 단계 안내 — 무엇을 정리할지, AI 연결(Claude Code·Codex CLI 설치와 로그인을 앱이 대신), GitHub 로그인, 보관함 만들기, GitHub에 올리기
- 보관함은 git 저장소 — 모든 변경이 커밋으로 남고, 문서마다 기록 보기·비교·되돌리기
- 쓰던 Obsidian 폴더를 그대로 열거나, 있던 파일은 건드리지 않고 보관함으로 바꾸기

**자료와 위키화**

- 자료 넣기 — 글·URL·PDF·한글(hwp·hwpx)·워드·엑셀·파워포인트를 글로 바꿔 보관, 웹 탭에서 보던 페이지 바로 담기
- 위키화 — AI 가 작업 브랜치에 위키 초안을 쓰고, 사람이 페이지마다 읽고 승인한 것만 위키에 들어간다
- 점검 — 구조 검사와 AI 점검(모순·오래된 내용·빠진 페이지·같은 내용), 같은 내용 두 페이지 합치기

**읽고 쓰기**

- 라이브 미리보기 편집기 — `[[` 자동완성, 템플릿, 그림 붙여넣기, 고른 글을 AI 로 고치기
- 링크 미리보기, 여기를 가리키는 페이지·끊긴 링크 모음
- 탭·좌우 분할·웹 탭, 태그·북마크(Obsidian 과 같은 파일), ⌘K·⌘P 단축키
- 오늘 노트 — 지난 노트에 남은 일과 오늘 할 일을 한 줄로
- 그림·PDF·소리·영상·워드·파워포인트·Obsidian Bases 미리보기

**찾기와 그래프**

- 한글 부분 일치 키워드 검색(BM25), 태그·파일 종류로 거르기
- 3D 링크 그래프와 성장 재생

**채팅**

- 오른쪽 칸에 늘 열려 있다(⌘J). 대화마다 AI 세션을 켜 두어 앞 대화를 기억한다
- `@` 로 문서 붙이기, 그림 붙여넣기, GitHub PR·이슈·웹 주소 읽기, `/` 스킬, MCP 서버
- 답이 쓴 파일은 카드에서 검토하고 곳마다 되돌리기, 범위 밖 도구는 승인 카드로 묻기

**팀**

- GitHub 로그인 하나로 팀 보관함 만들기·초대·들어가기
- 팀 변경 알림과 한 번에 받기, 내 수정은 확인 요청(PR)으로 — 혼자 쓰는 저장소는 바로 올린다
- 공개 저장소에는 올리지 않는다

**그 밖**

- 한국어·영어 화면, 라이트·다크 테마, 앱 업데이트, 이 컴퓨터에만 남는 진단 기록과 내보내기

## 설치와 삭제

**mac** — dmg 를 열어 앱을 `Applications` 로 옮기세요. 지울 때는 dmg 안의 `Uninstall 2nd-brain.command` 를 터미널에서
`bash` 로 실행하면 앱, 앱 데이터, 앱이 설치한 CLI 를 확인한 뒤 지웁니다.

**Windows** — `setup.exe` 를 실행하세요. 관리자 권한은 필요 없습니다. 아직 코드 서명이 없어서 SmartScreen 경고가 뜨면
"추가 정보 → 실행" 을 누르세요. 지울 때는 "프로그램 추가/제거" 를 쓰면 됩니다.

Claude·Codex CLI 는 설치본에 들어 있지 않고 첫 화면의 "설치" 버튼으로 받습니다. 어떤 방법으로 지워도 보관함 폴더와
직접 설치한 CLI 는 건드리지 않습니다. 지우는 대상 목록은 `build/uninstall-targets.json`, 자세한 절차는
[`docs/INSTALL-TEST.md`](docs/INSTALL-TEST.md) 에 있습니다.

## 개발

```sh
pnpm install
pnpm dev        # 개발 창
pnpm lint
pnpm typecheck
pnpm test       # vitest
pnpm test:e2e   # 빌드 후 Playwright
pnpm build:mac  # mac arm64 dmg (Windows 설치본은 CI 가 만든다)
```

- **CI** — main 으로 가는 PR 마다 macOS 에서 빌드·lint·vitest·e2e 를 돌립니다. 통과해야 머지됩니다.
- **e2e** — 테스트마다 앱을 새로 띄웁니다. 앱을 띄우는 spec 은 `@playwright/test` 대신 `e2e/fixtures` 의 `test` 를
  쓰세요. 테스트가 실패해도 앱과 임시 폴더를 정리해 줍니다.
- **git·Python 없이 동작** — 앱은 git 을 `dugite` 로 번들하고, 병합 전 검증 스크립트는 TypeScript 로 옮겨
  `src/main/verify/` 에 있습니다. 개발 PC 의 `python3` 는 원본 스크립트와 결과를 비교하는 테스트에서만 씁니다.

더 자세한 구조와 규칙은 [CLAUDE.md](CLAUDE.md) 와 [CONTRIBUTING.md](CONTRIBUTING.md) 를 보세요.
