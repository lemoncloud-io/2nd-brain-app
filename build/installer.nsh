; electron-builder nsis include — 템플릿(app-builder-lib/templates/nsis)이 정의된 매크로를 끼워 넣는다.
; customUnInstall 은 설치 파일·앱 데이터 삭제보다 먼저 돈다(uninstaller.nsh:156 → :232) — 그래서 여기서
; %APPDATA%\2nd-brain-app\installed-cli 의 마커를 읽을 수 있다. 앱이 설치한 CLI 삭제가 이 매크로에 들어온다.
;
; 경로의 정본은 build/uninstall-targets.json 의 win 이다 — 여기 적힌 리터럴을 src/main/cli/uninstall-targets.test.ts 가
; 그 목록과 대조한다(07). NSIS 상수: $APPDATA=%APPDATA% · $LOCALAPPDATA=%LOCALAPPDATA% · $PROFILE=%USERPROFILE%.
; 마커는 확정된 이름(<engine> · <engine>.config)만 본다. .pending 은 끊긴 설치의 기록이라 읽지 않는다.
; 업데이트(새 설치기가 옛 언인스톨러를 --updated 로 부른다)에서는 아무것도 건드리지 않는다 — 템플릿이 앱 데이터를
; 남기는 것과 같은 가드(${isUpdated}).

