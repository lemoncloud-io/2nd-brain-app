import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

// ⌘W(Ctrl+W)는 탭 닫기 — 창 닫기·숨기기가 아니다. main 의 before-input-event 가 가로채
// renderer 로 돌린다. Playwright 합성 키(CDP)는 main 입력 파이프를 우회하므로,
// 여기서는 main 이 보내는 것과 같은 채널로 직접 쏜다. 키 판정(isCloseTabKey)과
// 메뉴 무가속기는 단위 테스트가 잰다(close-tab-key.test, app-menu.test).
test('close-current-tab closes the tab and the window stays alive', async ({ launch }) => {
  test.setTimeout(120000)
  const { app, page, vaultDir } = await launch('cmd-w-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'alpha.md'), '# 알파\n\n첫 문서\n')
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/alpha.md')
  await page.keyboard.press('Alt+ControlOrMeta+KeyT')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha', '새 탭'])

  // 두 장에서 한 장 닫기 — 창은 살아 있고 문서는 그대로다
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('app:close-current-tab')
  })
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha'])
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')

  // 마지막 한 장이면 닫는 대신 비운다 — 창이 사라지지 않는다
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('app:close-current-tab')
  })
  await expect(page.getByTestId('blank-tab')).toBeVisible()
  await expect(page.getByTestId('sidebar')).toBeVisible()
})
