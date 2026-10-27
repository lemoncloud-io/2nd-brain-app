// 보관함 파일 미리보기 보강 — 워드·파워포인트 문서를 앱 안에서 읽고, 그림을 확대해 본다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { goTo, openDoc } from './helpers'
import { aP, docx, pptx, pSp, wP } from '../src/main/clip/office-fixture.test-util'

test('s06 워드 본문과 파워포인트 슬라이드 글자를 앱 안에서 읽는다', async ({ launch }) => {
  test.setTimeout(120000)
  const { page, vaultDir } = await launch('file-preview-s06')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  const dir = join(vaultDir, 'raw', 'team')
  mkdirSync(dir, { recursive: true })
  docx(dir, '보고서.docx', wP('분기 보고', { style: 'Heading1' }) + wP('워드 보고서 본문'))
  pptx(dir, '발표.pptx', [
    pSp([aP('첫 장 제목')], 'title') + pSp([aP('첫 장 본문')], ''),
    pSp([aP('둘째 장 본문')])
  ])
  await goTo(page, 'sources')

  await openDoc(page, 'raw/team/보고서.docx')
  const word = page.frameLocator('[data-testid="sources-office"]')
  await expect(word.locator('h1')).toHaveText('분기 보고')
  await expect(word.locator('body')).toContainText('워드 보고서 본문')

  await openDoc(page, 'raw/team/발표.pptx')
  const deck = page.frameLocator('[data-testid="sources-office"]')
  await expect(deck.locator('section')).toHaveCount(2)
  await expect(deck.locator('section').first()).toContainText('첫 장 제목')
  await expect(deck.locator('section').first()).toContainText('첫 장 본문')
  await expect(deck.locator('section').nth(1)).toContainText('둘째 장 본문')
})

test('s07 그림을 원본 크기로 보고, 한 단계 확대했다가 맞춤으로 돌아온다', async ({ launch }) => {
  test.setTimeout(120000)
  const { page, vaultDir } = await launch('file-preview-s07')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 문서 자리보다 큰 그림이어야 맞춤과 원본 크기가 갈린다
  mkdirSync(join(vaultDir, 'raw'), { recursive: true })
  writeFileSync(
    join(vaultDir, 'raw', '도면.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1500"><rect width="3000" height="1500" fill="#c33"/></svg>'
  )
  await goTo(page, 'sources')
  await openDoc(page, 'raw/도면.svg')

  const image = page.getByTestId('sources-image')
  const width = (): Promise<number> => image.evaluate((el) => el.getBoundingClientRect().width)
  await expect(page.getByTestId('image-zoom-level')).toHaveText('맞춤')
  await expect.poll(width).toBeLessThan(3000)
  const fitted = await width()

  await page.getByTestId('image-zoom-actual').click()
  await expect(page.getByTestId('image-zoom-level')).toHaveText('100%')
  await expect.poll(width).toBe(3000)

  await page.getByTestId('image-zoom-in').click()
  await expect(page.getByTestId('image-zoom-level')).toHaveText('125%')
  await expect.poll(width).toBe(3750)

  await page.getByTestId('image-zoom-fit').click()
  await expect(page.getByTestId('image-zoom-level')).toHaveText('맞춤')
  await expect.poll(width).toBe(fitted)
})
