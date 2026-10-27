---
type: decision
title: 다시 답하기는 새 답이 남을 때만 앞 답을 바꾸고, macOS 닫기는 숨기되 종료 이유를 기억한다
date: 2026-10-02
sources:
  - src/main/chat/chat-service.ts
  - src/shared/chat-turn.ts
  - src/main/window/quit-guard.ts
  - src/main/update/updater.ts
---

## Context

채팅에 '다시 답하기'(마지막 답을 새 답으로)를, macOS 에 '창 닫기 = 숨기기'를 더했다. 둘 다 사용자가 가진 것
(앞 답, 쓰던 글, 받아 둔 업데이트)을 잃을 수 있는 길이라, 슬라이스 리뷰(파인더·화면·오류 처리)가 실패 경로를
여러 번 짚었다. 아래는 그 과정에서 굳힌 결정이다.

## Decisions

- **CLI 세션은 이어 쓰고, 새로 답하라는 한 줄을 붙인다.** 설치된 claude 2.1.287 `--help` 와 codex 0.160.0
  `exec resume --help` 에 앞 턴으로 되감는 옵션이 없다. 새 세션은 앞 대화를 잃는다. 세션이 사라져 새로 물을 때는
  그 줄을 빼고 묻는다 — 새 세션에는 지운 답이 없다.
- **앞 답은 새 답이 남을 때만 바꾼다.** 새 답이 실패·멈춤·빈 답이면 앞 답을 되살린다. 저장은 한 번의 쓰기
  (`replaceLastAnswer`)로 해서 중간에 꺼져도 둘 중 하나는 남는다. main 과 화면은 같은 함수(`keepsNewAnswer`)로
  판정하고, main 은 저장한 뒤에 끝을 알려 화면이 저장소를 다시 읽으면 최종 모양이 온다.
- **답이 만든 파일이 남아 있으면 다시 답하지 않는다.** 답을 지우면 되돌리기 카드도 사라지고, 새 답이 같은 파일을
  한 번 더 쓴다. 카드에서 되돌린 뒤에 된다.
- **실패한 질문의 다시 묻기는 질문을 다시 붙이지 않는다.** 질문이 main 에 닿았으면 다시 답하기 길로 보낸다.
  보내기부터 거절됐으면(대화에 없다) 예전처럼 새로 보낸다.
- **macOS 닫기는 숨기기, 끝내기는 ⌘Q·업데이트뿐이다.** 숨긴 동안에도 볼트 감시·팀 살펴보기·진행 작업은 그대로
  돈다. Windows 는 닫으면 끝난다(Grilling Q20).
- **종료는 이유(`user`·`update`)와 함께 기억한다.** 업데이트 설치는 창을 먼저 닫고 `before-quit` 을 나중에 낸다
  (electron.d.ts `before-quit` NOTE) — 그래서 설치 직전에 종료 중이라고 표시한다. 저장 안 한 글이 종료를 막으면
  (`will-prevent-unload`) 숨긴 창을 꺼내 기존 "계속 편집 / 버리기" 확인을 띄운다. 버리기는 막힌 종료를 잇는다 —
  ⌘Q 면 끝내고, 업데이트면 mac 에서 설치를 다시 부른다. Windows 는 electron-updater 가 두 번째 설치 호출을
  무시하므로(BaseUpdater `quitAndInstallCalled`) 그냥 끝낸다.
- **Dock 배지는 받을 팀 변경 수다.** 보관함을 바꾸면 상태가 0 으로 돌아가 배지도 지워진다.

## Rejected

- **앞 답을 먼저 지우고 새로 묻기** — 새 답이 실패하거나 멈추면 앞 답이 영영 사라진다(슬라이스 리뷰 Important).
- **지우기와 덧붙이기를 두 번 쓰기** — 그 사이에 꺼지면 질문만 남는다.
- **⌘Q 때마다 화면에 물어보고 끝내기** — 화면이 멈춰 있으면 앱을 끝낼 수 없다. 저장 안 한 글이 있을 때만
  막히는 기존 `beforeunload` 길을 쓴다.

## Open

- macOS 는 앱이 알림 권한을 받아야 Dock 배지가 보인다(electron.d.ts `dock.setBadge` IMPORTANT). 권한이 없을 때의
  모습은 확인하지 않았다.
- 붙인 문서는 다시 답하기에 다시 싣지 않는다. 세션이 사라져 새로 물으면 검색이 고른 근거만 실린다.

## Provenance

- commits: b88e8ec, 3b3990b, e52d4b5, 21caba6
- sources: node_modules/electron/electron.d.ts (Electron 39.8.10) · electron-updater `out/BaseUpdater.js:43-55`
