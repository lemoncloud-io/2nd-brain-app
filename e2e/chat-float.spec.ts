import { expect, test } from './fixtures'
import { goTo } from './helpers'

// 창이 좁아 채팅 칸이 문서 위에 뜨면 Esc·바깥 누르기로 닫힌다 (슬라이스 05)
test('뜬 채팅 칸 — Esc와 바깥 누르기로 닫힌다', async ({ launch }) => {
  const { page, vaultDir } = await launch('chat-float-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 문서 최소(420) + 채팅 최소(344) = 764 미만이면 채팅 칸이 뜬다
  await page.setViewportSize({ width: 700, height: 800 })
  const pane = page.getByTestId('chat-pane')
  if (!(await pane.isVisible())) await page.getByTestId('toggle-chat').click()
  await expect(pane).toBeVisible()
  // 뜬 칸 — 머리글 접기 단추가 보인다
  await expect(page.getByTestId('collapse-chat')).toBeVisible()

  // Esc: 칸 안에 초점이 있을 때만 닫힌다
  await page.getByTestId('chat-input').click()
  await page.keyboard.press('Escape')
  await expect(pane).toBeHidden()

  // 다시 펴고 바깥(문서 자리)을 누르면 닫힌다
  await page.getByTestId('toggle-chat').click()
  await expect(pane).toBeVisible()
  await page.mouse.click(60, 400)
  await expect(pane).toBeHidden()
})
