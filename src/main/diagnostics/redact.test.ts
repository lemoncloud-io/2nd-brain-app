import { describe, expect, it } from 'vitest'
import { MAX_LINE, mcpSecretValues, redact, rememberSecrets } from './redact'

describe('redact', () => {
  it.each([
    ['GitHub 토큰', 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789 end', 'ghp_abcdefghij'],
    ['fine-grained PAT', 'github_pat_11ABCDEFG0123456789_abcdefXYZ', 'github_pat_11ABC'],
    ['Bearer 헤더', 'authorization: Bearer gho_secretvalue123456789012345', 'secretvalue'],
    ['git basic 헤더', 'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2hwXzEyMw==', 'eC1hY2Nlc3M'],
    ['x-access-token', 'https://x-access-token:s3cr3t@github.com/a/b.git', 's3cr3t'],
    ['Anthropic 키', 'key sk-ant-api03-AbC_dEf-123', 'AbC_dEf'],
    ['mcp 설정 인자', 'claude --mcp-config {"mcpServers":{"a":{"env":{"K":"v1"}}}} -p', '"v1"'],
    ['codex mcp env', '-c mcp_servers.search.env={API_KEY="abc123"}', 'abc123'],
    ['문자열에 묻힌 JSON', '{"data":"{\\"access_token\\":\\"abcSECRET123\\"}"}', 'abcSECRET123'],
    ['OAuth 코드 쿼리', 'GET https://app.example/cb?code=oauthCode99&state=1', 'oauthCode99'],
    ['서명 쿼리', 'https://s3.example/x?X-Amz-Signature=sigValue77', 'sigValue77'],
    ['codex mcp 인자', '-c mcp_servers.search.args=["--api-key","k9k9k9"]', 'k9k9k9'],
    ['codex mcp 주소', '-c mcp_servers.web.url="https://h.example/s/tok777"', 'tok777'],
    ['\\r 뒤 mcp 설정', 'claude --mcp-config {"a":1\r"env":{"K":"v2"}}', '"v2"'],
    ['URL 쿼리 키', 'GET https://api.example.com/x?api_key=zzz999&q=1', 'zzz999'],
    [
      '공백 든 mcp 설정',
      '--mcp-config {"a":{"args":["/Users/me/My Docs"],"env":{"NOTION_TOKEN":"ntn_SECRET1"}}}',
      'ntn_SECRET1'
    ],
    [
      'inspect 로 찍힌 mcp 인자 배열',
      '[ \'-p\', \'--mcp-config\', \'{"a":{"env":{"K":"SECRET9"}}}\' ]',
      'SECRET9'
    ],
    ['공백 든 codex env', '-c mcp_servers.n.env={"K"="pass word SECRET2"}', 'SECRET2'],
    ['이름이 말하는 값', "{ OPENAI_API_KEY: 'sk-proj-abc', other: 1 }", 'sk-proj-abc'],
    ['JSON 토큰 키', '{"access_token":"opaque-value-1"}', 'opaque-value-1'],
    ['OpenAI 키 모양', 'used sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA', 'AAAAAAAAAAAAAAAA'],
    ['Slack 토큰', 'xoxb-123-456-abcdef', 'abcdef'],
    ['URL 사용자 정보', 'remote https://oauth2:glpat-xyz123@gitlab.com/a.git', 'xyz123']
  ])('%s 를 가린다', (_name, input, secret) => {
    const out = redact(input)
    expect(out).not.toContain(secret)
    expect(out).toContain('[REDACTED]')
  })

  it('basic 헤더 값만 가리고 뒤 글자는 남긴다', () => {
    expect(redact("{ e: 'AUTHORIZATION: basic eC1hY2Nlc3M=' }")).toBe(
      "{ e: 'AUTHORIZATION: basic [REDACTED]' }"
    )
  })

  it('설정에 있는 비밀 값은 어떤 모양으로 찍혀도 지운다', () => {
    rememberSecrets(['plain-known-secret', 'x'])
    expect(redact('weird form: plain-known-secret!')).toBe('weird form: [REDACTED]!')
    expect(redact('x marks')).toBe('x marks')
  })

  it('홈 경로를 ~ 로 바꾼다', () => {
    expect(redact('open /Users/kim/vault/a.md failed', '/Users/kim')).toBe(
      'open ~/vault/a.md failed'
    )
  })

  it('이름이 홈으로 시작하는 다른 계정 경로는 두고, inspect 로 찍힌 Windows 경로도 바꾼다', () => {
    expect(redact('/Users/kimberly/a', '/Users/kim')).toBe('/Users/kimberly/a')
    expect(redact("{ dir: 'C:\\\\Users\\\\kim\\\\vault' }", 'C:\\Users\\kim')).toBe(
      "{ dir: '~\\\\vault' }"
    )
  })

  it('Windows 홈은 구분자 모양·대소문자가 달라도 바꾸고, 다른 계정은 둔다', () => {
    const home = 'C:\\Users\\Kim'
    expect(redact('git -C c:/users/kim/Documents/vault status', home)).toBe(
      'git -C ~/Documents/vault status'
    )
    expect(redact('C:\\Users\\Kimberly\\a', home)).toBe('C:\\Users\\Kimberly\\a')
  })

  it('MCP 서버에서는 env 값·비밀 플래그 뒤 인자·주소만 비밀로 본다', () => {
    const servers = [
      {
        env: { API_KEY: 'envsecret1' },
        args: [
          '-y',
          '@modelcontextprotocol/server-filesystem',
          '--api-key',
          'argsecret1',
          '--token=inline1',
          '--stdio'
        ],
        url: ''
      },
      { env: {}, args: [], url: 'https://h.example/s/urlsecret1' },
      null,
      { env: 'oops', args: 'oops' }
    ]
    expect(mcpSecretValues(servers)).toEqual([
      'envsecret1',
      'argsecret1',
      'https://h.example/s/urlsecret1'
    ])
    expect(mcpSecretValues('not a list')).toEqual([])
  })

  it('비밀이 없는 줄은 그대로 둔다', () => {
    expect(redact('sync failed: exit 128')).toBe('sync failed: exit 128')
  })

  it('긴 줄은 상한에서 자른다', () => {
    const out = redact('a'.repeat(MAX_LINE * 2))
    expect(out.length).toBeLessThanOrEqual(MAX_LINE + 20)
    expect(out.endsWith('…[truncated]')).toBe(true)
  })

  it('긴 아는 비밀이 상한에 걸쳐도 앞부분을 남기지 않는다', () => {
    const secret = 'opaque' + 'Q7'.repeat(300)
    rememberSecrets([secret])
    const out = redact('x'.repeat(MAX_LINE - 100) + secret + 'y'.repeat(MAX_LINE))
    expect(out).not.toContain(secret.slice(0, 40))
  })
})
