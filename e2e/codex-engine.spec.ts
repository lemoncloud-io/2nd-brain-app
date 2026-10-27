import { expect, test } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AddResult } from '../src/shared/ipc-contract'
import { tempDir } from './run-tree'
import { goTo } from './helpers'

type ClipApi = { api: { clipFile: (path: string) => Promise<AddResult> } }

test('설정에서 Codex 엔진을 고르면 Claude 로그인 없이 채팅 답과 위키화가 Codex CLI 로 돈다', async ({
  launch
}) => {
  const logDir = tempDir('codex-args')
  const argsLog = join(logDir, 'codex-args.log')
  const requestLog = join(logDir, 'codex-requests.log')
  const { page, root, vaultDir } = await launch('codex-engine-e2e', {
    env: {
      // Claude 는 미로그인 — Codex 로 도는지 가른다
      CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/logged-out/claude'),
      CODEX_CLI_PATH: resolve('test/fixtures/fake-codex/e2e/codex'),
      FAKE_CODEX_ARGS_LOG: argsLog,
      FAKE_CODEX_REQUEST_LOG: requestLog
    }
  })
  const calls = (): string[] =>
    readFileSync(argsLog, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('exec'))
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 엔진은 누르는 즉시 저장된다 — 따로 누를 저장 단추가 없다
  await page.getByTestId('engine-kind:codex').click()
  await expect(page.getByTestId('engine-save-status')).toHaveText('저장됨')
  await expect(page.getByTestId('engine-kind:codex')).toHaveAttribute('aria-pressed', 'true')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('인덱스에 뭐가 있어')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant')).toContainText('인덱스에 뭐가 있어')
  // 채팅은 켜 둔 app-server 의 thread 로 돈다 — exec 를 띄우지 않고, 노트를 쓸 수 있게 보관함만 쓰기로 연다
  expect(calls()).toEqual([])
  const requests = readFileSync(requestLog, 'utf8').split('\n')
  expect(requests.some((l) => l.startsWith('thread/start - workspace-write never'))).toBe(true)
  expect(requests.some((l) => l.startsWith('turn/start workspaceWrite'))).toBe(true)

  const clipping = join(root, 'note.md')
  writeFileSync(clipping, '# 노트\n\n코덱스 위키화 입력\n')
  const clipped = await page.evaluate(
    (path) => (window as unknown as ClipApi).api.clipFile(path),
    clipping
  )
  expect(clipped.ok).toBe(true)
  await goTo(page, 'ingest')
  await page.getByTestId('ingest-start').click()
  // 결과는 날짜로 부른다 — 브랜치 이름은 화면에 올리지 않는다 (#64)
  await expect(page.getByTestId('ingest-outcome-run')).toHaveText(/^\d+월 \d+일 위키 초안/)
  await expect(page.getByTestId('ingest-raw')).toContainText('codex ingest done')
  // 초안은 읽기 전용으로 돈다 — 파일·INDEX·run-log 은 앱이 코드로 쓴다
  await expect(page.getByTestId('ingest-events')).toContainText('위키에 정리하는 중이에요')
  expect(calls().some((line) => line.includes('-s read-only') && !line.includes('--add-dir'))).toBe(
    true
  )
})
