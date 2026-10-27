---
type: decision
title: 워드·파워포인트 클리핑은 잰 것만 열고, 각주 반복은 mammoth 문서 모델에서 지운다
date: 2026-10-02
sources:
  - src/main/clip/docx-text.ts
  - src/main/clip/pptx-text.ts
  - src/main/clip/clip-text.ts
  - docs/decisions/2026-09-17-clip-converters-pure-js.md
---

## Context

클리핑이 .docx·.pptx 를 받게 됐다. 둘 다 사용자가 끌어다 놓는 임의 zip 이고, 변환은 main 프로세스에서 돈다.
슬라이스 리뷰에서 보안 점검을 일곱 번 돌렸다. 매번 작은 파일 하나로 main 을 수 초에서 수 분 멈추거나 메모리를 수 GB
쓰게 하는 경로가 나왔다. 아래는 그 과정에서 굳힌 결정이다.

## Decisions

- **워드는 mammoth(BSD-2) HTML + turndown, 파워포인트는 fflate + fast-xml-parser 로 직접 걷는다.** mammoth 의 markdown
  출력은 표를 풀어 버린다. officeparser 는 node_modules 143MB 에 네이티브 canvas 를 끌고 온다.
- **docx 는 잰 부분만 다시 묶어 mammoth 에 넘긴다.** fflate 는 로컬 헤더로, mammoth 의 jszip 은 중앙 디렉터리로 항목을
  찾는다. 원본을 넘기면 잰 것과 여는 것이 달라질 수 있다. 그림·포함 개체·글꼴은 mammoth 가 열지 않으므로 풀지도 세지도 않는다.
  사진 많은 문서가 압축 상한(32MB)에 걸리지 않게 하려는 것이다.
- **pptx 는 발표 목록을 먼저 읽고, 그것이 가리키는 슬라이드만 푼다.** 같은 슬라이드를 여러 번 가리키면 한 번만 읽는다.
  가리킨 슬라이드가 없거나 슬라이드 뼈대가 없으면 손상으로 본다.
- **글자 예산은 문서 전체에 하나다.** 표마다 예산을 두면 표 수천 개가 각자 상한까지 칸을 채운다. 표는 열 256개까지만
  만든다. turndown 에는 글자 상한의 2배까지만 넘긴다. turndown 은 문단 수가 늘면 대략 제곱으로 느려진다.
- **같은 각주를 다시 가리키는 참조는 거절하지 않고 mammoth 의 `transformDocument` 에서 지운다.** mammoth 는 참조마다
  각주 본문을 다시 그린다. 정규식으로 참조를 세는 검사는 리뷰 네 차례 연속 우회됐다. 우회 방법은 접두사 바꾸기, 따옴표,
  문자 참조, 다른 이름공간 id, 속성값 안 가짜 id, 유니코드 접두사, 주석 속 가짜 정의였다. mammoth 가 이름공간까지
  풀어 읽은 모델을 보면 해석 차이가 없다. 정상 문서에서 변경 추적 때문에 반복된 참조도 그대로 변환된다.
- **압축 상한을 넘으면 손상이 아니라 너무 크다고 말한다** (`ZIP_TOO_LARGE`). 한글·엑셀도 같은 문장을 쓴다.
- **변환기를 별도 프로세스로 옮기는 일은 미룬다.** 증폭 경로는 상한마다 막혔다. 남은 비용은 mammoth·xmldom 의 선형
  처리다. 보안 점검 실측으로 표 위주 19.8MB XML 이 16초, 힙 1.58GB 였다. 이 비용 전체를 막는 구조적 해법은
  utilityProcess 와 시간 제한이고, 따로 바꾼다.

## Rejected

- **정규식으로 각주 참조·정의를 세어 거절하기** — XML 을 xmldom 과 다르게 읽는 한 언제나 우회된다.
  `[^>]*` 꼴은 닫히지 않은 태그를 수천 개 넣으면 되짚기 폭주(ReDoS)로 14초가 걸렸다.
- **zip 항목을 확장자(.xml·.rels)로 골라 재기** — mammoth 는 관계 파일이 가리키는 이름을 연다. `document.dat` 같은 이름이면
  재지 않은 부분이 열린다.
- **빈 `p:sldIdLst` 를 손상으로 보기** — 새로 만든 빈 파워포인트 파일이 그렇다. "빈 문서" 가 맞는 안내다.

## Open

- SmartArt·차트·발표자 노트의 글자는 옮기지 않는다. 글상자·수식처럼 mammoth 가 못 옮긴 것은 콘솔 경고로만 남는다.
- 변환기 utilityProcess 이전(위 결정).

## Provenance

- commits: d9b7981, 4988e00
- sources: mammoth 1.13.0 `lib/document-to-html.js`·`lib/index.js`(transformDocument)·`lib/options-reader.js`(externalFileAccess 기본 false)
