import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

// 탭 — 문서를 여러 장 띄워 놓고 오간다. 탭마다 보던 자리와 뒤로 기록이 따로다.
test('탭은 문서를 여러 장 띄우고, 저마다 보던 자리를 기억한다', async ({ launch }) => {
  test.setTimeout(120000)
  const { page, vaultDir } = await launch('tabs-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'wiki', 'notes'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'notes', 'alpha.md'), '# 알파\n\n첫 문서\n')
  writeFileSync(join(vaultDir, 'wiki', 'notes', 'beta.md'), '# 베타\n\n두 번째 문서\n')
  // 오늘 노트가 있는 보관함이다 — 첫 화면은 이것으로 채워지지만 빈 탭까지 채우면 안 된다
  mkdirSync(join(vaultDir, 'private'), { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(join(vaultDir, 'private', `${today}.md`), `# ${today}\n\n오늘 노트\n`)

  // 한 장으로 시작한다 — 닫기 단추는 아직 없다
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/notes/alpha.md')
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha'])
  await expect(page.getByTestId('doc-tab-close')).toHaveCount(0)
  // 닫기 단추가 없는 한 장짜리 탭은 양쪽 여백이 같아 이름이 가운데 온다
  const singlePadding = await page.getByTestId('doc-tab').evaluate((el) => {
    const style = getComputedStyle(el)
    return [style.paddingLeft, style.paddingRight]
  })
  expect(singlePadding[0]).toBe(singlePadding[1])
  const singleStrip = (await page.getByTestId('doc-tabs').boundingBox())!

  // 트리에서 ⌘ 누른 채 열면 새 탭 — 보던 탭은 그대로 남는다
  await (await revealInTree(page, 'wiki/notes/beta.md')).click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha', 'beta'])
  // 닫기 단추는 자기 탭 안에 들고 탭 바로 오른쪽에 나란히 있다 — 32px.
  // tablist 직속은 tab뿐이다(axe aria-required-children)
  const tablistKids = await page
    .getByTestId('doc-tabs')
    .evaluate((el) => [...el.children].map((kid) => kid.getAttribute('role')))
  expect(tablistKids).toEqual(['tab', 'tab'])
  const tabBox = (await page.getByTestId('doc-tab').first().boundingBox())!
  const closeBox = (await page.getByTestId('doc-tab-close').first().boundingBox())!
  expect(closeBox.width).toBeCloseTo(32, 0)
  expect(closeBox.height).toBeCloseTo(32, 0)
  expect(closeBox.x + closeBox.width).toBeCloseTo(tabBox.x + tabBox.width - 10, 0)
  // 두 장이 되어도 탭 줄 높이는 그대로다 — 닫기 32px이 줄을 밀지 않는다
  const doubleStrip = (await page.getByTestId('doc-tabs').boundingBox())!
  expect(doubleStrip.height).toBeCloseTo(singleStrip.height, 0)
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('베타')

  // 첫 탭으로 돌아가면 그 탭이 보던 문서가 그대로다 — ×와 겹치지 않게 이름표를 누른다
  await page.getByTestId('doc-tab').first().locator('span').click()
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')
  await page.getByTestId('doc-tab').nth(1).locator('span').click()
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('베타')

  // ⌥⌘T 로 빈 탭 — 설명 대신 할 수 있는 일이 선다
  await page.keyboard.press('Alt+ControlOrMeta+KeyT')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha', 'beta', '새 탭'])
  await expect(page.getByTestId('blank-tab')).toBeVisible()
  await expect(page.getByTestId('blank-new-note')).toBeVisible()
  // 빈 탭의 "이 탭 닫기" 는 그 탭만 닫는다
  await page.getByTestId('blank-close').click()
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha', 'beta'])
  await page.keyboard.press('Alt+ControlOrMeta+KeyT')
  await page.keyboard.press('Alt+ControlOrMeta+BracketLeft')
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('베타')

  // 닫으면 왼쪽 탭이 켜지고, 마지막 한 장은 닫는 대신 비운다
  await page.getByTestId('doc-tab-close').nth(1).click()
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha', '새 탭'])
  await page.keyboard.press('Alt+ControlOrMeta+KeyW')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha'])
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')
})
