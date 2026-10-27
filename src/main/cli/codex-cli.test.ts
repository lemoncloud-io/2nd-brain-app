import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getCodexAuthStatus, logoutCodex, resolveCodexCli } from './codex-cli'

const fakeCodex = (name: string): string => resolve('test/fixtures/fake-codex', name, 'codex')

describe('resolveCodexCli', () => {
  it('CODEX_CLI_PATH 를 --version 으로 검증해 채택한다', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'codex-path-'))
    try {
      expect(
        await resolveCodexCli({ CODEX_CLI_PATH: fakeCodex('logged-in'), PATH: empty, HOME: empty })
      ).toEqual({ path: fakeCodex('logged-in'), version: 'codex-cli 0.154.0' })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('어디에도 없으면 사유와 함께 missing 이다', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'codex-path-'))
    try {
      const result = await resolveCodexCli({ PATH: empty, HOME: empty })
      expect(result).toMatchObject({ missing: true })
      expect('reason' in result && result.reason).toContain(
        'Codex가 이 컴퓨터에 설치돼 있지 않아요'
      )
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('getCodexAuthStatus', () => {
  it('login status 가 로그인을 알리면 loggedIn 이고 방식을 담는다', async () => {
    expect(await getCodexAuthStatus(fakeCodex('logged-in'))).toEqual({
      loggedIn: true,
      authMethod: 'ChatGPT'
    })
  })

  it('login status 가 실패하면 미로그인이다', async () => {
    expect(await getCodexAuthStatus(fakeCodex('logged-out'))).toEqual({ loggedIn: false })
  })
})

describe('logoutCodex', () => {
  it('끝날 때까지 기다린다 — 끝난 뒤의 상태를 그 자리에서 보여 줘야 한다', async () => {
    await expect(logoutCodex(fakeCodex('logged-in'))).resolves.toBeUndefined()
  })

  it('실패하면 사유를 들고 던진다 — 조용히 성공으로 보이면 사용자는 끊긴 줄 안다', async () => {
    await expect(logoutCodex(fakeCodex('logged-out'))).rejects.toThrow()
  })
})
