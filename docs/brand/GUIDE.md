# 2nd-brain — 로고 사용 가이드

> 이름이 바뀌면 워드마크(`lockups/`)만 다시 만든다. 심볼·색·아이콘은 그대로 쓴다.

## 1. 로고

**아이디어:** 사분원 네 조각을 반듯이 놓으면, 그리지 않은 반짝임이 가운데 빈자리에 생긴다. 흩어진 자료를 정리하면 통찰이 저절로 보인다는 뜻이다.
네 조각은 앱의 네 흐름(모으기·위키화·승인·읽기)이고, 주황 한 조각은 사람이 승인한 지식이다.

**구성:** 한 변 184 단위 정사각 안에 반지름 88 사분원 4개를 놓는다. 조각 간격은 8, 바깥 모서리 반지름은 26이다. 주황 조각은 늘 오른쪽 아래에 둔다.

| 버전 | 파일 | 쓰는 곳 |
|---|---|---|
| 가로 락업 (기본) | `lockups/2nd-brain-horizontal-light.svg` · `-dark.svg` | 웹 헤더, 문서, 소개 자료 |
| 세로 락업 | `lockups/2nd-brain-stacked-light.svg` · `-dark.svg` | 정사각에 가까운 자리, 스플래시 |
| 심볼 | `symbol/symbol-color.svg` · `symbol-color-on-dark.svg` | 앱 안 로고, 아바타 |
| 작은 크기 심볼 | `symbol/symbol-small.svg` · `symbol-small-on-dark.svg` | 32px 이하 (간격 22, 모서리 18 로 벌려 반짝임이 막히지 않게 함) |
| 단색 | `symbol/variants/*-black·white·mono-ff8a3d.svg` | 인쇄 1도, 각인, 워터마크 |
| 워드마크만 | `lockups/2nd-brain-wordmark.svg` | 심볼이 이미 보이는 자리 |
| 앱 아이콘 | `app-icon/` | 아래 6절 |
| 웹 아이콘 | `web/` | 아래 6절 |

## 2. 여백

로고 둘레에 **X** 만큼 비워 둔다. X = 심볼 너비의 1/4 (사분원 반지름의 절반쯤)이다. 로고가 커지면 X 도 같은 비율로 커진다.
고정 px 값을 쓰지 않는다.

## 3. 최소 크기

| 버전 | 화면 | 인쇄 |
|---|---|---|
| 가로 락업 | 너비 120px | 너비 30mm |
| 세로 락업 | 너비 80px | 너비 20mm |
| 심볼 | 24px (24px 미만은 `symbol-small`) | 6mm |
| 앱 아이콘 타일 | 16px (`app-icon-small`) | — |

16·32·48px 파비콘은 직접 렌더해 반짝임이 열려 있는 것을 확인했다. 인쇄 최소 크기는 권장값이고 실물로 확인하지 않았다.

## 4. 색

| 이름 | 역할 | HEX | RGB | CMYK (단순 변환) |
|---|---|---|---|---|
| Ink | 조각·글자 (밝은 바탕), 타일 바탕 | `#20242C` | 32 36 44 | 27 18 0 83 |
| Paper | 조각·글자 (어두운 바탕) | `#F6EFE2` | 246 239 226 | 0 3 8 4 |
| Spark | 승인된 한 조각, 강조 | `#FF8A3D` | 255 138 61 | 0 46 76 0 |

- CMYK 는 ICC 프로파일 없이 계산한 근사값이다. 인쇄 전에 인쇄소 프로파일로 다시 잡는다. Pantone 대응은 정하지 않았다. 스와치북으로 실물 대조가 필요하다.
- 대비 (WCAG): Paper/Ink 13.6:1 · Spark/Ink 6.63:1 · Spark/Paper 2.05:1 · Spark/흰색 2.35:1.
  → **Spark 는 밝은 바탕 위 글자색으로 쓰지 않는다.** 밝은 바탕에서는 면(조각·버튼 채움)으로만 쓰고, 그 위 글자는 Ink 로 쓴다.

**허용하는 로고·바탕 조합:**
- 컬러(Ink + Spark): 흰색·Paper 바탕 위
- 컬러(Paper + Spark): Ink·검정 바탕 위
- 단색 검정: 흰 바탕 위
- 단색 흰색: Ink·사진의 어두운 면 위
- 사진 위: 차분한 영역에만 놓고, 복잡하면 앱 아이콘 타일째로 놓는다

## 5. 글꼴

- 워드마크: Pretendard SemiBold, 자간 -1%. 글자는 윤곽선(path)으로 바꿔 두었다. 타이핑해서 다시 만들지 않는다.
- 본문·UI: Pretendard (앱이 이미 번들). 웹 대체: `-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`.
- 라이선스: Pretendard 는 SIL OFL 1.1 이라 로고에 쓸 수 있다.
- 워드마크에는 커닝(GPOS)을 적용하지 않았다. 글자 기본 폭으로만 놓았다. 이름이 확정되면 광학 간격을 손으로 다듬는다.

## 6. 앱·웹 아이콘

| 파일 | 용도 |
|---|---|
| `app-icon/icon.icns` | macOS 앱 (16–1024, 64px 이하는 작은 크기 컷) |
| `app-icon/icon.ico` | Windows 앱 (16–256, 작은 크기 컷) |
| `app-icon/icon.png` | 1024px, macOS 아이콘 그리드(824 타일 + 여백 100) |
| `app-icon/app-icon.svg` | 꽉 찬 타일 원본 (모서리 반지름 58/256) |
| `web/favicon.ico`·`favicon.svg`·`favicon-16/32/48.png` | 브라우저 탭 — 타일째로 써서 밝은·어두운 탭 모두에서 보인다 |
| `web/apple-touch-icon.png`·`icon-192/512.png`·`maskable-512.png`·`site.webmanifest`·`head-snippet.html` | 웹·PWA |

이 앱(2nd-brain-app)에 넣는 자리: `electron-builder.yml` 의 `buildResources: build` 라서 `build/icon.icns`·`build/icon.ico`·`build/icon.png` 를 같은 이름으로 덮어쓰면 설치본 아이콘이 바뀐다. 리눅스 창 아이콘은 `resources/icon.png`(`src/main/index.ts` 가 읽는다)다. 레포에는 이미 이 키트의 아이콘이 들어가 있다(글자가 없어 이름 변경과 무관).

## 7. 하지 말 것

- 늘리거나 찌그러뜨리지 않는다.
- 돌리지 않는다. 45° 돌리면 다른 마크(4차 A7)가 된다.
- 주황 조각의 자리를 옮기거나 두 개 이상 칠하지 않는다.
- 팔레트 밖 색을 쓰지 않는다. 그림자·외곽선·그라데이션·광택을 더하지 않는다.
- 조각 간격을 좁히거나 없애지 않는다. 반짝임이 사라진다.
- 락업 안 심볼과 글자의 크기·간격을 바꾸지 않는다.
- 복잡한 사진 위에 맨몸으로 올리지 않는다.

## 8. 아직 안 한 것

- 상표 검색 (KIPRIS·USPTO·역이미지 검색). 사분원 그리드는 바우하우스 계열에 흔한 구성이라 특히 필요하다.
- 인쇄용 PDF·AI·EPS 마스터 (이 환경에 Illustrator·Inkscape 가 없다)

원본 생성 스크립트 `gen_kit.py` 와 목업 보드는 레포 밖 로고 작업 폴더에 있다. 형태·색·이름을 바꾸면 거기서 다시 만들어 이 폴더를 덮어쓴다.
