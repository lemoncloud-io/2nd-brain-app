import { expect, test } from './fixtures'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

// 채팅 답 남기기 — 보관함 규칙대로 질의 답은 outputs/ 로 간다(Clippings 는 바깥 글 전용)
test('채팅 답을 outputs/에 남기고 그 파일을 연다', async ({ launch }) => {
  const { page, vaultDir } = await launch('save-wiki-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n')
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('저장해줘 질문')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText(
    '볼트에서 찾은 답',
    { timeout: 15000 }
  )

  await page.getByTestId('chat-save').last().click()
  await expect(page.getByTestId('chat-save-note')).toContainText('에 남겼어요')

  const files = readdirSync(join(vaultDir, 'outputs')).filter((name) => name.endsWith('.md'))
  expect(files).toHaveLength(1)
  const md = readFileSync(join(vaultDir, 'outputs', files[0]), 'utf8')
  expect(md).toContain('type: query-output')
  expect(md).toContain('question: 저장해줘 질문')
  expect(md).toContain('## Answer')
  expect(md).toContain('볼트에서 찾은 답')

  // 남긴 곳 열기 → 그 파일이 리더에 뜬다
  await page.getByTestId('chat-save-note').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('볼트에서 찾은 답')
})
