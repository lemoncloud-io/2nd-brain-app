import { describe, expect, it } from 'vitest'
import { bundledResourceRoot } from './paths'

describe('bundledResourceRoot', () => {
  it('패키징된 앱이면 resourcesPath 아래 extraResources 의 vault-kit 을 쓴다', () => {
    expect(
      bundledResourceRoot('vault-kit', {
        resourcesPath: '/Applications/X.app/Contents/Resources',
        defaultApp: false,
        mainDir: '/Applications/X.app/Contents/Resources/app.asar/out/main'
      })
    ).toBe('/Applications/X.app/Contents/Resources/vault-kit')
  })

  it('electron 기본 실행 파일로 띄운 개발 실행이면 번들(out/main) 기준 레포의 resources/vault-kit 을 쓴다', () => {
    expect(
      bundledResourceRoot('vault-kit', {
        resourcesPath: '/node_modules/electron/dist/Resources',
        defaultApp: true,
        mainDir: '/repo/out/main'
      })
    ).toBe('/repo/resources/vault-kit')
  })

  it('Electron 밖(vitest·node)이면 소스(src/main) 기준 레포의 resources/vault-kit 을 쓴다', () => {
    expect(
      bundledResourceRoot('vault-kit', {
        resourcesPath: undefined,
        defaultApp: undefined,
        mainDir: '/repo/src/main'
      })
    ).toBe('/repo/resources/vault-kit')
  })

  it('프로세스 cwd 와 무관하다 — 실제 경로가 이 레포의 resources/vault-kit 을 가리킨다', async () => {
    const { vaultKitPath } = await import('./paths')
    const { existsSync } = await import('node:fs')
    const original = process.cwd()
    process.chdir('/')
    try {
      expect(existsSync(vaultKitPath('projects/2nd-brain-app/vault-skeleton'))).toBe(true)
    } finally {
      process.chdir(original)
    }
  })
})
