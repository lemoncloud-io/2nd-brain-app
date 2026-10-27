import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openConversations } from './helpers'

test('다시 답하기 — 마지막 답이 새 답으로 바뀌고 질문은 한 번만 남는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('chat-regenerate', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답')

  // 같은 세션에 다시 묻는다 — 가짜 CLI 는 --resume 이 붙으면 "이어진 답" 으로 답한다
  await page.getByTestId('chat-regenerate').click()
  await expect(page.getByTestId('chat-message-assistant')).toContainText('이어진 답입니다')
  await expect(page.getByTestId('chat-message-assistant')).toHaveCount(1)
  await expect(page.getByTestId('chat-message-user')).toHaveCount(1)

  // 저장된 대화도 같다 — 다른 대화로 갔다가 돌아와 저장소에서 다시 읽는다
  await openConversations(page)
  await page.getByTestId('chat-conv-new').click()
  await expect(page.getByTestId('chat-message-user')).toHaveCount(0)
  await openConversations(page)
  await page.getByTestId('chat-conv-item:keep 페이지가 뭐야').click()
  await expect(page.getByTestId('chat-message-assistant')).toContainText('이어진 답입니다')
  await expect(page.getByTestId('chat-message-assistant')).toHaveCount(1)
  await expect(page.getByTestId('chat-message-user')).toHaveCount(1)
})
