# 설치·삭제 테스트 (mac · Windows)

테스트용 **비서명** 빌드의 설치본을 클린 환경에서 설치하고, 첫 실행 마법사로 CLI 를 깔고, 언인스톨한 뒤 잔여물이
0 인지 확인하는 절차. 자동 판정은 `.github/workflows/installer.yml`(windows-latest · macos-latest) 이 하고, 이 문서는
사람이 도는 매트릭스와 CI 가 못 보는 것(Gatekeeper·SmartScreen·실제 벤더 설치기·앱 실행 중 삭제)을 맡는다.

삭제 대상 경로의 정본은 `build/uninstall-targets.json` 이다. 언인스톨러(`build/uninstall-mac.command` ·
`build/installer.nsh`)와 잔여물 검사(`.command --check` · `scripts/installer-test/check-residue.ps1`)가 그 목록을
따르고, `src/main/cli/uninstall-targets.test.ts` 가 세 파일을 정본과 대조한다.

## 산출물

|             | mac (arm64)                                                                                        | Windows (x64)                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 만들기      | `pnpm build:mac` → `dist/2nd-brain-app-<ver>-arm64.dmg`                                            | Windows 에서만: Actions `installer` 의 `windows-installer` 아티팩트(`2nd-brain-app-<ver>-setup.exe`). mac 크로스 빌드는 mac 용 git 을 번들해 못 쓴다 |
| 서명        | ad-hoc(`codesign -s -`, `scripts/after-pack.mjs`) — notarize 없음. 서명·공증본은 `docs/RELEASE.md` | 없음 — 인증서 종류 결정 대기(`docs/RELEASE.md` § Windows 서명)                                                                                       |
| 설치 위치   | `/Applications/2nd-brain.app`                                                              | `%LOCALAPPDATA%\Programs\2nd-brain-app` (per-user 원클릭, 관리자 권한 없음)                                                                          |
| 앱 데이터   | `~/Library/Application Support/2nd-brain-app`                                                      | `%APPDATA%\2nd-brain-app` (+ `%LOCALAPPDATA%\2nd-brain-app-updater`)                                                                                 |
| 언인스톨러  | dmg 루트와 `Contents/Resources/` 의 `Uninstall 2nd-brain.command`                          | `Uninstall 2nd-brain.exe`(설치 폴더) · 프로그램 추가/제거                                                                                    |
| 잔여물 검사 | `bash "Uninstall 2nd-brain.command" --check` (남은 개수 = exit code)                       | `powershell -ExecutionPolicy Bypass -File scripts\installer-test\check-residue.ps1` (`$LASTEXITCODE` = 남은 개수, 64 = 스크립트 오류)                |

## 클린 환경 만들기

