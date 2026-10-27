#!/bin/bash
# 2nd-brain mac 언인스톨러 — 앱·앱 데이터·앱이 깐 CLI 를 지운다.
# 경로 목록의 정본은 build/uninstall-targets.json 이다. 이 파일은 그 목록을 리터럴로 옮겨 적었고,
# src/main/cli/uninstall-targets.test.ts 가 둘을 대조한다(07). 글롭은 쓰지 않는다.
#
#   bash "Uninstall 2nd-brain.command"          확인 프롬프트 뒤 삭제
#   bash "Uninstall 2nd-brain.command" --yes    묻지 않고 삭제
#   bash "Uninstall 2nd-brain.command" --check  지우지 않고 남은 것만 출력, 개수가 exit code
#
# exit code: 0 성공 · 1 취소/일부 실패 · 3 앱 실행 중 · 64 인자 오류 · 65 HOME 부적합 · 66 번들 불일치 · 2 확인 불가.
# --check 의 개수는 최대 20 이라 64 이상과 겹치지 않는다.
#
# 다운로드한 dmg 의 .command 는 더블클릭이 Gatekeeper 에 막힌다 — 위처럼 bash 로 부른다(docs/INSTALL-TEST.md).
# 앱이 깐 CLI 만 지운다: userData/installed-cli/<engine>(바이너리) · <engine>.config(설정) 확정 마커의
# 정확한 이름만 본다. .pending 은 읽지 않는다 — 끊긴 설치의 기록이라 CLI 가 누구 것인지 모른다.
set -u
# 파괴적 명령(rm·pgrep·osascript)을 PATH 로 찾는다 — 오염된 프로필의 PATH 가 그것들을 바꿔치지 못하게 고정
PATH=/usr/bin:/bin:/usr/sbin:/sbin

APP_NAME='2nd-brain'
PACKAGE_NAME='2nd-brain-app'
APP_ID='io.lemoncloud.2nd-brain-desktop'
# 테스트가 /Applications 대신 임시 폴더를 넘긴다
APPLICATIONS="${SECOND_BRAIN_APPLICATIONS_DIR:-/Applications}"

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

mode='ask'
for arg in "$@"; do
  case "$arg" in
    # 둘이 같이 오면 의도를 모른다 — 마지막 것이 이기게 두면 "--check --yes" 가 지운다
    --yes) [ "$mode" = 'check' ] && { echo "--yes 와 --check 는 같이 못 쓴다" >&2; exit 64; }; mode='yes' ;;
    --check) [ "$mode" = 'yes' ] && { echo "--yes 와 --check 는 같이 못 쓴다" >&2; exit 64; }; mode='check' ;;
    --help | -h) usage; exit 0 ;;
    *) echo "모르는 인자: $arg" >&2; usage >&2; exit 64 ;;
  esac
done

# 지우는 경로가 전부 $HOME 아래다 — 비어 있으면 "/.claude" 가, "/" 면 "//.claude" 가 되어 남의 파일을 지운다
if [ -z "${HOME:-}" ] || [ "$HOME" = "/" ]; then
  echo "HOME 이 비었거나 / 다 — 아무것도 지우지 않는다" >&2
  exit 65
fi

# 앱 번들 안(Contents/Resources)에서 돌면 자기 번들을 지우다 끊긴다 — $TMPDIR 로 복사해 거기서 다시 돈다.
# 원래 위치는 UNINSTALL_ORIGIN 으로 넘겨 앱 경로를 정하는 데 쓴다. 재배치 신호는 인자가 아니라 환경변수다 —
# 인자로 열어 두면 사용자가 그대로 넘겨 원본(번들 안 사본)이 자기를 지운다.
origin="${UNINSTALL_ORIGIN:-$0}"
tmp_root="${TMPDIR:-/tmp}"
if [ "${UNINSTALL_RELOCATED:-}" = "1" ]; then
  # 재배치본은 끝나면 자기를 지운다 — 안 그러면 삭제 1회당 $TMPDIR 에 사본이 남는다. 그 위치일 때만.
  case "$0" in
    "$tmp_root"/uninstall-2nd-brain.*) trap 'rm -f -- "$0"' EXIT ;;
  esac
elif [ "$mode" != 'check' ]; then
  copy="$(mktemp "$tmp_root/uninstall-2nd-brain.XXXXXX")" || exit 1
  cp "$0" "$copy" && UNINSTALL_RELOCATED=1 UNINSTALL_ORIGIN="$origin" exec bash "$copy" "$@"
  exit 1
fi

# 앱 경로: 이 스크립트가 어느 번들의 Resources 안에 있으면 그 번들, 아니면(dmg 루트·따로 복사) /Applications
case "$origin" in
  *".app/Contents/Resources/"*) APP="${origin%%.app/Contents/Resources/*}.app" ;;
  *) APP="$APPLICATIONS/$APP_NAME.app" ;;
esac
case "$APP" in
  *.app) ;;
  *) echo "앱 경로가 .app 으로 끝나지 않는다: $APP" >&2; exit 2 ;;
esac
# 경로가 환경(UNINSTALL_ORIGIN·SECOND_BRAIN_APPLICATIONS_DIR)에서 왔다 — 지우기 전에 정말 이 앱인지 번들 id 로 확인한다
if [ -e "$APP" ]; then
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist" 2>/dev/null || true)"
  if [ "$bundle_id" != "$APP_ID" ]; then
    echo "$APP 은 $APP_NAME 이 아니다(CFBundleIdentifier=${bundle_id:-없음}) — 아무것도 지우지 않는다" >&2
    exit 66
  fi
fi

