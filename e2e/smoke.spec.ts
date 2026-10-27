import { expect, test } from './fixtures'

test('창이 뜨고 typed bridge로 앱 버전을 표시한다', async ({ launch }) => {
  const { page: window } = await launch('smoke-e2e')

  await expect(window.getByTestId('sidebar')).toBeVisible()

  // 버전은 화면에서 접어 두고 보조기기에만 읽힌다 — 값 자체는 그대로다
  const versionText = await window.getByTestId('app-version').textContent()
  expect(versionText).toMatch(/^앱 버전: \d+\.\d+\.\d+/)

  // preload typed bridge 동작(sandbox:true) 확인 — renderer에 electron이 노출되지 않아야 한다
  const hasElectronGlobal = await window.evaluate(() => 'electron' in window)
  expect(hasElectronGlobal).toBe(false)
})
