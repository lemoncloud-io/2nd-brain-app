// 편집하는 사이 문서가 바뀌면(팀 변경 받기·다른 앱) 저장이 새 내용을 덮지 않는다 — 알리고, 내 글은 복사해 둘 수 있다.
import { expect, test } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

test('편집 중 문서가 바뀌면 저장을 막고 알린다 — 바뀐 내용이 디스크에 그대로 남는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('editor-stale-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/INDEX.md')
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('\n\n저장 전 내 문장\n')
  await expect(page.getByTestId('wiki-edit-stale')).toHaveCount(0)

  // 다른 앱(또는 받기)이 같은 문서를 바꾼다
  const file = join(vaultDir, 'wiki', 'INDEX.md')
  writeFileSync(file, readFileSync(file, 'utf8') + '\n밖에서 더한 줄\n')

  await expect(page.getByTestId('wiki-edit-stale')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('wiki-save')).toBeDisabled()
  // 입력한 글은 편집기에 그대로 있다
  await expect(page.getByTestId('wiki-editor-source')).toContainText('저장 전 내 문장')
  expect(readFileSync(file, 'utf8')).toContain('밖에서 더한 줄')
  expect(readFileSync(file, 'utf8')).not.toContain('저장 전 내 문장')

  // 다시 불러오면 버리기를 묻고, 바뀐 내용으로 연다
  await page.getByTestId('wiki-edit-stale-reload').click()
  await page.getByTestId('wiki-discard').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('밖에서 더한 줄')
})
