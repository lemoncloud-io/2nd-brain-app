// 로그·진단 묶음에 들어가는 글의 비밀 가림 — 파일로 가는 모든 줄이 여기를 지난다.
// 사용자가 이 파일을 메일·메신저로 보낸다. 토큰 원문이 남으면 그대로 새어 나간다.
// 두 겹이다: 아는 값(설정의 MCP env 값)은 문자 그대로 지우고, 모르는 값은 모양·이름으로 잡는다.

/** 한 줄 상한 — 채팅 본문·CLI stderr 를 통째로 찍는 기존 호출이 로그를 채우지 않게 */
export const MAX_LINE = 4096

const MASK = '[REDACTED]'
/** 이보다 짧은 값은 아는 비밀로 받지 않는다 — `1`·`true` 같은 값이 로그 곳곳을 지우지 않게 */
const MIN_KNOWN = 6

// 따옴표로 묶인 값은 공백까지, 아니면 구분자 앞까지
// 문자열 안에 묻힌 JSON(`\"token\":\"…\"`)의 값도 — 이스케이프된 따옴표 쌍을 먼저 본다
const VALUE = `(?:\\\\"(?:[^"\\\\]|\\\\[^"])*\\\\"|'[^']*'|"[^"]*"|[^\\s,;}'"]+)`

