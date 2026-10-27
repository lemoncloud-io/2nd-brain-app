// MCP 서버를 엔진 CLI 인자로 — 켠 서버만, 채팅(질의·노트 쓰기)에만 넘긴다. 위키화·점검은 보관함 규칙대로 돈다.
import type { McpServer } from '../../shared/mcp-servers'

/**
 * claude — `--mcp-config <JSON 문자열>` 로 서버를 싣고, 비대화 실행은 허용 규칙 밖 도구를 거절하므로
 * `--allowedTools` 에 `mcp__<이름>__*` 를 더한다(code.claude.com/docs/en/agent-sdk/mcp, 확인 2026-09-23)
 */
export const claudeMcpArgs = (servers: McpServer[], profileArgs: string[]): string[] => {
  const on = servers.filter((s) => s.enabled)
  if (on.length === 0) return profileArgs
  const mcpServers = Object.fromEntries(
    on.map((s) => [
      s.name,
      s.kind === 'http'
        ? { type: 'http', url: s.url }
        : { type: 'stdio', command: s.command, args: s.args, env: s.env }
    ])
  )
  const rules = on.map((s) => `mcp__${s.name}__*`).join(',')
  const args = [...profileArgs]
  const at = args.indexOf('--allowedTools')
  if (at >= 0 && at + 1 < args.length) args[at + 1] = `${args[at + 1]},${rules}`
  else args.push('--allowedTools', rules)
  return [...args, '--mcp-config', JSON.stringify({ mcpServers })]
}

/** TOML 문자열 — JSON 문자열 표기는 TOML 기본 문자열로도 읽힌다 */
const toml = (value: string): string => JSON.stringify(value)

/** codex — `-c mcp_servers.<이름>.<키>=<TOML 값>` 로 config.toml 을 덮는다 */
export const codexMcpArgs = (servers: McpServer[]): string[] =>
  servers
    .filter((s) => s.enabled)
    .flatMap((s) => {
      const key = `mcp_servers.${s.name}`
      if (s.kind === 'http') return ['-c', `${key}.url=${toml(s.url)}`]
      const env = Object.entries(s.env)
        .map(([k, v]) => `${toml(k)}=${toml(v)}`)
        .join(',')
      return [
        '-c',
        `${key}.command=${toml(s.command)}`,
        '-c',
        `${key}.args=[${s.args.map(toml).join(',')}]`,
        ...(env === '' ? [] : ['-c', `${key}.env={${env}}`])
      ]
    })
