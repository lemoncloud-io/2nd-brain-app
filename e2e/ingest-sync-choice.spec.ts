import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()

test('팀 받기가 막히면 묻고 동기화 없이 시작할 수 있다 — run-log에 구간 계측이 남는다', async ({
  launch
}) => {
  const { page: window, vaultDir } = await launch('ingest-sync-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(window, 'settings')
  await window.getByTestId('vault-create').click()
  await expect(window.getByTestId('vault-status')).toHaveText(vaultDir)

  writeFileSync(join(vaultDir, 'Clippings', 'n.md'), '---\ntitle: 동기화\n---\n\n본문.\n')
  // 닿지 않는 팀 저장소 — 위키화 직전 받기가 실패한다
  git(vaultDir, 'remote', 'add', 'origin', 'https://10.255.255.1/team.git')

  await goTo(window, 'ingest')
  await window.getByTestId('ingest-start').click()
  // 막히면 실패가 아니라 선택이다 — 멈춘 가져오기는 25초 상한에 걸린다
  await expect(window.getByTestId('ingest-outcome')).toContainText(
    '팀 저장소에 연결하지 못했어요',
    {
      timeout: 40_000
    }
  )
  await window.getByTestId('ingest-proceed-without-sync').click()
  await expect(window.getByTestId('ingest-outcome')).toContainText('위키 초안을 마쳤어요')

  // run-log에 준비·초안 소요와 초안 입력량이 남는다
  const runLog = readdirSync(join(vaultDir, 'outputs', 'runs')).find((n) => n.includes('-ingest-'))
  expect(runLog).toBeTruthy()
  const log = readFileSync(join(vaultDir, 'outputs', 'runs', runLog!), 'utf8')
  expect(log).toContain('- 소요: 준비')
  expect(log).toContain('· 초안')
  expect(log).toContain('- 초안 입력:')
  expect(log).toContain('(호출 1회)')
})