// 순서가 의미 있다 — 인자·헤더처럼 넓은 것부터 가리고, 남은 토큰 모양을 뒤에서 잡는다
const PATTERNS: [RegExp, string][] = [
  // claude --mcp-config <JSON> — 서버 env 에 API 키가 들어 있다. inspect 로 찍힌 배열(`'--mcp-config', '{…}'`)도 잡는다.
  // JSON 이면 줄 끝까지 지운다 — 값 안 공백에서 멈추면 그 뒤 env 가 남는다. `.` 은 \r 에서 멈추므로 \n 앞까지로
  [/(--mcp-config['"]?[,=\s]+)['"]?\{[^\n]*/g, `$1${MASK}`],
  [/(--mcp-config[=\s]+)\S+/g, `$1${MASK}`],
  // codex -c mcp_servers.<이름>.env={…}
  [/(mcp_servers\.[^=\s]+\.env=)\{[^}]*\}?/g, `$1${MASK}`],
  // codex -c mcp_servers.<이름>.args=[…] · .url="…" — 인자·주소 경로에도 키가 들어간다
  [/(mcp_servers\.[^=\s]+\.(?:args|url)=)(?:\[[^\]]*\]?|\S+)/g, `$1${MASK}`],
  // git 네트워크 인증 헤더(gitAuthEnv) — `AUTHORIZATION: basic <base64>`
  [/(authorization:\s*basic\s+)[A-Za-z0-9+/=]+/gi, `$1${MASK}`],
  [/(bearer\s+)[^\s"',}]+/gi, `$1${MASK}`],
  // URL 의 사용자 정보 — https://x-access-token:…@ · https://oauth2:…@
  [/(\/\/[^/\s:@]+:)[^@\s/]+@/g, `$1${MASK}@`],
  [/(x-access-token:)[^@\s"']+/gi, `$1${MASK}`],
  // URL 쿼리의 키 — ?api_key=… &token=…
  // 이름 앞뒤 글자 수를 묶는다 — `a-a-a-…` 같은 긴 줄에서 정규식이 제곱으로 느려지지 않게
  [
    /([?&](?:[\w-]{0,40}(?:token|key|secret|password|signature|sig|code|session|sid|jwt|credential|auth)[\w-]{0,40})=)[^&\s"'<>]+/gi,
    `$1${MASK}`
  ],
  // 이름이 비밀을 말하는 값 — `OPENAI_API_KEY: '…'` · `"token":"…"` · `PASSWORD=…`
  [
    new RegExp(
      `(\\b[\\w-]{0,40}(?:token|secret|passw(?:or)?d|api[_-]?key|apikey|authorization|credential)[\\w-]{0,40}\\\\?['"]?\\s*[:=]\\s*)(?!\\[REDACTED\\]|(?:basic|bearer)\\s)${VALUE}`,
      'gi'
    ),
    `$1${MASK}`
  ],
  [/github_pat_\w+/g, MASK],
  [/\bgh[opusr]_[A-Za-z0-9]{20,}/g, MASK],
  [/\bsk-ant-[\w-]+/g, MASK],
  [/\bsk-[\w-]{20,}/g, MASK],
  [/\bxox[abprs]-[\w-]+/g, MASK],
  [/\bglpat-[\w-]+/g, MASK]
]

const known = new Set<string>()
let longestKnown = 0

/** 설정에 있는 비밀 값 — 이 값은 어떤 모양으로 찍혀도 문자 그대로 지운다 */
export const rememberSecrets = (values: Iterable<string>): void => {
  for (const value of values) {
    if (value.length < MIN_KNOWN) continue
    known.add(value)
    longestKnown = Math.max(longestKnown, value.length)
  }
}

/** 가리기 전에 남기는 길이 — 가림이 길이를 바꾸는 몫과, 상한에 걸친 아는 비밀이 통째로 들어갈 몫 */
export const redactWindow = (): number => MAX_LINE + 256 + longestKnown

/** 이름이 비밀을 말하는 플래그 — 그 바로 뒤 인자가 값이다(`--api-key abc…`) */
const SECRET_FLAG = /^-[^=]*(?:key|token|secret|passw|auth|credential)[^=]*$/i

/**
 * 설정의 MCP 서버에서 비밀로 볼 값 — env 값, 비밀 플래그 바로 뒤 인자, 주소(경로에 토큰을 싣기도 한다).
 * 서버 이름·`--stdio` 같은 인자까지 지우면 기록에서 어느 서버 이야기인지 사라진다. `--api-key=abc` 꼴은 이름 패턴이 잡는다.
 * settings.json 원문이 올 수 있어 모양을 믿지 않는다
 */
export const mcpSecretValues = (servers: unknown): string[] => {
  if (!Array.isArray(servers)) return []
  const text = (value: unknown): value is string => typeof value === 'string' && value !== ''
  return servers.flatMap((server: { env?: unknown; args?: unknown; url?: unknown } | null) => {
    if (typeof server !== 'object' || server === null) return []
    const env =
      typeof server.env === 'object' && server.env !== null ? Object.values(server.env) : []
    const args = Array.isArray(server.args) ? server.args : []
    return [
      ...env.filter(text),
      ...args.filter((_arg, n) => n > 0 && SECRET_FLAG.test(String(args[n - 1]))).filter(text),
      ...(text(server.url) ? [server.url] : [])
    ]
  })
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Windows 경로(`C:\…`)인가 — 구분자·대소문자를 가리지 않고 맞춘다 */
export const isWindowsPath = (path: string): boolean => /^[A-Za-z]:[\\/]/.test(path)

// 경로 뒤가 구분자이거나 끝일 때만 — `/Users/kim` 이 `/Users/kimberly` 를 바꾸지 않게.
// inspect 는 Windows 경로의 `\` 를 `\\` 로 찍는다 — 그 모양도 바꾼다.
// Windows 경로(`C:\Users\Kim`)는 구분자 모양(`\`·`\\`·git 의 `/`)과 대소문자를 가리지 않는다 — 홈을 `~` 로 줄인
// 꼴(`~\Documents\x`)도 Windows 에서 왔으면 windows 를 넘긴다
export const pathPattern = (path: string, windows = isWindowsPath(path)): RegExp => {
  if (windows) {
    const parts = path
      .split(/[\\/]+/)
      .filter(Boolean)
      .map(escapeRegExp)
    return new RegExp(`${parts.join('(?:\\\\{1,2}|/)')}(?=[\\\\/'"\\s:]|$)`, 'gi')
  }
  const forms = [path, path.replace(/\\/g, '\\\\')].map(escapeRegExp)
  return new RegExp(`(?:${forms.join('|')})(?=[\\\\/'"\\s:]|$)`, 'g')
}

/** 비밀을 가리고 홈 경로를 `~` 로 줄인 뒤 상한에서 자른다 */
export const redact = (text: string, home?: string): string => {
  // 정규식을 돌리기 전에 먼저 줄인다 — 수 MB 짜리 출력에 정규식을 다 돌리지 않게
  const long = text.length > MAX_LINE
  let out = long ? text.slice(0, redactWindow()) : text
  for (const value of known) out = out.split(value).join(MASK)
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement)
  if (home && home.length > 1) out = out.replace(pathPattern(home), '~')
  return long || out.length > MAX_LINE ? `${out.slice(0, MAX_LINE)}…[truncated]` : out
}
