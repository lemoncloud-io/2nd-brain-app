import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

test('종류로 찾기 — ⌘K 와 검색 화면이 md 아닌 파일을 이름으로 찾고 종류 단추로 거른다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('file-find-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'raw', '예산 보고서.png'), PNG_1PX)
  writeFileSync(join(vaultDir, 'raw', '예산 계약서.txt'), '계약 내용\n')
  writeFileSync(join(vaultDir, 'raw', '예산 안내.html'), '<p>안내</p>\n')
  writeFileSync(join(vaultDir, 'outputs', '예산-plan.md'), '# 예산 계획\n')
  await goTo(page, 'wiki')
  await expect(page.getByTestId('tree-dir:raw')).toBeVisible()

  // ⌘K — 띄어 쓴 형식 낱말로 그림이 걸리고, 종류 단추는 낱말 없이도 그 종류를 보인다
  await page.keyboard.press('ControlOrMeta+KeyK')
  const input = page.getByTestId('palette-input')
  await input.fill('예산 png')
  await expect(page.getByTestId('palette-option:raw/예산 보고서.png')).toBeVisible()
  await input.fill('')
  await page.getByTestId('palette-kind:image').click()
  await expect(input).toBeFocused()
  await expect(page.getByTestId('palette-option:raw/예산 보고서.png')).toBeVisible()
  await expect(page.getByTestId('palette-option:raw/예산 계약서.txt')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('sources-image')).toBeVisible()

  // 검색 화면 — 전체는 파일과 문서를 같이, 종류를 고르면 그것만
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.getByTestId('palette-input').fill('예산')
  await page.getByTestId('palette-option:search').click()
  await expect(page.getByTestId('search-input')).toHaveValue('예산')
  await expect(page.getByTestId('search-file:raw/예산 보고서.png')).toBeVisible()
  await expect(page.getByTestId('search-file:raw/예산 계약서.txt')).toBeVisible()
  await expect(page.getByTestId('search-hit:outputs/예산-plan.md')).toBeVisible()
  await page.getByTestId('search-kind:other').click()
  await expect(page.getByTestId('search-file:raw/예산 계약서.txt')).toBeVisible()
  await expect(page.getByTestId('search-file:raw/예산 보고서.png')).toHaveCount(0)
  await expect(page.getByTestId('search-hit:outputs/예산-plan.md')).toHaveCount(0)
  await page.getByTestId('search-kind:html').click()
  await expect(page.getByTestId('search-file:raw/예산 안내.html')).toBeVisible()
  await expect(page.getByTestId('search-file:raw/예산 계약서.txt')).toHaveCount(0)
  await page.getByTestId('search-kind:pdf').click()
  await expect(page.getByTestId('search-kind-empty')).toBeVisible()
  await page.getByTestId('search-kind:image').click()
  await page.getByTestId('search-file:raw/예산 보고서.png').click()
  await expect(page.getByTestId('sources-image')).toBeVisible()
})
