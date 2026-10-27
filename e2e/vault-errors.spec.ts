import { expect, test } from './fixtures'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'
import { tempDir } from './run-tree'

test('뼈대가 없는 폴더는 읽기 중심으로 열리고, 비어 있지 않은 폴더에 만들면 그 안에 2nd-brain 볼트를 만든다', async ({
  launch
}) => {
  // 대화상자가 돌려줄 폴더는 볼트가 아니다 — 노트(.md)도 없다.
  // 뼈대가 없어도 읽기 중심으로 열린다(Obsidian任意 폴더).
  const notVault = tempDir('vault-errors-not-a-vault')
  writeFileSync(join(notVault, 'data.txt'), 'not a vault\n')

  const first = await launch('vault-errors-e2e', { dialogDir: notVault })

  // 볼트 조작은 설정 탭 한 곳에 있다 — 첫 화면 기본값에 기대지 않고 명시적으로 연다
  await goTo(first.page, 'settings')
  await first.page.getByTestId('vault-open').click()
  await expect(first.page.getByTestId('vault-status')).toHaveText(notVault)
  await expect(first.page.getByTestId('vault-generic-note')).toBeVisible()
  await expect(first.page.getByTestId('vault-error')).toHaveCount(0)
  await expect(first.page.getByTestId('vault-adopt-offer')).toHaveCount(0)

  // 문서 폴더처럼 파일이 있는 곳을 골라도 거절하지 않는다 — 안에 새 볼트 폴더를 만든다.
  // 만들기는 보관함이 없을 때만 보이므로 새 프로필로 띄운다.
  const second = await launch('vault-errors-create-e2e', { dialogDir: notVault })
  await goTo(second.page, 'settings')
  await second.page.getByTestId('vault-create').click()
  await expect(second.page.getByTestId('vault-status')).toHaveText(join(notVault, '2nd-brain'))
  expect(existsSync(join(notVault, '2nd-brain', 'VAULT_RULES.md'))).toBe(true)
  expect(existsSync(join(notVault, 'data.txt'))).toBe(true)
  await expect(second.page.getByTestId('vault-adopt-offer')).toHaveCount(0)
})
