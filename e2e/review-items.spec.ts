import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo } from './helpers'

const env = { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }

test('AI 점검 발견이 승인 탭 검토 항목에 모이고, 열기는 리더로 가며, 무시한 항목은 다시 켜도·다시 점검해도 안 나온다', async ({
  launch
}) => {
  const first = await launch('review-items-e2e', { env })
  const { page, userData, vaultDir } = first
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(
    join(vaultDir, 'wiki', 'keep-page.md'),
    '---\ntype: concept\n---\n\n# Keep Page\n\n오래된 본문\n'
  )

  // fake claude 는 LINT 블록 프롬프트에 wiki/keep-page.md 의 outdated 발견 하나로 답한다
  const runAiLint = async (p: typeof page): Promise<void> => {
    await goTo(p, 'lint')
    const again = p.getByTestId('lint-ai-again')
    if (await again.isVisible()) await again.click()
    else await p.getByTestId('lint-ai-start').click()
    await p.getByTestId('lint-ai-go').click()
    await expect(p.getByTestId('lint-ai-result')).toBeVisible({ timeout: 15_000 })
  }
  await runAiLint(page)

  await goTo(page, 'review')
  const item = page.locator('[data-testid^="review-item:"]')
  await expect(item).toHaveCount(1)
  await expect(item).toContainText('keep 내용 오래됨')
  const id = (await item.getAttribute('data-testid'))!.slice('review-item:'.length)

  await page.getByTestId(`review-item-open:${id}`).click()
  await expect(page.getByTestId('wiki-peek-reader')).toContainText('오래된 본문')

  await goTo(page, 'review')
  await page.getByTestId(`review-item-dismiss:${id}`).click()
  await expect(page.getByTestId('review-items-heading')).toHaveText('검토 항목 없음')
  await first.app.close()

  const second = await launch('review-items-e2e-2', { env, userData, dialogDir: vaultDir })
  await goTo(second.page, 'review')
  await expect(second.page.getByTestId('review-items-heading')).toHaveText('검토 항목 없음')
  await runAiLint(second.page)
  await goTo(second.page, 'review')
  await expect(second.page.getByTestId('review-items-heading')).toHaveText('검토 항목 없음')
})

// 무시는 한 번 누르면 끝이었다 — 잘못 눌러도 AI 가 찾아 둔 것을 잃지 않아야 한다
test('나중에 보기로 한 항목은 접힌 칸에 남고, 다시 보기를 누르면 목록으로 돌아온다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('review-items-restore-e2e', { env })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(
    join(vaultDir, 'wiki', 'keep-page.md'),
    '---\ntype: concept\n---\n\n# Keep Page\n\n오래된 본문\n'
  )

  await goTo(page, 'lint')
  await page.getByTestId('lint-ai-start').click()
  await page.getByTestId('lint-ai-go').click()
  await expect(page.getByTestId('lint-ai-result')).toBeVisible({ timeout: 15_000 })

  await goTo(page, 'review')
  const item = page.locator('[data-testid^="review-item:"]')
  await expect(item).toHaveCount(1)
  const id = (await item.getAttribute('data-testid'))!.slice('review-item:'.length)

  await page.getByTestId(`review-item-dismiss:${id}`).click()
  await expect(page.getByTestId('review-items-heading')).toHaveText('검토 항목 없음')

  await page.getByTestId('review-items-hidden').click()
  await page.getByTestId(`review-item-restore:${id}`).click()
  await expect(page.locator('[data-testid^="review-item:"]')).toHaveCount(1)
  await expect(page.getByTestId('review-items-hidden')).toHaveCount(0)
})
