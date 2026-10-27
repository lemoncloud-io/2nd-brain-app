import { expect, test } from './fixtures'
import { resolve } from 'node:path'
import { goTo } from './helpers'

test('채팅 답이 표·수식·Mermaid 로 그려지고, 잘못된 다이어그램은 원문 코드로 남으며, 생각 블록은 접혀 있다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('chat-markdown-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/markdown/claude') }
  })
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('요약해 줘')
  await page.getByTestId('chat-ask').click()

  const answer = page.getByTestId('chat-message-assistant')
  await expect(answer.locator('table')).toBeVisible()
  await expect(answer.locator('.katex').first()).toBeVisible()
  // 정상 다이어그램은 SVG 로, 잘못된 것은 원문 코드 블록으로
  await expect(answer.getByTestId('chat-mermaid').locator('svg')).toBeVisible({ timeout: 15_000 })
  const fallback = answer.getByTestId('chat-mermaid-fallback')
  await expect(fallback).toBeVisible()
  await expect(fallback).toContainText('this is not a diagram')

  const thinking = page.getByTestId('chat-thinking')
  await expect(thinking).toBeVisible()
  await expect(thinking).not.toHaveAttribute('open', '')
  await thinking.locator('summary').click()
  await expect(thinking).toContainText('먼저 페이지를 떠올린다')

  // 잘못된 다이어그램이 채팅을 깨뜨리지 않는다 — 입력은 계속 쓸 수 있다
  await expect(page.getByTestId('chat-input')).toBeEnabled()
  expect(pageErrors).toEqual([])
})
