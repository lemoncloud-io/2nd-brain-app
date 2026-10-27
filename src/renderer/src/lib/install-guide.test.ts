import { describe, expect, it } from 'vitest'
import { installGuide } from './install-guide'

describe('installGuide', () => {
  it('Windows 는 PowerShell 설치 명령, macOS 는 터미널 설치 명령', () => {
    expect(installGuide('claude', 'win32')).toMatchObject({
      terminal: expect.stringContaining('PowerShell'),
      command: 'irm https://claude.ai/install.ps1 | iex'
    })
    expect(installGuide('claude', 'darwin')).toMatchObject({
      terminal: expect.stringContaining('터미널'),
      command: 'curl -fsSL https://claude.ai/install.sh | bash'
    })
  })

  // npm 전역 설치를 쓰면 Node.js 를 따로 깔아야 한다 — 설치 스크립트 방식은 그 선행 단계가 없다
  it('Codex 는 Node.js 없이 깔리는 설치 스크립트를 준다', () => {
    expect(installGuide('codex', 'darwin').command).toBe(
      'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
    )
    expect(installGuide('codex', 'win32').command).toContain(
      'irm https://chatgpt.com/codex/install.ps1 | iex'
    )
    for (const platform of ['darwin', 'win32']) {
      expect(installGuide('codex', platform).command).not.toContain('npm')
    }
  })

  // Windows 의 실행 정책은 명령 자체가 -ExecutionPolicy ByPass 로 넘긴다
  it('Windows Codex 명령은 실행 정책을 스스로 넘긴다', () => {
    expect(installGuide('codex', 'win32').command).toContain('-ExecutionPolicy ByPass')
  })

  it('모든 안내에 증상별 대처가 둘 이상 있다', () => {
    for (const engine of ['claude', 'codex'] as const) {
      for (const platform of ['darwin', 'win32']) {
        const { hints, docsUrl } = installGuide(engine, platform)
        expect(hints.length).toBeGreaterThanOrEqual(2)
        for (const hint of hints) {
          expect(hint.symptom).not.toBe('')
          expect(hint.fix).not.toBe('')
        }
        expect(docsUrl).toMatch(/^https:\/\//)
      }
    }
  })

  it('설치가 끝났는데 못 찾는 경우를 두 엔진 모두 다룬다', () => {
    for (const engine of ['claude', 'codex'] as const) {
      const { hints } = installGuide(engine, 'darwin')
      expect(hints.map((hint) => hint.fix).join('\n')).toContain(`${engine} --version`)
    }
  })
})
