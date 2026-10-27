import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tempDir } from './run-tree'
import { goTo } from './helpers'

// 계정을 끊는 길이 앱 안에 있어야 한다 — 없으면 공용 PC 에서 동료 계정을 물려받은 사람의 탈출구가 터미널뿐이다.
test('연결을 끊으면 계정이 사라지고 다시 로그인 화면으로 돌아온다', async ({ launch }) => {
  const flagDir = tempDir('logout-flag')
  const env = {
    CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude'),
    FAKE_CLAUDE_LOGOUT_FLAG: join(flagDir, 'logged-out')
  }
  const { page, vaultDir } = await launch('accounts-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 연결된 계정이 누구인지 보이고, 끊는 버튼이 그 옆에 있다
  await expect(page.getByTestId('engine-connect')).toHaveAttribute('data-state', 'ok')
  await expect(page.getByTestId('engine-connect')).toContainText('e2e@example.com')

  // 무엇이 남고 무엇이 끊기는지 먼저 말한 뒤에 끊는다
  await page.getByTestId('engine-logout').click()
  await expect(page.getByTestId('engine-logout-confirm')).toContainText('위키와 넣어 둔 자료는')
  await page.getByTestId('engine-logout-confirm-ok').click()

  await expect(page.getByTestId('engine-connect')).toHaveAttribute('data-state', 'logged-out')
  await expect(page.getByTestId('engine-login')).toBeVisible()
  // 보관함은 로그아웃과 무관하다 — 계정을 끊었다고 자료가 사라지면 안 된다
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
})

// 보관함을 한 번 만들고 나서도 다른 보관함으로 갈 수 있어야 한다
test('보관함이 정상일 때도 다른 보관함을 열 수 있고, 되돌리기가 무엇을 지키는지 미리 말한다', async ({
  launch
}) => {
  const env = { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  const { page, vaultDir } = await launch('vault-switch-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await expect(page.getByTestId('vault-switch')).toBeVisible()
  await expect(page.getByTestId('vault-restore')).toBeVisible()
  // 안전한 동작인데 이름만 보면 무섭다 — 무엇을 하지 않는지 누르기 전에 적혀 있다
  await expect(page.getByTestId('vault-status').locator('..').locator('..')).toContainText(
    '승인 대기 중인 위키 초안 만들기가 있으면 아무것도 하지 않아요'
  )

  // 대화상자는 같은 폴더를 돌려준다 — 고른 보관함이 그대로 열린다
  await page.getByTestId('vault-switch').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
})

// 잘못 연결한 저장소에서 빠져나오는 길이 있어야 한다 — 없으면 올린 곳을 바꿀 수 없다.
test('GitHub 연결은 무엇이 남는지 말한 뒤 끊기고, 끊으면 다시 연결 안내로 돌아온다', async ({
  launch
}) => {
  const env = { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  const { page, vaultDir } = await launch('github-disconnect-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 연결은 실제 GitHub 로 나가므로, 이미 연결된 보관함을 흉내 낸다
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/kim/brain.git'], {
    cwd: vaultDir
  })
  await goTo(page, 'home')
  await goTo(page, 'settings')

  const backup = page.getByTestId('team-repo')
  await expect(backup).toHaveAttribute('data-state', 'connected')
  // 무엇이 올라가는지 연결된 뒤에도 적혀 있다
  await expect(backup).toContainText('원본 자료')

  await backup.getByTestId('github-disconnect').click()
  await expect(page.getByTestId('github-disconnect-confirm')).toContainText(
    '이미 GitHub에 올라간 내용은 그대로 남아요'
  )
  await page.getByTestId('github-disconnect-ok').click()

  await expect(page.getByTestId('team-repo')).toHaveAttribute('data-state', 'none')
  await expect(page.getByTestId('team-repo-create')).toBeVisible()
})