USER_DATA="$HOME/Library/Application Support/$PACKAGE_NAME"
MARKERS="$USER_DATA/installed-cli"

# 마커는 userData 를 지우기 전에 읽는다
has_marker() { [ -f "$MARKERS/$1" ]; }

# --- 삭제 대상 (uninstall-targets.json 의 mac 과 같은 순서) ---
always=(
  "$APP"
  "$USER_DATA"
  "$HOME/Library/Preferences/$APP_ID.plist"
  "$HOME/Library/Caches/$APP_ID"
  "$HOME/Library/Saved Application State/$APP_ID.savedState"
)
claude=(
  "$HOME/.local/bin/claude"
  "$HOME/.local/share/claude"
  "$HOME/.local/state/claude"
  "$HOME/.cache/claude"
)
claude_config=(
  "$HOME/.claude"
  "$HOME/.claude.json"
)
codex=(
  "$HOME/.codex/packages/standalone"
  "$HOME/.local/bin/codex"
  "$HOME/.local/bin/codex-code-mode-host"
)
codex_config=(
  "$HOME/.codex"
)

exists() { [ -e "$1" ] || [ -L "$1" ]; }

# --check: 마커와 무관하게 목록 전체를 본다 — 언인스톨이 userData 와 함께 마커를 지운 뒤에도 CLI 잔여물을 잡으려면
# 목록이 기준이어야 한다. 원래 자기 CLI 가 있던 PC 에서는 그 경로가 잔여물로 보인다(docs/INSTALL-TEST.md 알려진 잔여물).
if [ "$mode" = 'check' ]; then
  left=0
  for path in "${always[@]}" "${claude[@]}" "${claude_config[@]}" "${codex[@]}" "${codex_config[@]}"; do
    if exists "$path"; then
      echo "남음: $path"
      left=$((left + 1))
    fi
  done
  [ "$left" -eq 0 ] && echo "잔여물 없음"
  exit "$left"
fi

targets=("${always[@]}")
notes=()
if has_marker claude; then
  targets+=("${claude[@]}")
  notes+=("Claude CLI 는 이 앱이 깔았다 — 같이 지운다")
fi
if has_marker claude.config; then
  targets+=("${claude_config[@]}")
  notes+=("Claude 설정·대화 기록(~/.claude · ~/.claude.json)도 이 앱이 만들었다 — 같이 지운다")
fi
if has_marker codex; then
  targets+=("${codex[@]}")
  notes+=("Codex CLI 는 이 앱이 깔았다 — 같이 지운다")
fi
if has_marker codex.config; then
  targets+=("${codex_config[@]}")
  notes+=("Codex 설정·대화 기록(~/.codex)도 이 앱이 만들었다 — 같이 지운다")
fi

# mac 기본 bash 3.2 는 set -u 에서 빈 배열 확장을 unbound 로 본다
print_notes() { for note in ${notes[@]+"${notes[@]}"}; do echo "  $note"; done; }
# 설정·대화 기록을 지운다는 말은 --yes 여도 한다 — 로그에 남아야 한다
[ "$mode" = 'yes' ] && print_notes
if [ "$mode" = 'ask' ]; then
  echo "$APP_NAME 을 지운다. 다음 경로가 삭제된다:"
  for path in "${targets[@]}"; do
    if exists "$path"; then echo "  $path"; else echo "  $path (없음)"; fi
  done
  echo "  $USER_DATA 는 개발용 pnpm dev 도 같은 폴더를 쓴다 — 개발 머신이면 그 데이터도 사라진다"
  print_notes
  echo "볼트 폴더와 이 앱이 깔지 않은 CLI·설정은 건드리지 않는다."
  if [ ! -t 0 ]; then
    echo "터미널이 아니라 확인을 받을 수 없다 — 묻지 않고 지우려면 --yes" >&2
    exit 2
  fi
  printf '계속할까? [y/N] '
  IFS= read -r answer
  case "$answer" in
    y | Y | yes | YES) ;;
    *) echo "취소했다"; exit 1 ;;
  esac
fi

# 앱 종료 — 열려 있으면 번들을 지워도 프로세스가 남고 다음 실행이 반쯤 지워진 앱을 연다.
# 이 번들 경로에서 뜬 프로세스가 있을 때만 quit 을 보낸다(bundle id 로만 부르면 테스트의 가짜 번들이 개발 머신의
# 진짜 앱을 끈다). 곱게 안 꺼지면 강제로 죽이지 않고 멈춘다 — 저장 안 된 상태는 사용자 것이다.
# pgrep -f 는 정규식이다 — 경로의 . 등 메타문자를 이스케이프해 다른 경로에 오탐·미탐하지 않게
app_pattern="$(printf '%s' "$APP/Contents/MacOS/" | sed 's/[][\\.*^$+?(){}|]/\\&/g')"
app_running() { pgrep -f "$app_pattern" >/dev/null 2>&1; }
if app_running; then
  osascript -e "quit app id \"$APP_ID\"" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    app_running || break
    sleep 0.5
  done
  if app_running; then
    echo "$APP_NAME 이 아직 실행 중이다 — 앱을 끄고 다시 돌린다. 아무것도 지우지 않았다" >&2
    exit 3
  fi
fi

failed=0
for path in "${targets[@]}"; do
  exists "$path" || continue
  if rm -rf -- "$path"; then
    echo "지움: $path"
  else
    echo "못 지움: $path" >&2
    failed=$((failed + 1))
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "$failed 개를 지우지 못했다 — 위 경로를 직접 지운다" >&2
  exit 1
fi
echo "$APP_NAME 삭제 완료"
