// Claude CLI 탐지·상태·로그인 — 탐지 규칙은 resolve-cli 와 같다.
import { execFile, launchLogin, resolveCli, type ResolvedCli } from './resolve-cli'

export type ClaudeCli = ResolvedCli

export interface ClaudeAuthStatus {
  loggedIn: boolean
  email?: string
  authMethod?: string
}

// 우선순위: CLAUDE_CLI_PATH 설정값 → PATH 탐색 → 알려진 절대경로.
// 각 후보를 `claude --version` 성공으로 검증해 채택한다(체크리스트 04).
export const resolveClaudeCli = (env: NodeJS.ProcessEnv): Promise<ClaudeCli> =>
  resolveCli('claude', env.CLAUDE_CLI_PATH, env)

export const getClaudeAuthStatus = async (cliPath: string): Promise<ClaudeAuthStatus> => {
  const { code, stdout } = await execFile(cliPath, ['auth', 'status'])
  if (code !== 0) throw new Error(`claude auth status failed (exit ${code})`)
  try {
    const parsed = JSON.parse(stdout) as {
      loggedIn?: boolean
      email?: string
      authMethod?: string
    }
    return {
      loggedIn: parsed.loggedIn === true,
      email: parsed.email,
      authMethod: parsed.authMethod
    }
  } catch {
    throw new Error('could not parse claude auth status output')
  }
}

// 실측(2.1.270): TTY 없이 spawn해도 브라우저 흐름이 뜬다 — Terminal 폴백 불필요.
export const startClaudeLogin = (cliPath: string): void => launchLogin(cliPath, ['auth', 'login'])

// 실측(2.1.273): `claude auth logout` = "Log out from your Anthropic account". 끝날 때까지 기다린다 —
// 로그인과 달리 브라우저가 필요 없고, 끝난 뒤의 상태를 그 자리에서 보여 줘야 한다.
export const logoutClaude = async (cliPath: string): Promise<void> => {
  const { code, stderr } = await execFile(cliPath, ['auth', 'logout'])
  if (code !== 0) throw new Error(stderr.trim() || `claude auth logout failed (exit ${code})`)
}
