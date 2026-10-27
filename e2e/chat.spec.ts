import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openChatTab } from './helpers'

test('Chat 탭 — 스트리밍 답·참조 칩·--resume 후속 질문, 볼트 무변경', async ({ launch }) => {
  const { page, vaultDir } = await launch('chat-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 뼈대 볼트에 질문 대상 페이지를 심는다
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[keep-page]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()
  // 스트리밍 답은 오면 붙는다 — 고정 대기 대신 답이 올 때까지 (가짜 엔진은 바로 답한다)
  await expect(page.getByTestId('chat-message-user')).toContainText('keep 페이지가 뭐야')
  await expect(page.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답', {
    timeout: 30000
  })
  await expect(page.getByTestId('chat-refs')).toContainText('위키 · keep-page')

  // 후속 질문 — --resume 으로 이어진다.
  await page.getByTestId('chat-input').fill('keep 페이지에 대해 더 알려줘')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-panel')).toContainText('이어진 답입니다')

  // 이어진 답도 문서를 읽었다 — 칩 묶음이 둘이다.
  // `RefChips` 는 근거가 비면 아무것도 그리지 않으므로(chat-thread.tsx) 개수가 곧 증거다
  await expect(page.getByTestId('chat-refs')).toHaveCount(2)

  // 참조 칩 → 옆 칸의 "참고한 페이지"(대화는 살아 있다) → 문서로 열기
  await page.getByTestId('chat-refs').first().getByText('위키 · keep-page').click()
  await expect(page.getByTestId('wiki-peek')).toBeVisible()
  // 답은 줄 없이 페이지를 댄다 — 위에 그렇다고 한 줄. "← 채팅으로" 가 답 자리로 돌려보내고 읽은 칩은 눌려 있다
  await expect(page.getByTestId('wiki-peek-whole')).toBeVisible()
  await page.getByTestId('wiki-peek-back').click()
  await expect(page.getByTestId('chat-panel')).toContainText('이어진 답입니다')
  await expect(
    page.getByTestId('chat-refs').first().getByRole('button', { name: '위키 · keep-page' })
  ).toHaveAttribute('aria-pressed', 'true')
  await openChatTab(page, 'peek')
  await page.getByTestId('wiki-peek-open').click()
  await expect(page.getByTestId('wiki-reader')).toBeVisible()

  // 볼트 무변경 — 쓸 것이 없는 질문은 git status 를 바꾸지 않는다 (첫 질문 때 쓰기 전 자동 저장이 이미 돌았다)
  const gitStatus = (): string =>
    execFileSync('git', ['-C', vaultDir, 'status', '--porcelain'], { encoding: 'utf8' })
  const before = gitStatus()
  expect(before).not.toBe('')
  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('상태 확인')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-panel')).toContainText('볼트에서 찾은 답')
  expect(gitStatus()).toBe(before)
})
