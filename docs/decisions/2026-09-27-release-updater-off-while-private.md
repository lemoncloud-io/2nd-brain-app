---
type: decision
title: 릴리스는 private 레포 draft 로, 자동 업데이트는 공개 전까지 꺼 둔다
date: 2026-09-27
sources:
  - docs/RELEASE.md
  - .github/workflows/release.yml
  - src/main/update/updater.ts
  - electron-builder.yml
---

## Context

비개발자가 설치 경고 없이 앱을 열고 새 버전을 앱이 받게 하려면 서명된 설치본과 자동 업데이트가 필요하다.
electron-updater 가 받을 곳은 GitHub Release 인데, 소스 레포 `lemoncloud-io/2nd-brain-app` 은 private 이다.
private 레포의 Release 를 앱이 읽으려면 토큰을 앱에 넣어야 한다.

## Decision

- 릴리스는 `v*` 태그 → 이 레포의 **draft** Release. 설치본은 사람이 전한다.
- 앱의 자동 업데이트 코드는 넣고 **소스 상수 `AUTO_UPDATE = false`** 로 끈다. 꺼진 앱은 electron-updater 를
  불러오지도 않는다. 빌드 env 대신 소스 상수인 것은, CI env 하나의 실수로 private 기간 빌드가 켜지지 않게 하려는 것이다.
- mac 은 `mac.identity: null` 을 유지하고 릴리스 CI 만 `-c.mac.identity` 로 서명을 켠다 — 개발 PC 키체인에 다른 명의의
  Developer ID 가 있어도 로컬 빌드가 그걸로 서명하지 않게.
- 서명 비밀값은 environment `release`(필수 리뷰어) 에 둔다. 누구든 태그를 올릴 수 있는 사람이 서명본을 만들 수 없게.

## Alternatives rejected

- **공개 릴리스 전용 레포**(`2nd-brain-releases`) — 지금 바로 자동 업데이트가 되지만, 설계 기록(2nd-brain
  `projects/2nd-brain-app/design.md` §4.5)이 정한 공개 전환 순서(이전·비밀값 스캔)를 건너뛴다. 사용자가 기각(2026-09-27).
- **S3/R2 generic provider** — 버킷·자격증명 운영이 새로 생긴다. "우리 서버 없음" 원칙과 경계선이다.
- **private GitHub provider + 앱 내 토큰** — 토큰 유출.

## Consequences

- 공개 전환 때 `AUTO_UPDATE`·`publish.owner/repo` 두 곳을 바꾼다(`docs/RELEASE.md` § 공개 전환).
- Windows 서명은 인증서 종류가 정해질 때까지 없다 — 공개 전환의 선행 조건이다.
- 첫 서명 릴리스 전에 entitlements 두 키를 줄여 공증본 기동을 확인해야 한다(ad-hoc 로는 확인 불가).
