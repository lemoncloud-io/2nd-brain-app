import { describe, expect, it } from 'vitest'
import {
  checkMcpServer,
  MAX_MCP_SERVERS,
  normalizeMcpServers,
  parseEnvLines,
  parseMcpJson,
  splitCommandLine
} from './mcp-servers'

describe('mcp servers — test: mcp-servers.ts', () => {
  it('못 쓰는 이름·빈 명령·잘못된 주소·겹치는 이름은 버리고 종류에 없는 칸은 비운다', () => {
    const got = normalizeMcpServers([
      {
        name: 'ok',
        kind: 'stdio',
        command: 'npx',
        args: ['a', 1],
        env: { K: 'v', 'bad key': 'x' },
        url: 'u'
      },
      { name: 'ok', kind: 'stdio', command: 'dup' },
      { name: 'has space', kind: 'stdio', command: 'x' },
      { name: 'nocmd', kind: 'stdio', command: ' ' },
      { name: 'web', kind: 'http', url: 'ftp://x' },
      { name: 'site', kind: 'http', url: 'https://s.example/mcp', command: 'x', enabled: false }
    ])
    expect(got).toEqual([
      {
        name: 'ok',
        enabled: true,
        kind: 'stdio',
        command: 'npx',
        args: ['a'],
        env: { K: 'v' },
        url: ''
      },
      {
        name: 'site',
        enabled: false,
        kind: 'http',
        command: '',
        args: [],
        env: {},
        url: 'https://s.example/mcp'
      }
    ])
    expect(normalizeMcpServers('x')).toEqual([])
    const many = Array.from({ length: MAX_MCP_SERVERS + 2 }, (_, i) => ({
      name: `s${i}`,
      command: 'x'
    }))
    expect(normalizeMcpServers(many)).toHaveLength(MAX_MCP_SERVERS)
  })

  it('명령 한 줄은 따옴표 조각을 한 인자로 나눈다', () => {
    expect(splitCommandLine('npx -y "@a/b c" \'d e\'')).toEqual(['npx', '-y', '@a/b c', 'd e'])
  })

  it('KEY=값 줄만 환경 변수로 — 값의 = 는 그대로', () => {
    expect(parseEnvLines('A=1\n\nnope\nB = x=y\n1X=z')).toEqual({ A: '1', B: 'x=y' })
  })

  it('문서의 mcpServers JSON 을 서버 목록으로 — 주소만 있으면 http', () => {
    const got = parseMcpJson(
      JSON.stringify({
        mcpServers: {
          fs: { command: 'npx', args: ['-y', 'server-fs', '/tmp'] },
          docs: { type: 'http', url: 'https://d.example/mcp' }
        }
      })
    )
    expect(got).toEqual([
      {
        name: 'fs',
        enabled: false,
        kind: 'stdio',
        command: 'npx',
        args: ['-y', 'server-fs', '/tmp'],
        env: {},
        url: ''
      },
      {
        name: 'docs',
        enabled: false,
        kind: 'http',
        command: '',
        args: [],
        env: {},
        url: 'https://d.example/mcp'
      }
    ])
    expect(parseMcpJson('{')).toHaveProperty('error')
    expect(parseMcpJson('{"mcpServers":{}}')).toHaveProperty('error')
    expect(parseMcpJson('{"mcpServers":{"bad name":{"command":"x"}}}')).toHaveProperty('error')
  })

  it('가져온 서버는 꺼진 채로 — 항목에 켜짐이 적혀 있을 때만 켠다', () => {
    const got = parseMcpJson(
      JSON.stringify({
        mcpServers: {
          on: { command: 'x', enabled: true },
          off: { command: 'y', enabled: false },
          plain: { command: 'z' }
        }
      })
    )
    expect(Array.isArray(got) && got.map((s) => [s.name, s.enabled])).toEqual([
      ['on', true],
      ['off', false],
      ['plain', false]
    ])
  })
})

describe('checkMcpServer direct', () => {
  it('서버가 아니면 읽지 못했다고 한다', () => {
    expect(checkMcpServer(null)).toEqual({ error: '서버 설정을 읽지 못했어요' })
    expect(checkMcpServer('fs')).toEqual({ error: '서버 설정을 읽지 못했어요' })
  })

  it('모르는 kind 는 stdio 로 떨어진다', () => {
    const server = checkMcpServer({ name: 'x', kind: 'ftp', command: 'c' })
    expect(server).toMatchObject({ name: 'x', kind: 'stdio', command: 'c' })
  })

  it('stdio 는 빈 명령을, http 는 나쁜 주소를 돌려보낸다', () => {
    expect(checkMcpServer({ name: 'x', command: '' })).toEqual({
      error: '실행할 명령을 적어 주세요'
    })
    expect(checkMcpServer({ name: 'x', kind: 'http', url: 'gopher://h' })).toEqual({
      error: '주소는 http:// 나 https://로 시작해야 해요'
    })
  })
})

describe('splitCommandLine edge', () => {
  it('빈 줄은 빈 목록이다', () => {
    expect(splitCommandLine('')).toEqual([])
  })
})

describe('parseMcpJson shapes', () => {
  it('배열 뿌리는 서버 목록이 아니다', () => {
    expect(parseMcpJson('[{"a":1}]')).toEqual({
      error: '"mcpServers" 아래에 서버 이름별 설정이 있어야 해요'
    })
  })

  it('command 와 url 이 같이 있으면 stdio 로 읽는다', () => {
    const parsed = parseMcpJson('{"mcpServers":{"mix":{"command":"c","url":"https://h"}} }')
    expect(parsed).toMatchObject([{ name: 'mix', kind: 'stdio', command: 'c' }])
  })
})