- **mac**: 새 사용자 계정(시스템 설정 → 사용자 및 그룹)이 가장 싸다 — 홈이 비어 있으면 CLI·설정·앱 데이터 전부 클린이다.
  같은 머신의 `/Applications` 는 공유되므로 T5·T8 은 앱을 먼저 지운 상태에서 시작한다. 완전 격리는
  [tart](https://github.com/cirruslabs/tart) 또는 UTM 의 macOS VM.
- **Windows**: [Evaluation Center](https://www.microsoft.com/evalcenter/) 의 Windows 11 ISO 로 VM(Hyper-V·VMware·UTM),
  또는 실기기의 새 로컬 계정. `winget`·PowerShell 5.1 만 있으면 된다 — Node·Git 은 필요 없다(앱은 dugite 번들 git 을 쓴다).
- 잔여물 검사 스크립트는 레포가 없는 PC 로 `build/uninstall-targets.json` 과 함께 복사한다(`check-residue.ps1 -Targets <json 경로>`).

## 비서명 빌드 우회 절차

- **mac Gatekeeper**: 다운로드한 dmg 의 앱은 "확인되지 않은 개발자" 로 막힌다. 셋 중 하나:
  - 터미널: `xattr -dr com.apple.quarantine "/Applications/2nd-brain.app"` (격리 속성 제거 — 가장 확실).
  - 한 번 차단당한 뒤 시스템 설정 → 개인정보 보호 및 보안 → 맨 아래 **"그래도 열기"**.
  - Finder 에서 앱을 **우클릭 → 열기** — macOS 15(Sequoia)부터는 이 우회가 없어졌다. 14 이하에서만.
  - dmg 안의 `.command` 도 같은 이유로 더블클릭이 막힌다 — 터미널에서 `bash "/Volumes/2nd-brain/Uninstall 2nd-brain.command"` 처럼 **bash 로 부른다**. 이 문서와 README 의 명령이 전부 `bash "<경로>"` 인 이유다.
- **Windows SmartScreen**: `setup.exe` 실행 시 "Windows 의 PC 보호" → **추가 정보 → 실행**. 브라우저가 다운로드를 막으면 "유지".
- **PowerShell 실행 정책**: 앱의 CLI 설치 버튼은 `-ExecutionPolicy Bypass` 로 벤더 스크립트를 돌린다. 그룹 정책(GPO)이 정책을
  잠근 회사 PC 에서는 Bypass 가 무시돼 설치 버튼이 실패한다 — 그때는 실패 화면의 직접 설치 안내대로 관리자에게 맡긴다.
  `check-residue.ps1` 도 같은 제약을 받는다(`-ExecutionPolicy Bypass -File` 로 부른다).

## 수동 매트릭스

각 칸은 mac / Win 따로. 통과하면 날짜·빌드(커밋 sha)를 적는다.

| #   | 시나리오                                               | 기대                                                                                                                            | mac | Win |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| T1  | 클린 PC: 설치 → 첫 실행(우회 절차) → 볼트 생성         | 시작하기 화면이 뜨고 볼트가 만들어진다                                                                                          | ☐   | ☐   |
| T2  | CLI 없음: "설치" 클릭 → 완료 → 로그인 → 채팅 1회       | 터미널 없이 CLI 가 깔리고 `userData/installed-cli/claude`(+ `claude.config`) 마커가 생긴다. Codex 도 같은 길                    | ☐   | ☐   |
| T3  | 네트워크 끊고 "설치" → 실패 화면 → 복구 후 "다시 시도" | 마지막 오류 줄과 다시 시도 버튼, 직접 설치 안내가 펼쳐진다. 마커 없음(`.pending` 은 남을 수 있다)                               | ☐   | ☐   |
| T4  | 언인스톨 → 잔여물 검사 0 · 볼트 생존                   | mac: `--check` exit 0. Win: `check-residue.ps1` exit 0. 볼트 폴더는 그대로                                                      | ☐   | ☐   |
| T5  | CLI 가 이미 있는 PC: 설치 → 언인스톨                   | CLI·`~/.claude`·`~/.codex` 생존(마커가 없다). 잔여물 검사에는 그 경로가 남은 것으로 보인다(아래 알려진 사항)                    | ☐   | ☐   |
| T6  | 앱 실행 중 언인스톨                                    | mac: 앱이 닫히고 삭제 완료(5초 안에 안 닫히면 exit 3 으로 멈추고 아무것도 안 지운다). Win: 언인스톨러가 앱 종료를 요청하고 진행 | ☐   | ☐   |
| T7  | 재설치(같은 버전 덮어쓰기)                             | 설정·마커 유지. Win: 새 설치기가 옛 언인스톨러를 `--updated` 로 부르는 경로 — CLI·앱 데이터 그대로                              | ☐   | ☐   |
| T8  | 설치 → 언인스톨 → 재설치                               | 첫 실행이 완전 초기 상태(시작하기부터)                                                                                          | ☐   | ☐   |

Windows 대화형 언인스톨은 앱이 깐 CLI 가 있으면 한 번 묻는다(문구는 마커대로 — 설정 마커가 있을 때만 "설정·대화 기록도").
**아니오**면 CLI 는 남고 앱만 지워지며, 그 뒤로는 그 CLI 를 사용자가 깐 것으로 본다(마커가 앱 데이터와 함께 사라진다).
`/S`(무인)는 묻지 않고 마커대로 지운다 — 무인 설치와 대칭이고, "전부 삭제" 가 사용자 결정이다. mac `--yes` 도 같다.

## CI 가 판정하는 것

`installer.yml` 은 `electron-builder.yml`·`build/**`·`scripts/after-pack.mjs`·`scripts/installer-test/**`·자기 자신이 바뀔 때와 수동 실행에서 돈다.

- **windows-latest**: nsis 빌드 → `/S` 설치 → 기동 10초 → 가짜 CLI 트리·마커 심기(정본 win 경로 그대로, Codex bin 은 정션) →
  `--updated` 언인스톨(CLI·앱 데이터 생존) → 재설치 → `/S` 언인스톨 → `check-residue.ps1` 로 판정. 마커는 `codex.config` 만
  빼고 심으므로 `~\.codex` 하나가 남는 것이 **정답**이다(설정 마커 게이트의 증거) — 그 한 줄만 남고 exit 1 이어야 통과.
- **macos-latest**: dmg 빌드 → 마운트·`/Applications` 복사 → 기동 10초 → 가짜 트리 + 마커 4개 → 번들 안 사본으로
  `--yes`(재배치 경로) → `--check` exit 0 · 볼트 생존.
- CI 가 못 보는 것: 실제 벤더 설치기(네트워크·`~/.zprofile` 편집), Gatekeeper/SmartScreen, 앱 실행 중 삭제(T6), 대화형 "아니오".

## 알려진 잔여물·제약

- **셸 프로필의 PATH 줄**은 지우지 않는다 — Codex 설치기는 `~/.zprofile` 에 `# >>> Codex installer >>>` 블록을, Windows 는 사용자
  PATH 환경변수에 항목을 남긴다. 남의 파일이라 편집하지 않는다(2026-09-21 실측).
- **`~/.codex/tmp` 와 빈 `~/.codex/packages`** 는 바이너리 마커만 있을 때(설정 폴더가 원래 있던 사용자) 남는다 — `~/.codex` 는
  그 사용자 것이라 안 건드린다.
- **잔여물 검사는 마커와 무관하게 정본 전체를 본다.** 언인스톨이 앱 데이터와 함께 마커를 지운 뒤에도 CLI 잔여물을 잡으려면 목록이
  기준이어야 해서다. 그래서 원래 자기 CLI 가 있던 PC(T5)에서는 그 경로가 "남음" 으로 보인다 — 거짓 경보이고, 기대값이다.
- **번들 안 언인스톨러 사본은 서명 검증 없이 bash 로 돈다.** ad-hoc 빌드라 어차피 검증할 서명이 없다. 스크립트는 지우기 전에
  그 번들의 `CFBundleIdentifier` 가 `io.lemoncloud.2nd-brain-desktop` 인지 대조한다(아니면 exit 66).
- **마커는 파일 존재 검사다.** 같은 사용자로 도는 다른 프로세스가 마커를 만들 수 있지만, 그 프로세스는 `~/.claude` 를 직접 지울 수도
  있으므로 마커가 새 경계를 만들지는 않는다.
- **mac Preferences** 는 `~/Library/Preferences/<appId>.plist` 파일만 지운다. cfprefsd 캐시에 남은 값은 로그아웃 뒤 사라진다
  (`defaults delete` 는 안 쓴다 — 임시 HOME 으로 테스트할 때도 실사용자 도메인을 지운다).
- **Windows 정션**: 언인스톨러는 최상위 경로가 정션·심링크면 링크만 뗀다(대상 트리는 남는다). Codex 의 `Programs\OpenAI\Codex\bin` 은
  실체(`~\.codex\packages\standalone`)를 먼저 지운 뒤 부모를 지우므로 따라갈 곳이 없다.
- **잠긴 파일**(실행 중인 `claude.exe`)은 재부팅 때 지워진다(`/REBOOTOK`) — 그때까지 잔여물 검사에 잡힌다.
- **개발 머신**: `pnpm dev` 도 `~/Library/Application Support/2nd-brain-app` 을 같이 쓴다 — 언인스톨러가 그 데이터도 지운다.
  `uninstall-mac.command` 를 직접 돌릴 때는 `HOME=<임시>` `SECOND_BRAIN_APPLICATIONS_DIR=<임시>` 로 격리한다(`--check` 는 안전).
