// 엔진 CLI 설치 명령의 정본 — 화면에 보여 주는 한 줄(install-guide.ts)과 앱이 직접 돌리는 설치(src/main/cli/install-cli.ts)가
// 같은 표를 읽는다. 렌더러가 보낸 문자열을 실행하지 않으려고 shared 에 둔다: main 은 엔진 종류로 이 표에서 고른다.
// 명령은 2026-09-16 에 각 벤더 문서를 열어 그대로 옮겼다(출처는 install-guide.ts 머리말).
import type { EngineKind } from './engine-settings'

interface CliInstallEntry {
  /** 셸에 넘기는 설치 스크립트 한 줄 */
  script: string
  /** 사용자가 터미널에 붙여 넣는 한 줄 — script 와 다르면 셸 호출까지 감싼 것 */
  display: string
}

const entry = (script: string, display = script): CliInstallEntry => ({ script, display })

const CLI_INSTALL: Record<EngineKind, { posix: CliInstallEntry; windows: CliInstallEntry }> = {
  claude: {
    posix: entry('curl -fsSL https://claude.ai/install.sh | bash'),
    windows: entry('irm https://claude.ai/install.ps1 | iex')
  },
  // 설치 스크립트 방식 — npm 전역 설치와 달리 Node.js 를 따로 깔지 않아도 된다
  codex: {
    posix: entry('curl -fsSL https://chatgpt.com/codex/install.sh | sh'),
    windows: entry(
      'irm https://chatgpt.com/codex/install.ps1 | iex',
      'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"'
    )
  }
}

/**
 * 앱이 돌릴 때 설치기에 얹는 환경변수 — 벤더 스크립트가 묻는 프롬프트를 끈다.
 * 2026-09-21 두 스크립트를 받아 TTY 없이(detached, stdin 닫음) 돌려 확인: 둘 다 프롬프트 없이 exit 0.
 * Codex install.sh:89·install.ps1:14 는 `CODEX_NON_INTERACTIVE`(1·true·yes)로 "Start Codex now?" 등을 건너뛴다 —
 * TTY 없이도 안 묻지만 명시한다. Claude 스크립트는 묻는 곳이 없다.
 */
const CLI_INSTALL_ENV: Record<EngineKind, Record<string, string>> = {
  claude: {},
  codex: { CODEX_NON_INTERACTIVE: '1' }
}

export const cliInstallEnv = (engine: EngineKind): Record<string, string> => ({
  ...CLI_INSTALL_ENV[engine]
})

const entryOf = (engine: EngineKind, platform: string): CliInstallEntry =>
  CLI_INSTALL[engine][platform === 'win32' ? 'windows' : 'posix']

/** 터미널에 붙여 넣는 한 줄 */
export const cliInstallDisplay = (engine: EngineKind, platform: string): string =>
  entryOf(engine, platform).display

/**
 * 앱이 직접 돌릴 때의 실행 파일과 인자. Windows 는 PowerShell 을 절대경로로 부른다 —
 * PATH 앞쪽에 놓인 다른 powershell.exe 가 대신 뜨지 않게.
 */
export const cliInstallRun = (
  engine: EngineKind,
  platform: string,
  env: Record<string, string | undefined>
): { file: string; args: string[] } => {
  const { script } = entryOf(engine, platform)
  if (platform !== 'win32') return { file: '/bin/bash', args: ['-c', script] }
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'
  return {
    file: `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]
  }
}
