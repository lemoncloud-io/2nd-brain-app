import { describe, expect, it } from 'vitest'
import type { McpServer } from '../../shared/mcp-servers'
import { claudeMcpArgs, codexMcpArgs } from './mcp-args'

const GITHUB: McpServer = {
  name: 'github',
  enabled: true,
  kind: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: 'a"b' },
  url: ''
}
const OFF: McpServer = { ...GITHUB, name: 'off', enabled: false }

describe('claudeMcpArgs — test: mcp-args.ts', () => {
  it('켠 서버가 없으면 인자를 건드리지 않는다', () => {
    const base = ['--allowedTools', 'Read']
    expect(claudeMcpArgs([OFF], base)).toBe(base)
  })

  it('허용 도구에 서버 규칙을 더하고 --mcp-config 를 싣는다', () => {
    const args = claudeMcpArgs([GITHUB, OFF], ['--allowedTools', 'Read,Glob', '--x'])
    expect(args.slice(0, 3)).toEqual(['--allowedTools', 'Read,Glob,mcp__github__*', '--x'])
    expect(args[3]).toBe('--mcp-config')
    expect(JSON.parse(args[4]!)).toEqual({
      mcpServers: {
        github: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'a"b' }
        }
      }
    })
  })
})

describe('codexMcpArgs — test: mcp-args.ts', () => {
  it('서버마다 -c 로 config.toml 값을 덮는다 — 문자열은 따옴표·이스케이프', () => {
    expect(codexMcpArgs([GITHUB, OFF])).toEqual([
      '-c',
      'mcp_servers.github.command="npx"',
      '-c',
      'mcp_servers.github.args=["-y","@modelcontextprotocol/server-github"]',
      '-c',
      'mcp_servers.github.env={"GITHUB_TOKEN"="a\\"b"}'
    ])
  })
})
