---
type: decision
title: 위키화 직전 팀 받기에 25초 상한 + 실패하면 사람이 고른다, run-log에 구간 계측을 남긴다
date: 2026-10-11
sources:
  - src/main/ipc/ingest-handlers.ts
  - src/main/vault/sync-service.ts
  - src/main/ingest/pipeline.ts
  - src/main/ingest/assemble.ts
  - src/renderer/src/pages/IngestSection.tsx
---

## Context

단건 "몇 분" 용의자 조사(Sonnet 고정): 재시도는 실측 10회 중 0회, 모델 편차는 ±15%(20.3~25.2초).
남은 것은 위키화 시작 전 `runSync`다. 가져오기 기본 상한이 10분이라 멈춘 네트워크에 붙잡히면
"팀 변경을 받는 중이에요"에서 최대 10분 멈춘다. 그리고 run-log에는 시간 기록이 없어 터졌는지 알 수 없었다.

## Decisions

- **위키화 직전 받기의 가져오기는 25초 상한이다.** `syncVault(vaultDir, { fetchTimeoutMs })`로
  받기·올리기 버튼 경로는 10분 기본값을 그대로 둔다. 델타 받기에 25초는 넉넉하다.
- **상한·실패하면 막지 않고 고르게 한다.** `sync-needed` 결과에 사유를 담고, 화면은 "동기화 없이 시작"
  (옛 베이스로 쓸 수 있다고 알린다)과 "다시 받기"를 둔다. 연결 없음은 기존대로 조용히 진행한다.
- **run-log에 구간 계측을 남긴다.** 준비·초안·정리 초 + 초안 입력 문자 + 호출 횟수. 재시도면 합산된다.
  다음 "몇 분"은 이 두 줄로 바로 가려진다. frontmatter 스키마는 손대지 않는다(본문에만 둔다).

## Rejected

- **실패하면 조용히 진행** — 지금까지 동작. 옛 베이스에 쓰는 위험을 안 보이게 넘긴다.
- **실패하면 무조건 막기** — 오프라인 사용자의 위키화가 매번 막힌다. 선택지가 있어야 한다.
- **조립 시간까지 파이프라인에서 재기** — run-log를 쓰는 조립 안에서 재는 것이 정확하다.

## Open

- 25초가 팀 볼트 첫 대용량 받기에 짧을 수 있다. 델타만 받는 자리라 일단 둔다.
- "동기화 없이 시작" 선택률 자체가 지표다. 자주 눌리면 상한·재시도 정책을 다시 본다.

## Provenance

- branch: research/ingest-speed-1011
