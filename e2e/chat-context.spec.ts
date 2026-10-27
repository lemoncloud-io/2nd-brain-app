// 채팅 맥락 — 보고 있는 문서도 `@` 로 붙이고(권하는 단추 하나), 다른 문서도 `@` 로 붙이고, `/` 로 사용자 스킬을 부른다(Claudian 과 같은 입력칸). 화면 캡처는 붙여 넣어 질문에 싣는다.
import { expect, test } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, openChatTab, openDoc } from './helpers'

const env = { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }

test('보고 있는 문서도 @ 문서로 붙이고, 고른 문서들의 본문이 질문에 붙는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('chat-context-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'alpha.md'), '# Alpha\n\n알파 본문\n')
  writeFileSync(join(vaultDir, 'wiki', 'beta.md'), '# Beta\n\n베타 본문\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/alpha.md')
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  await openChatTab(page, 'chat')
  // 보고 있는 문서는 저절로 붙지 않는다 — @ 단추로 권하기만 하고, 누르면 @ 칩이 된다
  await expect(page.getByTestId('chat-mention-chip:wiki/alpha.md')).toHaveCount(0)
  await page.getByTestId('chat-context-open-add').click()
  await expect(page.getByTestId('chat-mention-chip:wiki/alpha.md')).toContainText('Alpha')
  await expect(page.getByTestId('chat-context-open-add')).toHaveCount(0)

  // @ 를 치면 문서 목록 — 고르면 친 조각은 지워지고 칩이 붙는다
  const input = page.getByTestId('chat-input')
  await input.click()
  await input.pressSequentially('붙인 문서를 말해 @bet')
  await expect(page.getByTestId('chat-mention-menu')).toBeVisible()
  await expect(page.getByTestId('chat-mention-option:wiki/beta.md')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat-mention-chip:wiki/beta.md')).toBeVisible()
  await expect(input).toHaveValue('붙인 문서를 말해 ')

  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText(
    '붙인 문서: wiki/alpha.md wiki/beta.md'
  )
  // 보낸 뒤 칩은 모두 비고, 보고 있는 문서는 다시 권하기로 돌아간다
  await expect(page.getByTestId('chat-mention-chip:wiki/beta.md')).toHaveCount(0)
  await expect(page.getByTestId('chat-mention-chip:wiki/alpha.md')).toHaveCount(0)
  await expect(page.getByTestId('chat-context-open-add')).toBeVisible()

  // 빈 @ 목록은 보고 있는 문서부터 — 고르지 않고 보내면 아무것도 붙지 않는다
  await input.click()
  await input.pressSequentially('@')
  await expect(page.locator('#chat-assist-option-0')).toHaveAttribute(
    'data-testid',
    'chat-mention-option:wiki/alpha.md'
  )
  await page.keyboard.press('Escape')
  await input.fill('붙인 문서를 말해')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText('붙인 문서: 없음')
})

test('/ 는 사용자 스킬 목록 — 고르면 /이름 이 입력칸에 차고, 보내면 질문 그대로 간다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('chat-slash-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await goTo(page, 'wiki')
  await openChatTab(page, 'chat')
  const input = page.getByTestId('chat-input')

  // `/` 만 쳐도 CLI 가 알려 준 스킬이 설명과 함께 뜬다(가짜 claude 의 initialize 답). 앱 명령은 없다
  await input.click()
  await input.pressSequentially('/')
  await expect(page.getByTestId('chat-slash-menu')).toBeVisible()
  await expect(page.getByTestId('chat-slash:vault-reach')).toContainText('고아 문서를 찾아요')
  await expect(page.getByTestId('chat-slash:pdf2md-ingest')).toBeVisible()
  await expect(page.getByTestId('chat-slash:wikify')).toHaveCount(0)
  await input.pressSequentially('va')
  await expect(page.getByTestId('chat-slash:pdf2md-ingest')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('/vault-reach ')

  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat-message-user').last()).toContainText('/vault-reach')
  await expect(page.getByTestId('chat-message-assistant').last()).toBeVisible()
})

// 사람 확인(2026-10-23): Claude 데스크탑처럼 화면 캡처를 입력칸에 붙여 넣으면 질문에 붙어야 한다.
// 레티나 캡처처럼 큰 그림은 긴 변 1568px 로 줄여 보낸다
test('붙여 넣은 그림은 작게 보이고, 줄여서 질문과 함께 간다', async ({ launch }) => {
  const promptLog = join(tmpdir(), `image-prompt-${Date.now()}.txt`)
  const { page, vaultDir } = await launch('chat-image-e2e', {
    env: { ...env, FAKE_CLAUDE_PROMPT_LOG: promptLog }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await goTo(page, 'chat')
  const input = page.getByTestId('chat-input')
  await input.click()

  // 클립보드 그림 붙여 넣기 — 3136x1960 PNG(레티나 화면 캡처 크기)
  await input.evaluate(async (el) => {
    const canvas = document.createElement('canvas')
    canvas.width = 3136
    canvas.height = 1960
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d33'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'))
    const data = new DataTransfer()
    data.items.add(new File([blob], 'shot.png', { type: 'image/png' }))
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })
  await expect(page.getByTestId('chat-image')).toHaveCount(1)
  await expect(input).toHaveValue('')

  await input.fill('이 그림 무슨 색이야')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('chat-message-image')).toHaveCount(1)
  await expect(page.getByTestId('chat-image')).toHaveCount(0)
  await expect(page.getByTestId('chat-message-assistant').last()).toBeVisible()
  expect(readFileSync(promptLog, 'utf8')).toBe('[image image/png 1568x980]\n이 그림 무슨 색이야')
})
