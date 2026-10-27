import { expect, test } from './fixtures'
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fakeUpdateServer, NEXT_VERSION } from './fake-update-server'
import { E2E_UPDATE_CACHE } from '../src/main/update/updater'
import { goTo } from './helpers'

// 자동 업데이트 — 새 버전을 받아 두면 설정과 사이드바에 "다시 시작" 이 선다. 실제 설치(다시 시작)는 부르지 않는다.
// 업데이트 주소는 가짜 서버(`fake-update-server.ts`)다 — 패키징 안 된 실행만 이 주소를 읽는다.

/** electron-updater 가 받은 파일을 두는 곳(builder-util-runtime getAppCacheDir + E2E_UPDATE_CACHE) */
const updaterCache = (): string =>
  join(
    process.platform === 'win32'
      ? (process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Caches')
        : (process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache')),
    E2E_UPDATE_CACHE
  )

test.afterEach(() => rmSync(updaterCache(), { recursive: true, force: true }))

test('업데이트가 꺼진 실행은 지금 버전과 "팀이 전해 준다" 한 줄뿐이다', async ({ launch }) => {
  const { page } = await launch('update-off-e2e')
  await goTo(page, 'settings')
  await expect(page.getByTestId('update-section')).toHaveAttribute('data-state', 'off')
  await expect(page.getByTestId('update-line')).toContainText('새 버전은 팀에서 보내 드려요')
  await expect(page.getByTestId('sidebar-update-restart')).toHaveCount(0)
})

test('새 버전을 받아 두면 설정과 사이드바에 다시 시작이 선다', async ({ launch, serve }) => {
  const server = await fakeUpdateServer(serve)
  const { page } = await launch('update-e2e', { env: server.env })
  await goTo(page, 'settings')
  const section = page.getByTestId('update-section')
  await expect(section).toHaveAttribute('data-state', 'ready', { timeout: 30000 })
  await expect(page.getByTestId('update-line')).toContainText(`새 버전 ${NEXT_VERSION} 준비됨`)
  await expect(page.getByTestId('update-restart')).toBeEnabled()
  await expect(page.getByTestId('sidebar-update-restart')).toContainText(
    `새 버전 ${NEXT_VERSION} · 다시 시작`
  )
  expect(server.downloads).toHaveLength(1)
})
