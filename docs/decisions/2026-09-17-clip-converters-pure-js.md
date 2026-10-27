---
type: decision
title: 한글·엑셀 클리핑은 순수 JS 로 읽고, zip 크기는 선언값이 아니라 실제로 풀어 잰다
date: 2026-09-17
sources:
  - https://github.com/ssabro/hwpxjs
  - https://www.npmjs.com/package/read-excel-file
  - https://code.claude.com/docs/en/setup
---

# 한글·엑셀 클리핑은 순수 JS 로 읽고, zip 크기는 선언값이 아니라 실제로 풀어 잰다

## Context

"비개발자가 이 앱을 쓸 수 있나" 조사에서 출발했다. 현장 기록(11개사 실습)의 실제 자료는
HWP·PDF·Excel 인데 앱은 md·txt·PDF·URL 만 받아 첫 자료에서 "받지 않는다" 로 끝났다.
설계 § 4.5 는 변환을 python-build-standalone + pandoc 번들로 정해 두었지만, 그 뒤
vault_verify 를 TypeScript 로 옮기면서 README 가 "앱은 사용자 PC 의 git·Python 을 쓰지 않는다"
를 계약으로 삼았다. 두 방향이 충돌한 채였다.

## Findings

- **HWPX 는 zip + OWPML XML 이다.** 실물에서 확인한 구조: `Contents/section{N}.xml` 안에
  문단 `hp:p > hp:run > hp:t`, 표 `hp:tbl > hp:tr > hp:tc > hp:subList > hp:p`, 병합 칸은
  `hp:tc > hp:cellSpan[colSpan]`, 그림 `hp:pic`. `Preview/PrvText.txt` 는 앞부분만이라 본문 대용이 안 된다.
- **HWP 5.0 바이너리는 `@ssabrojs/hwpxjs`(0.4.0, MIT) 가 읽는다.** 실물 사업계획서
  21,557자·표 33개, 검수확인서 2,131자·표 2개·그림 18. `@hwp.js/parser`(0.0.4-alpha) 는 파싱은
  되지만 글자 워커가 없어 직접 써야 한다. hwpxjs 는 ESM 전용이라 main 에서 동적 `import()` 로 부른다 —
  빌드된 앱에서 실물 .hwp 가 들어가는 것을 e2e 로 확인했다.
- **xlsx 는 `read-excel-file` 9.x.** `readXlsxFile(path)` 가 모든 시트를 `{ sheet, data }[]` 로
  돌려준다. `readSheetNames` 는 9.x 에 없다. SheetJS npm 판(0.18.5)은 CVE-2023-30533·CVE-2024-22363
  미수정이라 쓰지 않는다.
- **실물 .xlsx 17건 중 3건이 zip 데이터 디스크립터(플래그 0x08)를 쓴다.** 로컬 헤더에 크기가
  없는 항목이다. "오피스 저장본은 안 쓴다" 는 가정으로 이 항목을 거절했다가 멀쩡한 파일 3건을 막았다.
- **zip 선언 크기는 방어가 아니다.** 중앙 디렉터리의 크기는 거짓일 수 있고, fflate `unzipSync` 도
  출력 버퍼를 필요한 만큼 키운다. read-excel-file(unzipper)은 0x08 항목을 상한 없이 누적한다.
- **`yaml` 의 `stringify` 는 기본 80칸에서 접는다.** `title: ` 뒤에 들여쓰기 없는 둘째 줄이 붙어
  frontmatter 가 깨진다(파일명 73자 이상이면 항상). `lineWidth: 0` 으로 끈다.

## Decisions

- **변환기는 순수 TS/JS.** 설계 § 4.5 의 Python·pandoc 번들을 버린다. § 4.5 의 근거(고객사 PC 의
  외부 다운로드 차단)는 JS 의존성 번들로도 충족되고, 두 OS 패키징·서명 범위가 늘지 않는다.
- **HWPX 는 직접 걷고(fflate + fast-xml-parser), HWP 5.0 만 hwpxjs 에 맡긴다.** hwpxjs 도 HWPX 를
  읽지만 그 경로는 검증하지 않았고, 직접 워커는 상한·DOCTYPE 거부·colSpan 정렬이 리뷰로 굳었다.
- **zip 은 `unzipWithin` 하나로 읽는다.** fflate `Unzip` 스트리밍으로 원하는 항목만 풀면서 누적
  바이트가 32MB 를 넘는 순간 던진다. HWPX 는 section 만 모으고 그림(BinData)은 풀지도 세지도 않는다.
  xlsx 는 같은 리더로 크기만 잰 뒤 read-excel-file 에 넘긴다 — 두 번 푸는 비용은 상한으로 유계다.
- **입력 파일은 200MB 에서 자른다.** HWP 5.0 의 CFB 내부 압축은 라이브러리 안이라 밖에서 잴 수
  없다. 입력 크기 상한이 유일한 방어이고 pdfjs 와 같은 노출이다.
- **frontmatter 의 제목·출처는 YAML 스칼라로 쓴다.** 파일명과 웹 페이지 제목은 외부 입력이다.
- **옛 형식은 다음 행동으로 거절한다.** `.xls` 는 "xlsx 로 저장", 한글 3.0 은 "HWPX 로 저장".
  비개발자에게 "받지 않는다 — 목록" 은 막다른 길이다.
- **픽스처는 테스트가 만든다.** HWPX·xlsx 는 fflate `zipSync`, HWP 5.0 은 cfb + pako 로 최소 파일을
  조립한다(FileHeader 256B · DocInfo · BodyText/Section0, 레코드 PARA_HEADER 66 + PARA_TEXT 67).
  실물 문서는 개인·고객사 정보라 커밋하지 않는다.

## Rejected

- **Python·pandoc 번들(설계 § 4.5)** — README 계약과 충돌, 번들 수십 MB, 패키징 범위 확대.
- **`@hwp.js/parser`** — 알파, 글자·표 워커를 직접 써야 하고 패키지에 license 필드가 없다.
- **0x08 항목 전면 거절** — 실물 3/17 오거절.
- **중앙 디렉터리 선언 크기 합산** — 거짓 헤더와 0x08 항목을 못 막는다.
- **SheetJS(npm)** — CVE 미수정.

## Open

- HWPX·HWP 의 글자 상한은 표 중간을 자를 수 있다(xlsx 만 행 경계에서 자른다).
- HWPX `rowSpan`(세로 병합)은 아래 행의 열을 밀 수 있다 — 실물 0건이라 미룸.
- `addUrl` 은 사설망·리다이렉트를 막지 않는다(SSRF) — 이 변경 밖의 기존 코드.
- vault-kit 의 `raw/hwp/` + `source_hwp`·`source_sha256` frontmatter 계약은 앱이 PDF 에서도 안 따른다 — 별건.
- Windows 실기에서 같은 파일로 확인하지 않았다.

## Provenance
- commits: 3c45c66, 7fe6d79, 7bdf066, d1f5137, 04b1989, 21ae562, 0e19fec, e34d8cd, 960a040, bd50d2e
- sources: hwpxjs · read-excel-file · 한컴 "한글문서파일형식 5.0" · KS X 6101(OWPML)
