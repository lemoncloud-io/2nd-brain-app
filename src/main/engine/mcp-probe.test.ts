import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { probeMcpServer } from './mcp-probe'
import type { McpServer } from '../../shared/mcp-servers'

const stdio = (over: Partial<McpServer> = {}): McpServer => ({
  name: 'probe-me',
  enabled: true,
  kind: 'stdio',
  command: 'node',
  args: [],
  env: {},
  url: '',
  ...over
})

// stdin 한 줄(JSON-RPC)에 initialize 답을 돌려주는 가짜 MCP 서버
const ECHO =
  "let b='';process.stdin.on('data',c=>{b+=c;const i=b.indexOf('\\n');if(i>=0){try{const m=JSON.parse(b.slice(0,i));process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2024-11-05',capabilities:{},serverInfo:{name:'fake',version:'0'}}})+'\\n')}catch{}process.exit(0)}})"

describe('probeMcpServer', () => {
  it('stdio initialize에 답하면 ok', async () => {
    await expect(probeMcpServer(stdio({ args: ['-e', ECHO] }))).resolves.toEqual({ ok: true })
  })

  it('없는 명령은 사유와 함께 실패', async () => {
    const result = await probeMcpServer(stdio({ command: '/nonexistent-mcp-probe-xyz' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('명령')
  })

  it('http는 닿으면 ok(상태 코드 무관)', async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const port = (server.address() as AddressInfo).port
    try {
      await expect(
        probeMcpServer({
          name: 'web',
          enabled: true,
          kind: 'http',
          command: '',
          args: [],
          env: {},
          url: `http://127.0.0.1:${port}/mcp`
        })
      ).resolves.toEqual({ ok: true })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
    }
  })

  it('http 닿지 않으면 사유와 함께 실패', async () => {
    const result = await probeMcpServer({
      name: 'web',
      enabled: true,
      kind: 'http',
      command: '',
      args: [],
      env: {},
      url: 'http://127.0.0.1:1/mcp'
    })
    expect(result.ok).toBe(false)
  })
})
