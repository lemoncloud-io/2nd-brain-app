import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openConversations } from './helpers'

// 슬라이스 11 — 여러 대화: 생성·전환·이름 변경·삭제, 재시작 후 유지
test('여러 대화 — 목록 생성·전환·이름 변경·삭제, 재시작 후 유지', async ({ launch }) => {
  const env = { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  const { app, page, userData, vaultDir } = await launch('conv-e2e', { env })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[keep-page]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')

  await goTo(page, 'chat')

  const ask = async (question: string): Promise<void> => {
    await page.getByTestId('chat-input').fill(question)
    await page.getByTestId('chat-ask').click()
    await expect(page.getByTestId('chat-message-assistant').last()).toContainText(
      '볼트에서 찾은 답',
      { timeout: 15000 }
    )
  }

  // 대화 1 — 첫 질문이 제목이 된다
  await ask('첫 번째 질문이여')
  await openConversations(page)
  await expect(page.getByTestId('chat-conv-item:첫 번째 질문이여')).toBeVisible()

  // 새 대화 → 두 번째 대화
  await page.getByTestId('chat-conv-new').click()
  await ask('두 번째 질문이여')
  await openConversations(page)
  await expect(page.getByTestId('chat-conv-item:두 번째 질문이여')).toBeVisible()

  // 전환 — 첫 대화의 기록이 복원된다
  await page.getByTestId('chat-conv-item:첫 번째 질문이여').click()
  await expect(page.getByTestId('chat-message-user')).toContainText('첫 번째 질문이여')
  await expect(page.getByTestId('chat-message-assistant').first()).toContainText('볼트에서 찾은 답')

  // 이름 변경
  await openConversations(page)
  await page.getByTestId('chat-conv-item:첫 번째 질문이여').hover()
  await page.getByTestId('chat-conv-item:첫 번째 질문이여').getByTestId('chat-conv-rename').click()
  await page.getByTestId('chat-conv-rename-input').fill('바뀐 제목')
  await page.getByTestId('chat-conv-rename-input').press('Enter')
  await expect(page.getByTestId('chat-conv-item:바뀐 제목')).toBeVisible()

  // 삭제 — 두 단계 확인
  await openConversations(page)
  await page.getByTestId('chat-conv-item:두 번째 질문이여').hover()
  await page.getByTestId('chat-conv-item:두 번째 질문이여').getByTestId('chat-conv-delete').click()
  await page.getByTestId('chat-conv-confirm-delete').click()
  await expect(page.getByTestId('chat-conv-item:두 번째 질문이여')).toHaveCount(0)

  // 재시작 — 남은 대화가 볼트별로 유지된다
  await app.close()
  const { page: page2 } = await launch('conv-again-e2e', { env, userData, dialogDir: vaultDir })
  await goTo(page2, 'chat')
  await openConversations(page2)
  await expect(page2.getByTestId('chat-conv-item:바뀐 제목')).toBeVisible()
  await page2.getByTestId('chat-conv-item:바뀐 제목').click()
  await expect(page2.getByTestId('chat-message-user')).toContainText('첫 번째 질문이여')
  // 이어서 후속 질문도 된다 (session id 도 저장됨)
  await page2.getByTestId('chat-input').fill('이어서 알려줘')
  await page2.getByTestId('chat-ask').click()
  await expect(page2.getByTestId('chat-message-assistant').last()).toContainText(
    '이어진 답입니다',
    { timeout: 15000 }
  )
})
