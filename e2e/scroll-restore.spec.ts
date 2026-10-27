import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

test('미리보기는 파일을 바꾸면 맨 위부터 보여준다', async ({ launch }) => {
  const { page, vaultDir } = await launch('scroll-restore')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(
    join(vaultDir, 'wiki', 'long.txt'),
    Array.from({ length: 500 }, (_, i) => `줄 ${i} 내용`).join('\n')
  )
  writeFileSync(
    join(vaultDir, 'wiki', 'medium.txt'),
    Array.from({ length: 40 }, (_, i) => `중간 ${i}`).join('\n')
  )
  await goTo(page, 'wiki')
  await page.getByTestId('tree-file:wiki/long.txt').click()
  await expect(page.getByTestId('sources-txt')).toContainText('줄 499')
  await page.evaluate(() => {
    const sc = document.querySelector('[data-testid="sources-preview"]') as HTMLElement | null
    if (sc) sc.scrollTop = sc.scrollHeight
  })
  // 같은 칸에서 짧은 파일을 열면 밑바닥이 아니라 맨 위가 보인다
  await page.getByTestId('tree-file:wiki/medium.txt').click()
  await expect(page.getByTestId('sources-txt')).toContainText('중간 0')
  const top = await page.evaluate(() => {
    const sc = document.querySelector('[data-testid="sources-preview"]') as HTMLElement | null
    return sc?.scrollTop ?? -1
  })
  expect(top).toBe(0)
})

test('오른쪽 칸은 문서를 바꾸면 맨 위부터 보여준다', async ({ launch }) => {
  const { page, vaultDir } = await launch('scroll-restore-split')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  const body = (tag: string): string =>
    `# ${tag}\n` + Array.from({ length: 200 }, (_, i) => `${tag} ${i}`).join('\n')
  writeFileSync(join(vaultDir, 'wiki', 'a.md'), body('에이'))
  writeFileSync(join(vaultDir, 'wiki', 'b.md'), body('비'))
  await goTo(page, 'wiki')
  await page.getByTestId('tree-file:wiki/a.md').click({ button: 'right' })
  await page.getByTestId('tree-menu-split').click()
  const split = page.getByTestId('split-pane')
  await expect(split.getByTestId('split-reader')).toContainText('에이 199')
  await page.evaluate(() => {
    const sc = document.querySelector(
      '[data-testid="split-pane"] [data-testid="split-reader"]'
    ) as HTMLElement | null
    const box = sc?.parentElement as HTMLElement | null
    if (box) box.scrollTop = box.scrollHeight
  })
  await page.getByTestId('tree-file:wiki/b.md').click({ button: 'right' })
  await page.getByTestId('tree-menu-split').click()
  await expect(split.getByTestId('split-reader')).toContainText('비 0')
  const top = await page.evaluate(() => {
    const sc = document.querySelector(
      '[data-testid="split-pane"] [data-testid="split-reader"]'
    ) as HTMLElement | null
    return (sc?.parentElement as HTMLElement | null)?.scrollTop ?? -1
  })
  expect(top).toBe(0)
})

test('편집을 열면 읽던 자리에서 열리고, 취소하면 그 자리로 돌아온다', async ({ launch }) => {
  const { page, vaultDir } = await launch('scroll-edit')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(
    join(vaultDir, 'wiki', 'long.md'),
    '# 긴 글\n\n' + Array.from({ length: 300 }, (_, i) => `문단 ${i} 내용`).join('\n\n') + '\n'
  )
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/long.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('문단 299')
  // 리더 칸 = wiki-reader 를 품은 스크롤 칸
  const readerTop = (): Promise<number> =>
    page.evaluate(() => {
      let el = document.querySelector('[data-testid="wiki-reader"]') as HTMLElement | null
      while (el && getComputedStyle(el).overflowY !== 'auto') el = el.parentElement
      return el?.scrollTop ?? -1
    })
  await page.evaluate(() => {
    let el = document.querySelector('[data-testid="wiki-reader"]') as HTMLElement | null
    while (el && getComputedStyle(el).overflowY !== 'auto') el = el.parentElement
    if (el) el.scrollTop = (el.scrollHeight - el.clientHeight) / 2
  })
  await expect.poll(readerTop).toBeGreaterThan(0)
  const before = await readerTop()

  await page.getByTestId('wiki-edit').click()
  const editor = page.getByTestId('wiki-editor-source')
  await expect(editor).toBeVisible()
  // 맨 위(제목)가 아니라 가운데쯤 문단이 보인다
  await expect
    .poll(() => editor.locator('.cm-scroller').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0)
  await expect(editor.locator('.cm-line', { hasText: '# 긴 글' })).toHaveCount(0)

  await page.getByTestId('wiki-cancel').click()
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  await expect.poll(readerTop).toBe(before)
})
