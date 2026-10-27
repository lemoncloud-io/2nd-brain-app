---
type: decision
title: 팀 저장소는 앱의 GitHub 로그인 토큰 하나로 쓰고, 토큰은 git 환경 변수로만 넘긴다
date: 2026-10-02
sources:
  - src/main/git.ts
  - src/main/github/repos.ts
  - src/main/vault/app-identity.ts
  - src/main/vault/sync-service.ts
---

## Context

팀 보관함 연결에는 길이 둘 있었다. git 올리기·받기는 Git Credential Manager(브라우저 로그인), 팀 확인 요청(PR)은
앱의 GitHub device flow 토큰을 썼다. 비개발자는 같은 GitHub 로그인을 두 번 했고, 저장소는 GitHub 웹에서 직접
만들어 주소를 붙여 넣어야 했다. 2026-10-01 grilling 에서 "GitHub 연결 하나로" 를 정했고, 이 문서는 그 구현
(PR 그룹 I) 에서 정한 것을 남긴다.

## Decisions

- **인증 경로는 device flow 토큰 하나다** — GCM(`credential.helper=manager`)을 없앴다. scope 는 `repo read:org`
  (`GET /user/orgs` 가 `read:org` 를 요구한다). 이미 로그인한 사용자는 scope 가 늘어 한 번 다시 로그인한다.
- **토큰은 github.com 으로 가는 git 네트워크 명령(push·fetch·clone·ls-remote)에만, 환경 변수로 붙는다** —
  `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` 으로 `http.https://github.com/.extraHeader` 를 넣는다. 명령줄 인자,
  `.git/config`, 그 밖의 파일에는 남지 않는다. `credential.helper=` 를 비워 사용자 PC 의 자격 증명 도우미가 끼어들지
  않게 하고, `GIT_TERMINAL_PROMPT=0` 으로 물어보는 창을 막는다.
- **로그인 전에는 git 을 띄우지 않는다** — GitHub 주소인데 토큰이 없으면 `failure: 'login'` 으로 바로 돌아와
  "로그인부터 해 주세요" 를 말한다. 원격 이름(`origin`)으로 부른 명령도 주소를 풀어 같은 판정을 받는다.
- **GitHub 밖 원격은 받지 않는다**(D2, 사용자 2026-10-01) — 붙여 넣는 주소는 github.com 만 받고, 다른 호스트에는
  토큰을 붙이지 않는다. 인증 길을 하나로 두고, 사용자 본인의 GitHub 계정이라는 제품 전제에 맞춘다.
- **앱이 만드는 커밋의 작성자는 로그인한 GitHub 아이디다**(D1, 사용자 2026-10-01) — `<login>` /
  `<id>+<login>@users.noreply.github.com`. 기록에서 누가 고쳤는지 보이고, 아이디는 PR 로 이미 팀에 보인다.
  로그인 전에는 `2nd-brain` 그대로다.
- **대표는 앱에서 비공개 팀 저장소를 만들고(개인 또는 조직) GitHub 아이디로 팀원을 초대한다. 팀원은 로그인 뒤
  들어갈 수 있는 보관함과 받은 초대를 목록에서 고른다** — 주소 붙여 넣기는 접어 둔 대안으로 남겼다. 혼자 쓰면 팀원
  없는 팀 저장소라, 화면의 "GitHub 백업" 이름을 없앴다.

## Findings

- 저장소를 만든 뒤 연결이나 첫 올리기가 실패할 수 있다. 그래서 만들기 결과는 `connected` 를 따로 돌려준다. 연결됐으면
  "지금 올리기로 다시 올려 주세요", 못 했으면 만든 저장소 주소를 연결 칸에 넣으라고 말한다. 만들기 전체를 실패로 말하면
  다시 누를 때 같은 이름 저장소가 이미 있다.
- 갓 만든 빈 원격에서 받기는 실패로 끝났고, 그 실패가 "지금 올리기" 재시도까지 막았다. 원격에 브랜치가 하나도 없을
  때만 받기를 건너뛴다 — 브랜치 이름이 바뀐 원격까지 건너뛰면 진짜 오류를 숨긴다.
- 조직이 OAuth 앱 접근을 제한하면 403 "OAuth App access restrictions" 가 온다. 사용자가 고칠 수 없으므로 조직
  관리자가 허용해야 한다고 말하고 그 설정 화면 링크를 준다.

## Rejected

- **GCM 유지 + 토큰 병행** — 로그인이 둘로 남는다. 비개발자에게 두 번째 브라우저 로그인은 설명할 수 없다.
- **`GIT_ASKPASS` 스크립트로 토큰 전달** — 스크립트 파일이 디스크에 생긴다. 번들 git 이 `GIT_CONFIG_COUNT` 를
  지원해 파일 없이 된다.
- **GitHub 밖 호스트에만 GCM 남기기** — 인증 길이 다시 둘이 된다(D2).

## Provenance

- 결정 출처: 2026-10-01 grilling(Q16·Q17) 과 플랜 eng·CEO 리뷰(D1·D2)
