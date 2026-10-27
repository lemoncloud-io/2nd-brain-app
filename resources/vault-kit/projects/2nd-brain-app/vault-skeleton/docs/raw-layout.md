# raw/ 보존소 계약

`raw/`의 상세 계약. `VAULT_RULES.md` § Directory Contract의 한 줄("Processed source
originals. Append-only")을 이 문서가 구체화한다.

## 레인

이 볼트의 raw/는 웹 클리핑 레인 하나다 (루트 `*.md`).

- 유입: 2nd-brain Desktop의 파일 드롭·URL 붙여넣기 또는 Obsidian Web Clipper → `Clippings/`
  → ingest가 이동.
- frontmatter: `title`, `source`(URL), `clipped` 또는 clipper 표준 키(`author`, `created`,
  `published`, `description`, `tags`).
- 파일명: 이동 시점에 정규화한다 — § 파일명 정규화.

## Append-only의 정의

- **내용 수정 금지, rename 금지, 삭제 금지.** 셋 다 append-only 위반이다.
- provenance(`"raw/<file>.md"` 문자열)가 정확한 경로 매칭에 의존하므로, rename은 조용한
  링크 부패를 만든다.
- rename이 불가피하면(예: 개인정보가 노출된 파일명): **사용자 승인** 후, 참조하는 모든
  provenance 문자열을 같은 커밋에서 일괄 수정하고, 사유를 run-log 노트로 남긴다
  (`outputs/runs/`, `kind: maintenance` — `templates/run-log.md`).
- 승인 화면에서 거절한 페이지의 원문도 raw/에 남는다 — 거절은 wiki 쪽만 되돌린다.

## 파일명 정규화 (Clippings → raw 이동 시점)

원제목은 frontmatter `title:`에 남으므로 파일명은 안정성을 우선한다. 이동 시점에
파일명만 바꾼다(내용 무수정):

1. smart punctuation을 ASCII로 치환: `’‘` → `'`, `“”` → `'`, `—`·`–` → `-`, `…` → `...`
   (곧은 큰따옴표 `"`는 Windows 금지 문자라 치환 결과로 만들지 않는다)
2. **크로스 플랫폼 금지 문자 제거**: `< > : " / \ | ? *` 와 제어문자(U+0000–U+001F)를
   제거한다. Windows 예약어(`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`)와
   확장자 앞 이름이 **대소문자 무시**로 일치하면 `-note`를 붙인다.
3. emoji 제거
3-1. 치환·제거(1–3)를 모두 마친 뒤 연속 공백을 하나로 접고, 끝의 `.`·공백을 제거한다
4. `.md` 포함 120바이트 초과 시 단어 경계에서 절단
5. 동명 충돌 시 `-1`, `-2` suffix
6. 한글 파일명은 NFC로 저장

provenance는 정규화된 이름으로 기록한다.

## ingest 게이트

- **URL 중복 게이트**: 신규 클리핑의 `source:` URL이 기존 raw frontmatter에 이미 있으면
  새 wiki 노트를 만들지 않고 기존 노트를 갱신한다. 원문은 그래도 `-1` suffix로 raw/에
  보존한다 (재클리핑도 이력이다).
- **파일명 정규화 게이트**: § 파일명 정규화를 적용한 이름으로 이동한다.
