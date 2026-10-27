import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

test('리더는 frontmatter 를 본문에 찍지 않고, Sources 는 dotfile 을 숨기며 md 링크로 위키에 간다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('reader-sources-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'wiki', 'topics'), { recursive: true })
  writeFileSync(
    join(vaultDir, 'wiki', 'topics', 'fm.md'),
    '---\ntitle: Fm Page\ntags: [alpha]\n---\n\n본문 첫 줄이다\n'
  )
  mkdirSync(join(vaultDir, 'raw'), { recursive: true })
  writeFileSync(join(vaultDir, 'raw', '.gitkeep'), '')
  writeFileSync(join(vaultDir, 'raw', 'link.md'), '# 원본\n\n[[fm]] 을 본다\n')

  // 리더 — frontmatter 는 패널에만
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/topics/fm.md')
  const reader = page.getByTestId('wiki-reader')
  await expect(reader).toContainText('본문 첫 줄이다')
  await expect(reader).not.toContainText('title:')
  await expect(reader).not.toContainText('tags:')

  // 원본 md — dotfile 숨김, 리더의 링크 → 그 위키 문서
  await expect(await revealInTree(page, 'raw/link.md')).toBeVisible()
  await expect(page.getByTestId('tree-file:raw/.gitkeep')).toHaveCount(0)
  await openDoc(page, 'raw/link.md')
  await page.getByTestId('wiki-reader').getByTestId('wiki-link').click()
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('Fm Page')
})
