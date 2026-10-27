import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { goTo } from './helpers'

test('Lint 탭 — 구조 결함 목록, 항목 클릭 시 리더 이동, 점검 후 결함 수정하면 결함 없음', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('lint-e2e')

  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300))
  })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  // 고아 + 깨진 링크 페이지를 심는다 (뼈대 INDEX는 [[topics/...]] 링크가 없어 고아 후보)
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[lonely]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'lonely.md'), '# L\n\n[[ghost-page]] 링크\n')

  await goTo(page, 'lint')
  await expect(page.getByTestId('lint-view')).toBeVisible()
  await expect(page.getByTestId('lint-filters')).toContainText('전체')

  // 깨진 링크 항목 클릭 → 근거 시트가 lonely 페이지를 보이고, 위키에서 열면 리더로
  const brokenRow = page.getByTestId('lint-finding').filter({ hasText: 'ghost-page' }).first()
  await brokenRow.click()
  await expect(page.getByTestId('wiki-peek-reader')).toContainText('ghost-page')
  await page.getByTestId('wiki-peek-open').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('ghost-page')

  // 결함 수정 → 다시 점검하면 결함 없음
  writeFileSync(join(vaultDir, 'wiki', 'ghost-page.md'), '# G\n\n[[lonely]]\n')
  await goTo(page, 'lint')
  await expect(page.getByTestId('lint-view')).toBeVisible()
  await expect(page.getByTestId('lint-view')).toContainText('고칠 것이 없어요')
})

test('AI 점검 — 확인(RISK) → 실행 → 발견 목록, 볼트 무변경', async ({ launch }) => {
  const { page, vaultDir } = await launch('lint-ai-e2e', {
    env: { CLAUDE_CLI_PATH: join(__dirname, '../test/fixtures/fake-claude/e2e/claude') }
  })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[keep-page]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'keep-page.md'), '# Keep\n\n내용\n')

  await goTo(page, 'lint')
  await expect(page.getByTestId('lint-view')).toBeVisible()

  const gitStatus = (): string =>
    execFileSync('git', ['status', '--porcelain'], { cwd: vaultDir }).toString()

  await page.getByTestId('lint-ai-start').click()
  await expect(page.getByTestId('lint-ai-confirm')).toContainText('약 4페이지')
  const before = await gitStatus()
  await page.getByTestId('lint-ai-go').click()
  await expect(page.getByTestId('lint-ai-finding').first()).toContainText('keep 내용 오래됨', {
    timeout: 15000
  })
  await expect(page.getByTestId('lint-ai-result')).toContainText('발견 1개')
  expect(await gitStatus()).toBe(before)
})

test('AI 점검 같은 내용 — 두 페이지 합치기 제안 → 받기 → 바로 되돌리기', async ({ launch }) => {
  const { page, vaultDir } = await launch('lint-merge-e2e', {
    env: {
      CLAUDE_CLI_PATH: join(__dirname, '../test/fixtures/fake-claude/e2e/claude'),
      FAKE_CLAUDE_DUPLICATE: '1'
    }
  })

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'ml.md'), '# 머신러닝\n\n지도학습\n')
  writeFileSync(join(vaultDir, 'wiki', 'machine-learning.md'), '# 기계학습\n\n비지도학습\n')
  writeFileSync(join(vaultDir, 'wiki', 'INDEX.md'), '# INDEX\n\n[[ml]] [[machine-learning]]\n')
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@test', ...args], {
      cwd: vaultDir
    }).toString()
  git('add', 'wiki')
  git('commit', '-q', '-m', 'seed pages')

  await goTo(page, 'lint')
  await page.getByTestId('lint-ai-start').click()
  await page.getByTestId('lint-ai-go').click()
  await expect(page.getByTestId('lint-ai-finding').first()).toContainText('머신러닝 중복', {
    timeout: 15000
  })
  await page.getByTestId('merge-from-lint').click()
  await expect(page.getByTestId('merge-body')).toContainText('비지도학습', { timeout: 15000 })
  await expect(page.getByTestId('merge-summary')).toContainText('INDEX(1곳)')
  await page.getByTestId('merge-accept').click()
  await expect(page.getByTestId('merge-done')).toBeVisible()

  expect(git('log', '-1', '--format=%s').trim()).toMatch(/^edit: merge /)
  expect(git('status', '--porcelain').trim()).toBe('')
  // 둘 중 하나만 남는다 — 어느 쪽을 남길지는 앱이 고른다
  const pair = (): string[] =>
    git('ls-files', 'wiki/ml.md', 'wiki/machine-learning.md').trim().split('\n').filter(Boolean)
  expect(pair()).toHaveLength(1)

  await page.getByTestId('merge-undo').click()
  await expect(page.getByTestId('merge-undone')).toBeVisible()
  expect(git('log', '-1', '--format=%s').trim()).toMatch(/^undo: merge /)
  expect(pair()).toHaveLength(2)
  expect(git('diff', '--stat', 'HEAD~2', 'HEAD').trim()).toBe('')
})
