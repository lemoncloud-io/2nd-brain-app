// MCP 서버 설정 — 채팅이 쓸 바깥 도구. 설정 화면에서 더하고 끄며, 켠 것만 엔진 CLI 에 넘긴다.
// 이름은 CLI 가 도구 이름(`mcp__<이름>__<도구>`)·설정 키(`mcp_servers.<이름>`)로 쓰므로 글자·숫자·`-`·`_` 만 받는다.
import { currentT } from './i18n'

export type McpServer = {
  name: string
  enabled: boolean
  /** stdio = 이 컴퓨터에서 명령을 띄운다, http = 주소로 붙는다 */
  kind: 'stdio' | 'http'
  command: string
  args: string[]
  env: Record<string, string>
  url: string
}

export const MCP_NAME = /^[A-Za-z0-9_-]{1,40}$/
export const MAX_MCP_SERVERS = 20
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

const envOf = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, v] of Object.entries(value)) {
    if (ENV_KEY.test(key) && typeof v === 'string') out[key] = v
  }
  return out
}

/** 하나를 검사한다 — 쓸 수 없는 항목이면 사람이 읽을 이유 */
export const checkMcpServer = (raw: unknown): McpServer | { error: string } => {
  const t = currentT().mcp
  if (typeof raw !== 'object' || raw === null) return { error: t.unreadable }
  const v = raw as Record<string, unknown>
  const name = typeof v['name'] === 'string' ? v['name'].trim() : ''
  if (!MCP_NAME.test(name)) {
    return { error: t.badName }
  }
  const kind = v['kind'] === 'http' ? 'http' : 'stdio'
  const command = typeof v['command'] === 'string' ? v['command'].trim() : ''
  const url = typeof v['url'] === 'string' ? v['url'].trim() : ''
  if (kind === 'stdio' && command === '') return { error: t.noCommand }
  if (kind === 'http' && !/^https?:\/\/\S+$/.test(url)) {
    return { error: t.badUrl }
  }
  return {
    name,
    enabled: v['enabled'] !== false,
    kind,
    command: kind === 'stdio' ? command : '',
    args: kind === 'stdio' ? strings(v['args']) : [],
    env: kind === 'stdio' ? envOf(v['env']) : {},
    url: kind === 'http' ? url : ''
  }
}

/** 저장·읽기 때 쓴다 — 못 쓰는 항목과 겹치는 이름은 버린다 */
export const normalizeMcpServers = (raw: unknown): McpServer[] => {
  if (!Array.isArray(raw)) return []
  const out: McpServer[] = []
  for (const item of raw) {
    const server = checkMcpServer(item)
    if ('error' in server || out.some((s) => s.name === server.name)) continue
    out.push(server)
    if (out.length >= MAX_MCP_SERVERS) break
  }
  return out
}

/** 명령 한 줄을 명령과 인자로 — 따옴표로 묶은 조각은 띄어쓰기를 품는다 */
export const splitCommandLine = (line: string): string[] => {
  const parts: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (let m = re.exec(line); m !== null; m = re.exec(line)) {
    parts.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return parts
}

/** `KEY=값` 줄들 — 빈 줄·`=` 없는 줄은 건너뛴다 */
export const parseEnvLines = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const at = line.indexOf('=')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    if (ENV_KEY.test(key)) out[key] = line.slice(at + 1).trim()
  }
  return out
}

/**
 * MCP 서버 문서가 흔히 주는 JSON(`{"mcpServers": {"이름": {...}}}` 또는 그 안쪽)을 서버 목록으로.
 * 하나라도 못 읽으면 그 이유를 돌려준다 — 반쯤 들어간 목록은 무엇이 빠졌는지 모른다
 */
export const parseMcpJson = (text: string): McpServer[] | { error: string } => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: currentT().mcp.notJson }
  }
  const root =
    typeof parsed === 'object' && parsed !== null && 'mcpServers' in parsed
      ? (parsed as { mcpServers: unknown }).mcpServers
      : parsed
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return { error: currentT().mcp.noServersKey }
  }
  const out: McpServer[] = []
  for (const [name, value] of Object.entries(root)) {
    const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const kind = typeof v['url'] === 'string' && typeof v['command'] !== 'string' ? 'http' : 'stdio'
    // 가져온 것은 꺼진 채로 — 항목에 켜짐이 적혀 있을 때만 켠다
    const enabled = typeof v['enabled'] === 'boolean' ? v['enabled'] : false
    const server = checkMcpServer({ ...v, name, kind, enabled })
    if ('error' in server) return { error: `${name}: ${server.error}` }
    out.push(server)
  }
  if (out.length === 0) return { error: currentT().mcp.empty }
  return out
}
