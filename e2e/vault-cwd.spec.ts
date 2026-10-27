import { expect, test } from './fixtures'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo } from './helpers'

test('레포 밖 cwd 로 띄워도 새 볼트 만들기가 번들 뼈대를 찾는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('vault-cwd-e2e', { cwd: tmpdir() })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  await expect(page.getByTestId('vault-error')).toHaveCount(0)
  expect(existsSync(join(vaultDir, 'VAULT_RULES.md'))).toBe(true)
})
