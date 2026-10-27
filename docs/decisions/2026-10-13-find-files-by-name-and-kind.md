---
type: decision
title: md 아닌 파일은 이름으로만 찾고 종류 단추로 거른다 — PDF 본문 추출은 하지 않는다
date: 2026-10-13
sources:
  - src/renderer/src/lib/file-find.ts
  - src/renderer/src/lib/page-match.ts
  - src/renderer/src/components/palette.tsx
  - src/renderer/src/views/search-view.tsx
  - src/shared/vault-file-types.ts
  - docs/decisions/2026-09-22-one-palette-no-side-pane.md
---

## Context

"검색이 불편하다, pdf 같은 확장자 검색을 지원하고 싶다, 원하는 문서를 빠르게 찾고 싶다" 는 요청에서 시작했다.
고치기 전 상태는 둘이었다. 검색 구역(`searchVault`)은 읽기 루트의 md 본문만 보고, ⌘K 는 파일 트리에서
`.md` 만 골랐다(`paletteEntries`). 그래서 `raw/` 에 넣어 둔 PDF·그림은 트리를 펼쳐 눈으로 찾는 길밖에 없었다.

## Decisions

- **md 아닌 파일은 이름·경로로만 찾는다.** 이미 화면이 들고 있는 파일 트리 목록(`listVaultTree`)을 다시 쓴다 —
  새 IPC·새 의존성·색인이 없다. 본문 검색(BM25)은 지금처럼 md 문서만 본다.
- **⌘K 와 검색 구역 둘 다에 넣고 같은 규칙을 쓴다.** 종류 판정·일치·문구는 `lib/file-find.ts`, 단추는
  `components/find-kind-chips.tsx` 한 곳이다.
- **거르기는 종류 단추다(전체·문서·PDF·그림·HTML·그 밖).** 쓰는 사람은 검색 문법을 모른다는 전제(PRODUCT.md)라
  `ext:pdf` 같은 문법을 두지 않는다. 종류는 `vault-file-types.ts` 의 `fileKind` 에서 접는다.
  입력칸에 `.pdf`·`보고서 pdf` 를 쳐도 같이 걸린다 — 띄어 쓴 낱말은 저마다 제목이나 경로에 있으면 된다.
- **낱말 없이 종류만 고르면 그 종류 전부를 이름순으로 보인다.** "PDF 가 뭐가 있더라" 가 한 번에 풀린다.
- **문서 밖 종류를 고르면 본문 결과를 내지 않는다.** 본문 검색은 md 만 보므로 PDF 를 고른 사람에게 md 적중을
  섞어 보이면 거르개가 거짓말을 한다.
- **검색 구역의 "전체" 에서는 이름이 맞는 파일을 문서 결과 위에 5개까지만 둔다.** 이름 일치는 본문 언급보다
  강한 신호라 위에 두되, 본문 결과를 밀어내지 않게 막는다. 종류를 고르면 전부(50개까지) 보인다.
- **⌘K 에서 고른 문서는 새 탭에 연다.** 사용자 요청("검색해서 나온 문서를 새창에서 열리게")을 앱의 새 탭으로
  옮겼다 — 트리 ⌘클릭·본문 링크와 같은 길(`openFile(rel, true)`)이다. 빈 탭과 이미 보고 있는 그 문서는
  제자리에서 연다(빈 탭이 남거나 같은 문서 탭이 둘 생기지 않게).

## Rejected

- **PDF 본문까지 검색** — 텍스트 추출 라이브러리가 main 의존성으로 들어가 앱 용량이 늘고, 추출 캐시와 첫 색인
  시간이 생기며, 스캔본 PDF 는 그래도 안 걸린다. 사용자가 "파일 이름만" 을 골랐다.
- **입력만으로 거르기(단추 없음)** — 화면 변화는 가장 작지만 `.pdf` 를 쳐야 한다는 것을 발견할 길이 없다.
- **⌘K 만 / 검색 구역만** — 두 곳이 다른 범위를 찾으면 "여기선 나오고 저기선 안 나온다" 가 된다.
- **@멘션(`composer-assist`)에도 파일 넣기** — 채팅 근거는 md 본문을 읽는다. 멘션 목록은 md 만 그대로 둔다.

## Open

- 검색 구역의 "문서" 는 본문 검색 범위(읽기 루트)만 본다 — `raw/` 의 md 는 ⌘K 에서만 이름으로 나온다.
- 문서를 OS 새 창에 여는 기능은 없다. "새창" 이 그 뜻이었다면 별도 작업이다.

## Provenance

- sources: 위 frontmatter 와 같다