; 트리 삭제. 경로 자체가 정션·심링크(reparse point)면 링크만 떼고 대상은 건드리지 않는다 — NSIS 의 RMDir /r 은
; FILE_ATTRIBUTE_DIRECTORY 만 보고 재귀해 링크를 따라 들어간다(kichik/nsis Source/exehead/util.c myDelete, 2026-09-21 확인).
; 사용자가 ~\.claude 를 다른 드라이브로 옮기고 정션을 남겼으면 그 실체가 지워진다. 0x400 = FILE_ATTRIBUTE_REPARSE_POINT.
; -1(INVALID_FILE_ATTRIBUTES) 은 없는 경로 외에 접근 거부·경로 길이 초과에서도 온다 — 판정을 못 하면 건드리지 않는다.
; 실재하는 트리가 남으면 잔여물 검사(check-residue)가 잡는다.
!macro removeTree path
  System::Call 'kernel32::GetFileAttributes(t "${path}") i .r0'
  ${if} $0 = -1
    DetailPrint "Skipping ${path}: attributes unreadable"
  ${else}
    IntOp $1 $0 & 0x400
    ${if} $1 <> 0
      RMDir /REBOOTOK "${path}"
    ${else}
      RMDir /r /REBOOTOK "${path}"
    ${endIf}
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; 02 실측: 템플릿은 설치 폴더와 $APPDATA\2nd-brain-app 만 지운다 — 업데이터 캐시는 여기서
    ${if} $LOCALAPPDATA != ""
      !insertmacro removeTree "$LOCALAPPDATA\2nd-brain-app-updater"
    ${endIf}

    Var /GLOBAL cliClaude
    Var /GLOBAL cliClaudeConfig
    Var /GLOBAL cliCodex
    Var /GLOBAL cliCodexConfig
    Var /GLOBAL deleteCli
    StrCpy $cliClaude "0"
    StrCpy $cliClaudeConfig "0"
    StrCpy $cliCodex "0"
    StrCpy $cliCodexConfig "0"
    StrCpy $deleteCli "0"
    ${if} ${FileExists} "$APPDATA\2nd-brain-app\installed-cli\claude"
      StrCpy $cliClaude "1"
      StrCpy $deleteCli "1"
    ${endIf}
    ${if} ${FileExists} "$APPDATA\2nd-brain-app\installed-cli\claude.config"
      StrCpy $cliClaudeConfig "1"
      StrCpy $deleteCli "1"
    ${endIf}
    ${if} ${FileExists} "$APPDATA\2nd-brain-app\installed-cli\codex"
      StrCpy $cliCodex "1"
      StrCpy $deleteCli "1"
    ${endIf}
    ${if} ${FileExists} "$APPDATA\2nd-brain-app\installed-cli\codex.config"
      StrCpy $cliCodexConfig "1"
      StrCpy $deleteCli "1"
    ${endIf}

    ; 삭제 경로가 $PROFILE·$LOCALAPPDATA 아래다 — 비어 있으면 "\.claude" 가 되어 드라이브 루트를 가리킨다
    ${if} $PROFILE == ""
    ${orIf} $LOCALAPPDATA == ""
      StrCpy $deleteCli "0"
    ${endIf}

    ; 사람이 돌리는 언인스톨은 CLI·설정 삭제를 한 번 묻는다. /S 는 마커대로 지운다(무인 설치와 대칭).
    ; 문구는 마커대로 — 설정 마커가 없는데 "설정도 지운다" 고 하면 거짓 전제로 아니오를 누르게 된다.
    Var /GLOBAL cliQuestion
    StrCpy $cliQuestion "이 앱이 설치한 Claude/Codex CLI 도 지웁니다."
    ${if} $cliClaudeConfig == "1"
    ${orIf} $cliCodexConfig == "1"
      StrCpy $cliQuestion "이 앱이 설치한 Claude/Codex CLI 와 그 설정·대화 기록(%USERPROFILE%\.claude, \.codex)도 지웁니다."
    ${endIf}
    ; 아니오면 CLI 는 남지만 마커(앱 데이터 안)는 템플릿이 지운다 — 다음 설치부터는 사용자가 깐 CLI 로 본다. 문구에 적는다.
    ; 점프는 레이블로 — 상대 오프셋(+2)은 사이에 한 줄만 끼어도 "아니오"가 삭제로 뒤집힌다.
    ${if} $deleteCli == "1"
    ${andIfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
        "$cliQuestion$\r$\n$\r$\n같이 지울까요? 아니오를 누르면 CLI 는 남고 앱만 지워집니다. 남긴 CLI 는 이후 이 앱이 다시 지우지 않습니다." \
        IDYES cliConfirmed
      StrCpy $deleteCli "0"
      cliConfirmed:
    ${endIf}

    ${if} $deleteCli == "1"
      ; 실행 중인 claude.exe 는 Delete 가 실패한다 — /REBOOTOK 이면 재부팅 때 지워진다. 그때까지는 잔여물 검사가 잡는다.
      ${if} $cliClaude == "1"
        DetailPrint "Removing Claude CLI installed by 2nd-brain"
        Delete /REBOOTOK "$PROFILE\.local\bin\claude.exe"
        !insertmacro removeTree "$PROFILE\.local\share\claude"
        !insertmacro removeTree "$PROFILE\.local\state\claude"
        !insertmacro removeTree "$PROFILE\.cache\claude"
      ${endIf}
      ${if} $cliClaudeConfig == "1"
        DetailPrint "Removing Claude settings created by 2nd-brain"
        !insertmacro removeTree "$PROFILE\.claude"
        Delete /REBOOTOK "$PROFILE\.claude.json"
      ${endIf}
      ; Codex: 실체(standalone)를 먼저 지운다. Programs\OpenAI\Codex\bin 은 그 안을 가리키는 정션이라 실체가 사라진 뒤에는
      ; 끊어진 링크다 — 부모를 재귀 삭제해도 따라갈 곳이 없다. (standalone 이 잠겨 재부팅으로 밀리면 정션을 따라가지만
      ; 그 안도 같은 codex 마커의 삭제 대상이라 피해 범위가 늘지 않는다. removeTree 는 최상위 경로의 링크만 본다.)
      ${if} $cliCodex == "1"
        DetailPrint "Removing Codex CLI installed by 2nd-brain"
        !insertmacro removeTree "$PROFILE\.codex\packages\standalone"
        !insertmacro removeTree "$LOCALAPPDATA\Programs\OpenAI\Codex"
      ${endIf}
      ${if} $cliCodexConfig == "1"
        DetailPrint "Removing Codex settings created by 2nd-brain"
        !insertmacro removeTree "$PROFILE\.codex"
      ${endIf}
      ; 잠긴 파일(실행 중인 claude.exe)은 재부팅 때 지워진다 — 로그에 남겨야 잔여물 검사 결과를 읽을 수 있다
      IfRebootFlag 0 +2
        DetailPrint "Some CLI files are in use and will be removed after a reboot"
    ${endIf}
  ${endIf}
!macroend
