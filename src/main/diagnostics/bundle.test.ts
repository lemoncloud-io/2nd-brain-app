import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildDiagnosticsZip, pickDiagnosticSettings } from './bundle'
import type { AppSettings } from '../settings'

const HOME = '/Users/someone'
const TOKEN = 'ghp_bundleFakeToken0123456789abcdefgh'

const settings: AppSettings = {
  claudePath: `${HOME}/.local/bin/claude`,
  vaultDir: `${HOME}/Documents/내 보관함`,
  recentVaultDirs: [`${HOME}/Documents/다른 보관함`],
  theme: 'dark',
  language: 'en',
  engine: 'codex',
  model: 'gpt-5',
  draftModel: 'gpt-5-mini',
  uiPrefs: { showFileExtensions: true, showChatMeters: false },
  chatDefaults: { permissionMode: 'ask', userSettings: false },
  mcpServers: [
    {
      name: 'notion',
      enabled: true,
      kind: 'stdio',
      command: `${HOME}/bin/notion-mcp`,
      args: ['--token', TOKEN],
      env: { NOTION_TOKEN: TOKEN },
      url: ''
    }
  ],
  githubUser: { login: 'gh-someone', id: 1 },
  onboardingRepo: 'someone/brain',
  onboardingPurpose: '내 비밀 계획'
}

describe('pickDiagnosticSettings', () => {
  it('허용 목록만 담고 MCP 서버는 이름·종류·켜짐만 남긴다', () => {
    const picked = pickDiagnosticSettings(settings, HOME)
    expect(picked).toEqual({
      claudePath: '~/.local/bin/claude',
      hasVault: true,
      recentVaultCount: 1,
      theme: 'dark',
      language: 'en',
      engine: 'codex',
      model: 'gpt-5',
      draftModel: 'gpt-5-mini',
      uiPrefs: { showFileExtensions: true, showChatMeters: false },
      chatDefaults: { permissionMode: 'ask', userSettings: false },
      mcpServers: [{ name: 'notion', kind: 'stdio', enabled: true }]
    })
  })

  it('보관함 경로·GitHub 계정·첫 질문 답·MCP 명령과 env 는 어떤 모양으로도 들어가지 않는다', () => {
    const text = JSON.stringify(pickDiagnosticSettings(settings, HOME))
    for (const secret of [
      TOKEN,
      '내 보관함',
      '다른 보관함',
      'someone/brain',
      '내 비밀 계획',
      'gh-someone',
      'notion-mcp',
      HOME
    ]) {
      expect(text).not.toContain(secret)
    }
  })

  it('손으로 고친 설정의 모르는 키·이상한 값은 걸러 싣는다', () => {
    const odd = {
      model: { secret: TOKEN },
      uiPrefs: { showFileExtensions: true, leaked: TOKEN },
      chatDefaults: { permissionMode: 'ask', note: TOKEN },
      language: TOKEN,
      mcpServers: [null, 'x', { name: 'notion', kind: 'stdio', enabled: true }]
    } as unknown as AppSettings
    const picked = pickDiagnosticSettings(odd, HOME)
    expect(JSON.stringify(picked)).not.toContain(TOKEN)
    expect(picked.model).toBeUndefined()
    expect(picked.uiPrefs).toEqual({ showFileExtensions: true, showChatMeters: false })
    expect(picked.language).toBe('ko')
    expect(picked.mcpServers).toEqual([{ name: 'notion', kind: 'stdio', enabled: true }])
  })

  it('빈 설정이면 보관함 없음만 남는다', () => {
    expect(pickDiagnosticSettings({}, HOME)).toEqual({ hasVault: false, recentVaultCount: 0 })
  })
})

describe('buildDiagnosticsZip', () => {
  it('로그 파일과 diagnostics.json 을 묶고, 안의 글은 다시 가린다', () => {
    const zip = buildDiagnosticsZip({
      logs: [
        {
          name: 'main.log',
          bytes: new TextEncoder().encode(`line one\nBearer ${TOKEN}\n${HOME}/x`)
        },
        { name: 'main.1.log', bytes: new TextEncoder().encode('older') }
      ],
      info: { app: { version: '1.2.3' }, note: `token ${TOKEN}` },
      home: HOME
    })
    const files = unzipSync(zip)
    expect(Object.keys(files).sort()).toEqual(['diagnostics.json', 'main.1.log', 'main.log'])
    const main = strFromU8(files['main.log'])
    expect(main).toBe('line one\nBearer [REDACTED]\n~/x')
    expect(strFromU8(files['main.1.log'])).toBe('older')
    const info = JSON.parse(strFromU8(files['diagnostics.json']))
    expect(info.app.version).toBe('1.2.3')
    expect(JSON.stringify(info)).not.toContain(TOKEN)
  })

  it('기록 본문의 보관함 경로는 원래 모양이든 ~ 로 줄인 모양이든 <vault> 로 바꾼다', () => {
    const vault = `${HOME}/Documents/내 보관함`
    const text = `open ~/Documents/내 보관함/회사.md failed\nraw ${vault}/a.md`
    const zip = buildDiagnosticsZip({
      logs: [{ name: 'main.log', bytes: new TextEncoder().encode(text) }],
      info: {},
      home: HOME,
      vaults: [vault]
    })
    expect(strFromU8(unzipSync(zip)['main.log'])).toBe(
      'open <vault>/회사.md failed\nraw <vault>/a.md'
    )
  })

  it('Windows 보관함 경로는 inspect 의 \\\\·git 의 /·대소문자가 달라도 <vault> 로 바꾼다', () => {
    const home = 'C:\\Users\\Kim'
    const text = [
      "{ dir: 'C:\\\\Users\\\\Kim\\\\Documents\\\\Brain' }",
      'git -C c:/users/kim/documents/brain status'
    ].join('\n')
    const zip = buildDiagnosticsZip({
      logs: [{ name: 'main.log', bytes: new TextEncoder().encode(text) }],
      info: {},
      home,
      vaults: ['C:\\Users\\Kim\\Documents\\Brain']
    })
    expect(strFromU8(unzipSync(zip)['main.log'])).toBe("{ dir: '<vault>' }\ngit -C <vault> status")
  })

  it('\\r 로 이어 붙은 줄도 따로 가린다', () => {
    const zip = buildDiagnosticsZip({
      logs: [{ name: 'main.log', bytes: new TextEncoder().encode(`progress\rBearer ${TOKEN}`) }],
      info: {}
    })
    expect(strFromU8(unzipSync(zip)['main.log'])).toBe('progress\nBearer [REDACTED]')
  })

  it('긴 줄이 많아도 줄마다 가린다 — 파일 앞 4KB 만 남기지 않는다', () => {
    const lines = Array.from({ length: 200 }, (_, n) => `line ${n} ${'x'.repeat(100)}`)
    lines.push(`last Bearer ${TOKEN}`)
    const zip = buildDiagnosticsZip({
      logs: [{ name: 'main.log', bytes: new TextEncoder().encode(lines.join('\n')) }],
      info: {}
    })
    const main = strFromU8(unzipSync(zip)['main.log'])
    expect(main.split('\n')).toHaveLength(201)
    expect(main.endsWith('last Bearer [REDACTED]')).toBe(true)
  })
})
