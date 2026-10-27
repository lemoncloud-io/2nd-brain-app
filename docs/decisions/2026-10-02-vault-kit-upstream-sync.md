---
type: decision
title: vault-kit 은 fork 가 upstream 을 병합해 따라가고, 동기화는 빠진 것이 있으면 실패한다
date: 2026-10-02
sources:
  - scripts/sync-vault-kit.mjs
  - vault-kit.lock.json
  - src/main/verify/vault-verify.ts
---

## Context

앱은 볼트 뼈대·위키화 job spec·검증 스크립트를 `lemoncloud-io/2nd-brain` 고정 커밋에서
번들한다. upstream 이 `vault_verify.py` 에 `next_action` 검사를 더했는데 앱 lock 은 그 전 커밋(e3ea2a4)에 묶여 있었다.
앱의 병합 전 검증은 그 스크립트의 TypeScript 이식이라, 원본과 판정이 갈라져 있었다.

## Decisions

- **fork 가 upstream master 를 병합해 따라간다** — 앱 레인(`vault-ingest-agent.md` 의 App 레인 절)과 앱 뼈대
  (`projects/2nd-brain-app/**`)는 fork 에만 있다. upstream 은 앱 자료를 두지 않으므로 앱 쪽 원본은 fork 다.
- **fork 는 upstream 의 `vault-ingest-claude.md` 를 그대로 두고, 앱이 쓰는 `vault-ingest-agent.md` 를 따로 둔다** — 예전에
  fork 가 claude 파일을 agent 로 옮겨서, upstream 문서가 가리키는 이름이 fork 에 없었다. 두 파일을 같이 두면 upstream
  병합은 claude 파일에만 닿고 앱 레인은 agent 파일에 남는다.
- **동기화는 조용히 건너뛰지 않는다** — lock 경로 하나라도 그 커밋에 없거나, `git archive` 가 실패하거나, job spec 에
  `LANE: team` 줄이 없으면 실패한다. 전에는 없는 경로를 걸러 내고 빈 결과도 성공으로 넘겨, 앱이 job spec 없이 빌드된 뒤
  실행 중에야 터질 수 있었다.
- **앱 검증은 원본과 같은 판정을 낸다** — `next_action` 은 한 문자열에 할 일 하나(300바이트 이하, `;` 로 잇지 않음).
  CRLF 페이지도 Python `read_text` 처럼 줄 끝을 맞춰 판정한다. 대조 테스트(`vault-verify.test.ts`)가 같은 볼트에
  원본을 같이 돌린다.
- **이미 `;` 로 이은 `next_action` 이 있는 보관함은 다음 위키화 병합에서 막힌다** — upstream 과 같은 동작으로 둔다. 결함
  줄이 페이지·줄 번호와 고칠 방법을 말한다.

## Findings

- lock 은 fork PR 브랜치 커밋을 가리킨다. 그 PR 을 squash 로 머지하면 그 커밋이 master 에서 사라져 CI 의
  `cat-file` 이 실패한다 — fork PR 은 merge commit 으로 머지한다.
- 속성 칸에서 쉼표로 나누는 키(tags·aliases 등)가 아닌 키의 목록 값을 고치면 한 글로 합쳐졌다. `next_action` 을 우리말
  이름으로 칸에 올리면서 드러나, 그런 목록은 칸에서 읽기만 하도록 막았다.

## Rejected

- **뼈대와 레인을 앱 레포로 옮기고 upstream 을 직접 고정** — 동기화 스크립트·lock 구조를 바꿔야 하고, upstream 이 앱
  자료를 일부러 걷어낸 뜻과도 어긋난다.
- **없는 lock 경로를 건너뛰는 기존 동작 유지** — 경로가 바뀌면 job spec 이 말없이 빠진다.

## Provenance

