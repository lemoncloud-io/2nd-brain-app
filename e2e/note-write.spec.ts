import { expect, test } from './fixtures'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

test('채팅이 오늘 노트를 만들고 범위 밖 변경은 되돌린다 — 카드에서 열고 되돌린다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('note-write-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  const index = readFileSync(join(vaultDir, 'wiki', 'INDEX.md'), 'utf8')
  const today = new Date().toLocaleDateString('sv-SE')
  const note = `private/${today}.md`

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('오늘 노트 만들어 줘')
  await page.getByTestId('chat-ask').click()

  const card = page.getByTestId('change-card')
  await expect(card.getByTestId(`change-file:${note}`)).toContainText('만들었어요')
  // 엔진이 몰래 고친 위키는 되돌리고 그 사실을 한 줄로 알린다
  await expect(card.getByTestId('change-blocked')).toContainText('wiki/INDEX.md')
  expect(readFileSync(join(vaultDir, 'wiki', 'INDEX.md'), 'utf8')).toBe(index)

  // 만든 노트가 중앙에 열리고 채팅은 옆 칸에 그대로 있다
  await expect(page.getByTestId('wiki-reader')).toContainText('오늘 할 일')
  await expect(page.getByTestId('chat-message-assistant').last()).toBeVisible()

  // 카드의 "바뀐 곳" 은 이번 답 기준으로 켜고, 만든 노트라 문단마다 막대가 붙는다
  await card.getByTestId(`change-marks:${note}`).click()
  await expect(page.getByTestId('changed-since:answer')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('changed-mark').first()).toBeVisible()

  // 기준 기록이 없는 항목은 켜지지 않고 이유를 말한다
  await page.getByTestId('changed-since:yesterday').click()
  await expect(page.getByTestId('changed-note')).toHaveText('어제 이전 기록이 없어요')
  await expect(page.getByTestId('changed-mark')).toHaveCount(0)
  await page.getByTestId('changed-since:answer').click()

  // 되돌리면 만든 노트가 사라지고 카드가 그 결과를 말한다
  await card.getByTestId('change-undo').click()
  await expect(card.getByTestId(`change-state:${note}`)).toContainText('되돌렸어요')
  await expect(card.getByTestId('change-undo')).toHaveCount(0)
  expect(existsSync(join(vaultDir, note))).toBe(false)
})
