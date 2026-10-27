import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

const env = { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }

// 비개발자는 이 앱을 채팅으로 쓴다 — 물어보고, 파일을 던져 넣고, 손대는 일은 답 옆 버튼으로 잇는다.
test('대화에서 예시로 시작해 자료를 넣고, 정리해 달라면 위키화 버튼이 답 옆에 붙는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('chat-first-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')

  // 어디서든 ⌘J 로 대화가 열린다 — 접어 두었어도 펴고 입력칸을 잡는다
  await goTo(page, 'wiki')
  await page.getByTestId('toggle-chat').click()
  await expect(page.getByTestId('chat-pane')).toBeHidden()
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await expect(page.getByTestId('chat-panel')).toBeVisible()
  await expect(page.getByTestId('chat-input')).toBeFocused()

  // 빈 대화는 무엇을 물어도 되는지 예시로 알려 준다
  await expect(page.getByTestId('chat-examples')).toBeVisible()
  await page.getByTestId('chat-example').first().click()
  await expect(page.getByTestId('chat-input')).not.toHaveValue('')

  // 정리해 달라는 질문에는 답 옆에 실제로 그 일을 하는 버튼이 붙는다
  await page.getByTestId('chat-input').fill('넣어 둔 자료를 위키로 정리해줘')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant')).toBeVisible()
  await expect(page.getByTestId('chat-action-ingest')).toBeVisible()
  await page.getByTestId('chat-action-ingest').click()
  await expect(page.getByTestId('chat-pane')).toBeVisible()
  await expect(page.getByTestId('chat-tab-ingest')).toHaveAttribute('aria-selected', 'true')

  // 그냥 묻는 말에는 아무 버튼도 권하지 않는다 — 앞 답의 카드 하나가 전부다
  await page.keyboard.press('ControlOrMeta+KeyJ')
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant')).toHaveCount(2)
  await expect(page.getByTestId('chat-actions')).toHaveCount(1)

  // 자료는 대화를 떠나지 않고 넣는다 — composer 에 넣는 길이 있다
  await expect(page.getByTestId('chat-attach')).toBeVisible()
})

test('검색에서 못 찾으면 웹으로 나가기 전에 채팅으로 물어보기를 먼저 준다', async ({ launch }) => {
  const { page, vaultDir } = await launch('chat-first-search-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'search')
  await page.getByTestId('search-input').fill('zzzzqq99999')
  await expect(page.getByTestId('search-empty')).toBeVisible()
  await page.getByTestId('ask-from-search').click()

  // 찾던 말이 그대로 질문칸에 실려 온다 — 옆 칸이 채팅 탭으로 온다
  await expect(page.getByTestId('chat-tab-chat')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('chat-input')).toHaveValue('zzzzqq99999')
})
