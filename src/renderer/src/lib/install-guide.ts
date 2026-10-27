// 엔진 CLI 설치 안내 — OS 마다 터미널을 여는 법, 붙여 넣을 한 줄, 그리고 그 한 줄이 안 먹을 때 볼 증상표.
// 비개발자가 따라 하는 유일한 터미널 작업이라 실패 분기까지 화면 안에 둔다.
// 명령은 src/shared/cli-install.ts 가 정본이다(앱이 직접 돌리는 설치와 같은 표). 명령·문서 주소·증상 문구는 2026-09-16 에 각 벤더 문서를 열어 그대로 옮겼다:
//   Claude  https://code.claude.com/docs/en/setup (Native Install 탭, 증상 문구는 같은 절의 PowerShell/CMD 구분 안내)
//   Codex   https://github.com/openai/codex (README 설치 절 — 설치 스크립트 방식은 Node.js 를 요구하지 않는다)
// 설치 경로(~/.local/bin, %LOCALAPPDATA%\Programs\OpenAI\Codex\bin)는 src/main/cli/resolve-cli.ts 가 찾는 곳과 맞춘다.
import type { EngineKind } from '../../../shared/engine-settings'
import { cliInstallDisplay } from '../../../shared/cli-install'
import { getT } from './i18n'

export const ENGINE_NAME: Record<EngineKind, string> = { claude: 'Claude', codex: 'Codex' }
/** 엔진을 쓰는 데 필요한 구독 — 이름·가입 주소까지 한 곳에. 엔진을 더하면 여기 한 줄이다(이름은 화면 언어로 읽는다) */
export const ENGINE_META: Record<EngineKind, { account: string; plan: string; joinUrl: string }> = {
  claude: {
    get account() {
      return getT().install.claudeAccount
    },
    get plan() {
      return getT().install.claudePlan
    },
    joinUrl: 'https://claude.ai'
  },
  codex: {
    get account() {
      return getT().install.codexAccount
    },
    get plan() {
      return getT().install.codexPlan
    },
    joinUrl: 'https://chatgpt.com'
  }
}

/** 명령이 안 먹었을 때 화면에 펼쳐 주는 한 쌍 — 무엇이 보였고 그래서 무엇을 한다 */
export interface InstallHint {
  /** 터미널에 뜨는 문구, 또는 사용자가 겪는 상황 */
  symptom: string
  fix: string
}

export interface InstallGuide {
  /** 터미널을 여는 법 */
  terminal: string
  command: string
  docsUrl: string
  hints: InstallHint[]
}

/** 설치는 끝났는데 앱이 못 찾을 때 — 두 엔진·두 OS 가 같이 겪는다 */
const afterInstallHint = (engine: EngineKind): InstallHint => ({
  symptom: getT().install.afterInstallSymptom,
  // 설치기가 경로를 고쳐도 이미 떠 있는 앱은 예전 경로를 들고 있다 — 앱을 껐다 켜는 것이 마지막 탈출구다
  fix: getT().install.afterInstallFix(engine)
})

/** 명령이 길어 잘릴 때 — 두 엔진이 같이 겪는다 */
const truncatedHint = (): InstallHint => ({
  symptom: getT().install.truncatedSymptom,
  fix: getT().install.truncatedFix
})

const terminal = (windows: boolean): string =>
  windows ? getT().install.terminalWindows : getT().install.terminalMac

const claudeGuide = (windows: boolean): InstallGuide => ({
  terminal: terminal(windows),
  command: cliInstallDisplay('claude', windows ? 'win32' : 'darwin'),
  docsUrl: windows
    ? 'https://code.claude.com/docs/en/troubleshoot-install'
    : 'https://code.claude.com/docs/en/setup',
  hints: [
    windows
      ? {
          symptom: "'irm' is not recognized as an internal or external command",
          fix: getT().install.irmFix
        }
      : {
          symptom: getT().install.syntaxErrorSymptom,
          fix: getT().install.syntaxErrorFix
        },
    truncatedHint(),
    afterInstallHint('claude')
  ]
})

const codexGuide = (windows: boolean): InstallGuide => ({
  terminal: terminal(windows),
  command: cliInstallDisplay('codex', windows ? 'win32' : 'darwin'),
  docsUrl: 'https://github.com/openai/codex',
  hints: [truncatedHint(), afterInstallHint('codex')]
})

export const installGuide = (engine: EngineKind, platform: string): InstallGuide => {
  const windows = platform === 'win32'
  return engine === 'codex' ? codexGuide(windows) : claudeGuide(windows)
}
