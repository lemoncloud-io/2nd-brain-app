// 고친 곳 검토 — 채팅이 고친 파일을 고친 곳으로 나눠 보고, 하나는 두고 하나는 되돌린다.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

// 보관함을 만든 직후에는 앱의 git 이 index.lock 을 잠깐 쥐고 있을 수 있다 — 풀릴 때까지 다시 해 본다
const git = (dir: string, ...args: string[]): string => {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim()
    } catch (error) {
      const locked = String((error as { stderr?: unknown }).stderr).includes('index.lock')
      if (!locked || attempt === 20) throw error
      execFileSync('sleep', ['0.1'])
    }
  }
}

test('채팅이 고친 두 곳 중 하나는 두고 하나는 되돌린다 — undo: 커밋이 남는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('hunk-review-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'outputs'), { recursive: true })
  writeFileSync(join(vaultDir, 'outputs', 'plan.md'), '# 계획\n\n- 하나\n- 둘\n- 셋\n- 넷\n')
  git(vaultDir, 'add', 'outputs/plan.md')
  git(vaultDir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'note: plan')

  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('계획 두 곳 고쳐 줘')
  await page.getByTestId('chat-ask').click()

  const card = page.getByTestId('change-card')
  await expect(card.getByTestId('change-file:outputs/plan.md')).toContainText('고쳤어요')
  await card.getByTestId('change-review:outputs/plan.md').click()

  const review = card.getByTestId('hunk-review:outputs/plan.md')
  await expect(review.getByTestId('hunk:0')).toContainText('- 하나 고침')
  await expect(review.getByTestId('hunk:1')).toContainText('- 넷 고침')

  // 두기는 파일을 건드리지 않고 목록에서만 치운다
  await review.getByTestId('hunk-accept:0').click()
  await expect(review.getByTestId('hunk:0')).toHaveCount(0)
  await review.getByTestId('hunk-reject:1').click()
  await expect(review.getByTestId('hunk-done')).toBeVisible()

  expect(readFileSync(join(vaultDir, 'outputs', 'plan.md'), 'utf8')).toBe(
    '# 계획\n\n- 하나 고침\n- 둘\n- 셋\n- 넷\n'
  )
  const subjects = git(vaultDir, 'log', '--format=%s', '-2').split('\n')
  expect(subjects[0]).toBe('undo: plan')
  expect(subjects[1]).toMatch(/^note: /)
  expect(git(vaultDir, 'status', '--porcelain', '--', 'outputs')).toBe('')
})
