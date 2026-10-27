---
type: decision
title: 좌우 분할을 다시 넣는다 — 이번에는 오른쪽 칸에서도 편집한다
date: 2026-09-22
sources:
  - docs/decisions/2026-09-22-one-palette-no-side-pane.md
  - src/renderer/src/views/wiki/split-pane.tsx
  - src/renderer/src/views/doc-view.tsx
---

## Context

같은 날 앞선 결정(`2026-09-22-one-palette-no-side-pane.md`)이 옆 칸 대조 보기를 뺐다 — 읽기 전용 얇은 분할은
써 보니 대조할 일이 드물었다. 그 뒤 사용자가 "비개발자용 옵시디언 대체재" 목표의 편집 기본기 목록에
좌우 분할 보기를 명시해 다시 열었다.

## Decisions

- 문서 자리 오른쪽에 문서 한 장을 더 띄운다(store `split` 한 필드). 가운데 리더의 "현재 페이지" 정본 규칙은
  그대로 두고, 오른쪽 칸은 자기 문서만 든다 — 앞선 기록이 걱정한 WikiView 셀렉터·액션 충돌을 피한다.
- 뺐던 이유(대조할 일이 드물다)를 반영해 읽기 전용이 아니라 **오른쪽에서도 편집**한다. 자료를 읽으며 노트를
  쓰는 자리다. 편집기는 가운데와 같은 컴포넌트, 저장은 같은 `edit: <slug>` 커밋.
- 들어가는 길: 리더 머리 "오른쪽에 열기", 트리 오른쪽 클릭 "오른쪽에 열기". 오른쪽 칸의 링크는 그 칸만 바꾸고
  이동 기록에 쌓지 않는다. "가운데에서 열기" 로 옮기면 분할이 닫힌다. 고친 채로는 닫지 않는다.
- 좁은 칸에서 리더 머리의 동작 버튼은 다음 줄로 내려간다(`ViewHeader` flex-wrap) — 옆 칸 위로 넘치지 않는다.

## Rejected

- 탭 pane 전면 리팩터(두 칸 모두 탭·기록을 가진 분할) — 앞선 기록과 같은 이유로 여전히 뺀다.

## Provenance

