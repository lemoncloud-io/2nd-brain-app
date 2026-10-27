// Codex CLI 탐지·로그인 상태(슬라이스 10) — 탐지 규칙은 Claude 와 같다(resolve-cli).
import { execFile, launchLogin, resolveCli, type ResolvedCli } from './resolve-cli'

export type CodexCli = ResolvedCli

export interface CodexAuthStatus {
  loggedIn: boolean
  authMethod?: string
}

// 우선순위: CODEX_CLI_PATH → PATH 탐색 → 알려진 절대경로. `codex --version` 성공으로 채택
export const resolveCodexCli = (env: NodeJS.ProcessEnv): Promise<CodexCli> =>
  resolveCli('codex', env.CODEX_CLI_PATH, env)

// 실측(0.154.0, 로그인): `codex login status` 는 stdout 을 비우고 stderr 에 "Logged in using ChatGPT", exit 0.
// 미로그인 출력은 실측하지 않았다 — exit≠0 이거나 두 스트림 어디에도 "Logged in" 문구가 없으면 미로그인으로 본다
export const getCodexAuthStatus = async (cliPath: string): Promise<CodexAuthStatus> => {
  const { code, stdout, stderr } = await execFile(cliPath, ['login', 'status'])
  const output = `${stdout}\n${stderr}`
  const match = output.match(/^Logged in using (.+)$/m)
  if (match) return { loggedIn: true, authMethod: match[1]!.trim() }
  // `login status` 자체가 없는 판이면 미로그인이 아니라 "모른다" 다 — 합치면 통하지 않는 로그인 버튼만 남는다
  if (
    code !== 0 &&
    /unrecognized|unexpected argument|unknown (?:sub)?command|USAGE/i.test(output)
  ) {
    throw new Error(`could not understand codex login status (exit ${code})`)
  }
  return { loggedIn: false }
}

// `codex login` 은 ChatGPT 로그인 브라우저 흐름을 연다. TTY 없이 띄웠을 때 브라우저가 뜨는지는 실측하지 않았다 —
// 뜨지 않아도 화면이 상태를 다시 물어 미로그인으로 남고, 설정의 안내가 터미널 명령을 함께 보인다
export const startCodexLogin = (cliPath: string): void => launchLogin(cliPath, ['login'])

// 실측(0.154.0): `codex logout` = "Remove stored authentication credentials". 기다렸다가 결과를 보인다.
export const logoutCodex = async (cliPath: string): Promise<void> => {
  const { code, stderr } = await execFile(cliPath, ['logout'])
  if (code !== 0) throw new Error(stderr.trim() || `codex logout failed (exit ${code})`)
}
