import { expect, test } from './fixtures'
import { goTo, revealInTree } from './helpers'

test('설정에서 템플릿을 고르고 새 볼트를 만들면 시드 토픽 페이지가 위키에 생긴다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('vault-template-e2e')
  await goTo(page, 'settings')
  // 기본은 템플릿 없음 — 고르면 선택 상태가 보인다
  await expect(page.getByTestId('vault-template:none')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('vault-template:reading').click()
  await expect(page.getByTestId('vault-template:reading')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'wiki')
  for (const slug of ['books', 'themes', 'quotes']) {
    await expect(await revealInTree(page, `wiki/topics/${slug}.md`)).toBeVisible()
  }
})
