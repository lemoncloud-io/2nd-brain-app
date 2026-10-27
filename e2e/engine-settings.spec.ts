import { expect, test } from './fixtures'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tempDir } from './run-tree'
import { goTo, openAdvancedSettings } from './helpers'

test('설정 → AI 설정에서 모델 하나를 고르면 settings.json 에 남고, 다시 켠 앱의 채팅 CLI 에 --model 로 간다', async ({
  launch
}) => {
  const logDir = tempDir('engine-args')
  const argsLog = join(logDir, 'claude-args.log')
  const env = {
    CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude'),
    FAKE_CLAUDE_ARGS_LOG: argsLog
  }
  const first = await launch('engine-settings-e2e', { env })
  const { page, userData, vaultDir } = first
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await page.getByTestId('engine-model').selectOption('sonnet')
  await expect(page.getByTestId('engine-save-status')).toHaveText('저장됨')
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(saved.model).toBe('sonnet')
  expect(saved.models).toBeUndefined()
  await first.app.close()

  // 다시 켠 앱의 실행만 본다 — 채팅 칸이 `/` 목록을 받으며 질문 전에 세션을 미리 연다
  writeFileSync(argsLog, '')
  const second = await launch('engine-settings-e2e-2', { env, userData, dialogDir: vaultDir })
  const next = second.page
  await goTo(next, 'settings')
  // 목록의 모델이라 고급은 접힌 채다 — 고급 칸이 저장값을 읽은 뒤에 본다(펼침 판정도 그 읽기 뒤라서)
  await expect(next.getByTestId('engine-model')).toHaveValue('sonnet')
  await expect(next.getByTestId('engine-model-custom')).toHaveValue('sonnet')
  await expect(next.getByTestId('settings-advanced-toggle')).toHaveAttribute(
    'aria-expanded',
    'false'
  )

  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n')
  await goTo(next, 'chat')
  await next.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await next.getByTestId('chat-ask').click()
  await expect(next.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답')
  const chatCalls = readFileSync(argsLog, 'utf8')
    .split('\n')
    .filter((line) => line.includes('--input-format stream-json'))
  expect(chatCalls.length).toBeGreaterThan(0)
  expect(chatCalls[0]).toContain('--model=sonnet')
})

test('옛 용도별 모델만 있던 설정은 채팅 모델을 이어받고, 다시 고르면 옛 칸이 사라진다', async ({
  launch
}) => {
  const userData = tempDir('engine-legacy')
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({ models: { chat: 'opus', ingest: 'sonnet' } })
  )
  const { page } = await launch('engine-legacy-e2e', { userData })
  await goTo(page, 'settings')
  await expect(page.getByTestId('engine-model')).toHaveValue('opus')
  await page.getByTestId('engine-model').selectOption('sonnet')
  await expect(page.getByTestId('engine-save-status')).toHaveText('저장됨')
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(saved.model).toBe('sonnet')
  expect(saved.models).toBeUndefined()
})

test('고급의 모델 직접 입력은 기본 화면 목록에도 그 이름으로 나타난다', async ({ launch }) => {
  const { page, userData } = await launch('engine-custom-e2e')
  await goTo(page, 'settings')
  await openAdvancedSettings(page)
  await page.getByTestId('engine-model-custom').fill('claude-opus-5[1m]')
  await page.getByTestId('engine-model-custom-save').click()
  await expect(page.getByTestId('engine-model-custom-status')).toHaveText('저장됨')
  await expect(page.getByTestId('engine-model')).toHaveValue('claude-opus-5[1m]')
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(saved.model).toBe('claude-opus-5[1m]')
})
