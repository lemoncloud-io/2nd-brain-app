---
type: decision
title: 웹 페이지는 문서 탭 위에 따로 뜨는 WebContentsView 로, 워드·파워포인트는 main 이 만든 HTML 로 읽는다
date: 2026-10-23
sources:
  - src/main/web/web-views.ts
  - src/renderer/src/views/web-view.tsx
  - src/renderer/src/hooks/use-web-overlay.ts
  - src/main/vault/office-preview.ts
  - src/renderer/src/views/sources-office.tsx
  - src/renderer/src/views/sources-image.tsx
  - docs/decisions/2026-10-14-chat-reads-web-links.md
---

## Context

사용자가 Claude 데스크톱 앱의 내장 브라우저·파일 뷰어를 보고 "1 내장 브라우저, 2 파일 뷰어 보강" 을 이 앱에 넣자고 했다.
그 전까지 리더·채팅의 링크는 앱 밖 브라우저로 나갔고, 주소 담기는 서버가 다시 가져온 HTML 만 읽어 로그인 뒤 페이지·스크립트가
그리는 페이지를 못 담았다. 보관함의 .docx·.pptx 는 "미리 볼 수 없는 형식" 이었고, 그림은 칸 너비에 맞춘 한 장뿐이었다.

## Decisions

- **웹 페이지는 WebContentsView 로 띄운다** — `<webview>` 태그 대신. Electron 이 권하는 길이고 앱 렌더러의 sandbox 를 그대로 둔다.
  view 는 창·탭마다 main 이 들고(`web/web-views.ts`), preload·node 없이 `sandbox`·`contextIsolation`, 저장 구역은 `persist:web`
  하나라 로그인 한 번이 모든 웹 탭에 남는다. 권한 요청은 묻지 않고 전부 거절하고, http(s) 밖으로의 이동은 막는다.
- **웹 페이지는 앱 화면 위에 따로 그려진다 — 팔레트·확인 창·메뉴가 열리면 페이지를 숨기고 마지막 모습 캡처를 깐다.**
  덮개 판정은 `role="dialog|alertdialog|menu"`·`data-web-overlay` 의 존재다. 채팅 입력 목록(`listbox`)은 문서 자리를 덮지 않아 뺐다 —
  넣으면 @·/ 를 칠 때마다 페이지가 숨는다.
- **자리 사각형은 렌더러가 레이아웃 단계에서 먼저 보내고, view 는 그 뒤에 만들어진다** — main 이 view 보다 먼저 온 사각형 하나를
  창마다 들고 있다가 만들 때 쓴다. 버리면 다음 크기 변화까지 페이지가 안 보인다(같은 사각형을 다시 안 보내게 줄였더니 바로 드러났다).
- **페이지가 클릭 없이 여는 것은 넘기지 않는다** — 새 창 요청은 같은 창의 새 웹 탭으로, 파일 받기는 기본 브라우저로 넘기되
  보이는 탭의 페이지만, 탭마다 1초에 하나만.
- **"담기" 는 사용자가 본 페이지를 쓴다** — 격리 world 에서 `outerHTML` 을 읽어 주소 담기와 같은 변환·저장 길로(10MB 상한).
  2026-10-14 결정이 숨은 창으로 그려 읽기를 버린 것은 채팅이 대신 읽는 길이라서다 — 여기서는 사용자가 연 탭이다.
- **워드·파워포인트는 main 이 `vault://…?preview` 로 HTML 한 장을 만든다** — 원본 바이트는 내주지 않는다. mammoth·fflate·xml
  파서가 이미 main 의 자료 넣기에 있어 그 읽는 길(zip 상한·DOCTYPE 거절)을 같이 쓴다. 글자는 모두 이스케이프, 그림은
  `ppt/media/` 안의 알려진 형식만 data: 로(하나 5MB·합계 20MB). 렌더러는 fetch 로 받아 상태 코드로 실패 문구를 고르고
  `sandbox=""` iframe 의 srcdoc 으로 그린다.
- **"기본 앱으로 열기" 는 링크의 실제 대상 종류로 판정한다** — 이름만 .docx 인 심볼릭 링크가 보관함 안 실행 파일을 가리킬 수 있다.
- **그림 배율은 `맞춤`(너비만) 또는 25~400% 단계** — ⌘0 은 맞춤. 키·⌘+휠은 그림 자리에 초점이 있을 때만 들어 분할한 두 칸이
  같이 바뀌지 않는다. ⌘+휠은 몸짓의 첫 이벤트에 곧바로 한 단계(마우스 한 칸 40px 안팎도 움직인다), 뒤는 100px 마다 —
  트랙패드 한 번 쓸기가 끝까지 가지 않게.

## Rejected

- **렌더러에서 mammoth 브라우저 빌드로 docx 를 그린다** — 렌더러에 sanitizer 의존이 늘고, pptx 는 따로 다시 짜야 한다.
- **덮개 자리를 비워 둔다** — 팔레트를 여는 순간 페이지가 사라졌다 나타나 깜빡인다. 캡처는 1초 상한, 실패하면 빈 자리.
- **⌘+휠 이벤트마다 한 단계** — 트랙패드 쓸기 한 번이 수십 이벤트라 400% 까지 튄다. 모아서만 세면 마우스 한 칸이 안 움직인다.

## Open

- 해소됨 — Electron 39.8.10 의 보안 경고(High 4건 포함)는 별도 변경에서 43.8.3 으로 올려 없앴다(audit 의 electron 경고 0).
- 숨은 웹 view 수에 상한이 없다 — 탭 수만큼 메모리를 쓴다.
- 미리보기 HTML 은 캐시하지 않는다 — 같은 문서를 다시 열면 다시 만든다.

## Provenance

- commits: 8be74c8 fc41a75 1a1970a d887fef 2b629ef b48c3f3 bd39105 4bea7d4 757ba0b e8ba597
- sources: 위 frontmatter 와 같다
