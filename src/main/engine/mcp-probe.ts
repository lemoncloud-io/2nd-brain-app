// MCP 연결 확인 — 저장하기 전에 닿는지 본다. stdio는 `initialize` 악수 한 번,
// http는 주소에 닿기만 본다(상태 코드는 묻지 않는다). 버튼을 눌렀을 때만 실행된다.
import { spawn } from 'node:child_process'
import type { McpServer } from '../../shared/mcp-servers'
import { mainT } from '../i18n'

export type McpProbe = { ok: true } | { ok: false; reason: string }

const TIMEOUT_MS = 10_000

const probeHttp = async (url: string): Promise<McpProbe> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { ok: true }
  } catch (error) {
    // 닿았는데 거절(404·405 등)한 것은 응답을 받은 것이므로 fetch 가 resolve한다.
    // 여기 오는 것은 네트워크·DNS·시간 초과뿐이다
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { ok: false, reason: mainT().engineMain.mcp.urlTimeout }
    }
    return { ok: false, reason: mainT().engineMain.mcp.unreachable }
  }
}

const probeStdio = (server: McpServer): Promise<McpProbe> =>
  new Promise((resolve) => {
    let done = false
    // finish가 spawn 동기 throw 경로에서 먼저 불릴 수 있어 const TDZ를 피한다
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: McpProbe): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        // 이미 끝났다
      }
      resolve(result)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(server.command, server.args, {
        env: { ...process.env, ...server.env },
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      })
    } catch {
      return finish({ ok: false, reason: mainT().engineMain.mcp.spawnFailed })
    }
    timer = setTimeout(() => {
      finish({ ok: false, reason: mainT().engineMain.mcp.commandTimeout })
    }, TIMEOUT_MS)
    child.on('error', () => finish({ ok: false, reason: mainT().engineMain.mcp.spawnFailed }))
    let buf = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      for (const line of buf.split('\n')) {
        try {
          const msg = JSON.parse(line) as { id?: unknown; result?: unknown }
          if (msg !== null && typeof msg === 'object' && 'result' in msg) {
            finish({ ok: true })
            return
          }
        } catch {
          // JSON 한 줄이 아직 덜 왔다 — 다음 chunk를 기다린다
        }
      }
      if (buf.length > 65536) finish({ ok: false, reason: mainT().engineMain.mcp.badReply })
    })
    child.on('exit', () => finish({ ok: false, reason: mainT().engineMain.mcp.exited }))
    // 자식이 먼저 꺼지면 stdin 쓰기가 EPIPE 로 터진다 — unhandled 로 두지 않는다
    child.stdin?.on('error', () => finish({ ok: false, reason: mainT().engineMain.mcp.noTalk }))
    try {
      child.stdin?.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: '2nd-brain-probe', version: '0' }
          }
        })}\n`
      )
    } catch {
      finish({ ok: false, reason: mainT().engineMain.mcp.noTalk })
    }
  })

export const probeMcpServer = (server: McpServer): Promise<McpProbe> =>
  server.kind === 'http' ? probeHttp(server.url) : probeStdio(server)
