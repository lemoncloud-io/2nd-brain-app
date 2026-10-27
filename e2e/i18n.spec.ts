import { expect, test } from './fixtures'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

test('settings — English switches the screen at once and survives a restart; first launch is Korean', async ({
  launch
}) => {
  const first = await launch('i18n-e2e')
  const { page, userData } = first
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko')

  await goTo(page, 'settings')
  await expect(page.getByTestId('theme-light')).toHaveText('라이트')
  await page.getByTestId('language-en').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByTestId('theme-light')).toHaveText('Light')
  // 화면은 저장보다 먼저 바뀐다 — 저장이 끝난 것을 기다린 뒤 다음으로
  await expect
    .poll(() => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).language)
    .toBe('en')

  // reload — 부팅 인자는 창을 띄운 때의 한국어지만 저장된 언어로 다시 맞춘다
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await first.app.close()
  const { page: again } = await launch('i18n-e2e-again', { userData })
  await expect(again.locator('html')).toHaveAttribute('lang', 'en')
  await goTo(again, 'settings')
  await expect(again.getByTestId('theme-light')).toHaveText('Light')
  await expect(again.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true')
})

test('start screen — English on the first run switches the start screen and sticks in settings', async ({
  launch
}) => {
  const { page, userData } = await launch('i18n-e2e-start')
  const purpose = page.getByTestId('start-step-purpose')
  await expect(purpose).toContainText('정리하고 싶은 것')
  await expect(page.getByTestId('start-language-ko')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('start-language-en').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(purpose).toContainText('What you want to organize')
  await expect(page.getByTestId('purpose-save')).toContainText('Save')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Get started')
  await expect
    .poll(() => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')).language)
    .toBe('en')

  await goTo(page, 'settings')
  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true')
})
