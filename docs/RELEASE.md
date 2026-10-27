# 릴리스

설치본을 만들어 팀에 전하는 절차. `v*` 태그를 올리면 `.github/workflows/release.yml` 이 mac·Windows 설치본과
업데이트 목록(`latest-mac.yml`·`latest.yml`)을 이 레포의 **draft** Release 에 올린다. 공개는 사람이 draft 를 풀어서 한다.

레포가 private 인 동안 앱의 자동 업데이트는 꺼져 있다(`src/main/update/updater.ts` `AUTO_UPDATE = false`).
설치본은 draft Release 에서 받아 사람이 직접 전한다 — 앱이 private 레포를 읽으려면 토큰을 앱에 넣어야 하고,
그건 유출이다(2nd-brain `projects/2nd-brain-app/design.md` §4.5). 결정 기록: `docs/decisions/2026-09-27-release-updater-off-while-private.md`.

## 릴리스 내기

1. `package.json` 의 `version` 을 올려 main 에 머지한다.
2. 같은 버전으로 태그를 올린다: `git tag v0.2.0 && git push origin v0.2.0`.
   태그가 `v` + package.json version 과 다르면 `prepare` 잡이 멈춘다. 이미 공개된 릴리스의 태그면 역시 멈춘다.
3. Actions `release` 가 끝나면 Releases 에 `v0.2.0` draft 가 있다. `assets` 잡이 `.dmg`·`-mac.zip`·`latest-mac.yml`·
   `-setup.exe`·`latest.yml` 이 다 올라갔는지 이미 확인했다.
4. 설치본을 한 번 깔아 본다(`docs/INSTALL-TEST.md`). 괜찮으면 draft 를 그대로 두고 설치본 파일을 팀에 전한다.

서명 비밀값이 비어 있으면 mac 은 ad-hoc 서명, Windows 는 서명 없이 올라가고 잡 로그에 경고가 남는다.
이 설치본은 Gatekeeper·SmartScreen 경고를 띄운다(우회 방법은 `docs/INSTALL-TEST.md`).

## 한 번 할 일 — 서명 준비

GitHub 설정에서 사람이 한다. 코드에는 없다.

1. **environment `release`** — Settings → Environments 에서 만들고 **필수 리뷰어**를 둔다. mac 서명 잡이 이 environment 에서
   돌아서, 리뷰어가 승인해야 서명한다.
2. **`v*` 태그 보호** — Settings → Rules 에서 태그 ruleset 으로 `v*` 생성·삭제를 관리자만 하게 한다.
3. **mac 비밀값** — environment `release` 에 넣는다(레포 비밀값이 아니다).

   | 이름                   | 내용                                                                                                                                                                  |
   | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `MAC_CSC_NAME`         | 인증서 이름. 예: `Developer ID Application: <법인> (<TEAMID>)` — 워크플로가 접두어를 떼고 넘긴다 — `electron-builder.yml` 의 `mac.identity: null` 을 이 값으로 덮는다 |
   | `MAC_CSC_LINK`         | Developer ID Application 인증서 `.p12` 의 base64                                                                                                                      |
   | `MAC_CSC_KEY_PASSWORD` | 그 `.p12` 암호                                                                                                                                                        |
   | `APPLE_API_KEY`        | App Store Connect API 키 `.p8` 파일 **내용** — 워크플로가 임시 파일로 쓰고 끝나면 지운다                                                                              |
   | `APPLE_API_KEY_ID`     | 그 키의 ID                                                                                                                                                            |
   | `APPLE_API_ISSUER`     | Issuer ID                                                                                                                                                             |

   `MAC_CSC_*` 만 있으면 서명만 하고 공증은 건너뛴다(경고). 공증까지 되면 `spctl -a -vv -t install <앱>` 이 accepted,
   `xcrun stapler validate <dmg>` 가 통과한다.

**첫 서명 릴리스 전에 반드시** — `build/entitlements.mac.plist` 의 `allow-dyld-environment-variables`·
`allow-unsigned-executable-memory` 를 빼 보고 공증본이 뜨는지 확인한다. 둘 다 hardened runtime 의 방어를 푼다.
hardened runtime 은 Developer ID 서명에서만 켜져 ad-hoc 빌드로는 확인할 수 없어 미뤄 두었다.

## Windows 서명 — 아직 없음

인증서 종류를 정해야 붙일 수 있다. 2023-06 부터 코드 서명 키는 하드웨어(HSM)에만 둘 수 있어 `.pfx` 파일 방식은 없다.

- **Azure Trusted Signing** — electron-builder 26 의 `win.azureSignOptions`. 한국 법인이 가입 자격이 되는지는 미검증.
- **클라우드 HSM 인증서**(SSL.com eSigner·DigiCert KeyLocker 등) — 벤더 서명 도구를 `win.signtoolOptions` 로 부른다.

정하면 `release.yml` `windows` 잡에 서명 비밀값과 옵션을 더한다. 서명이 붙으면 설치본의 `app-update.yml` 에
`publisherName` 이 들어가 업데이터가 새 설치 파일의 서명을 대조한다.

## 공개 전환 — 자동 업데이트 켜기

1. 레포를 `lemoncloud-io` 로 옮기고 이력의 비밀값을 스캔한다.
2. `electron-builder.yml` 의 `publish.owner`·`publish.repo` 를 새 위치로 바꾼다.
3. `src/main/update/updater.ts` 의 `AUTO_UPDATE` 를 `true` 로 바꾼다.
4. mac 업데이터 캐시(`~/Library/Caches/2nd-brain-app-updater`)를 `build/uninstall-targets.json` 에 더한다 —
   Windows 쪽(`%LOCALAPPDATA%\2nd-brain-app-updater`)은 이미 있다.
5. Windows 서명을 먼저 붙인다 — 서명 없는 설치 파일을 앱이 스스로 받아 실행하게 두지 않는다.
6. 새 버전을 태그로 내고 draft 를 **공개**한다. 설치된 앱이 그 버전을 받으면 설정 → 앱 업데이트와 사이드바에
   "다시 시작" 이 선다.

켜진 앱은 시작 30초 뒤와 6시간마다 새 버전을 보고, 있으면 받아 둔다. 설치는 사람이 "다시 시작" 을 누르거나
앱을 닫을 때 된다.
