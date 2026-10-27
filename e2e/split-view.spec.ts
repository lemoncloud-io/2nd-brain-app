import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

test('좌우 분할 — 두 문서를 나란히 읽고, 오른쪽 링크는 오른쪽만 바꾸며, 오른쪽에서도 편집한다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('split')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'source.md'), '# 자료\n\n읽을 글 [[other|다른 글]]\n')
  writeFileSync(join(vaultDir, 'wiki', 'other.md'), '# 다른 글\n\n본문\n')
  writeFileSync(join(vaultDir, 'wiki', 'note.md'), '# 노트\n\n쓰는 중\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/note.md')
  // 트리 오른쪽 클릭 → 오른쪽에 열기
  await (await revealInTree(page, 'wiki/source.md')).click({ button: 'right' })
  await page.getByTestId('tree-menu-split').click()
  const split = page.getByTestId('split-pane')
  await expect(split.getByTestId('split-reader')).toContainText('읽을 글')
  // 가운데는 그대로
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('노트')

  // 오른쪽 링크는 오른쪽만 바꾼다
  await split.getByTestId('wiki-link').click()
  await expect(split.getByTestId('split-title')).toHaveText('다른 글')
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('노트')

  // 오른쪽에서 편집 — 저장하면 edit: 커밋
  await split.getByTestId('split-edit').click()
  await split.getByTestId('wiki-editor-source').locator('.cm-line').last().click()
  await page.keyboard.type('덧붙임')
  // 고친 채로는 닫지 않는다
  await expect(split.getByTestId('split-close')).toBeDisabled()
  await split.getByTestId('wiki-save').click()
  await expect(split.getByTestId('split-reader')).toContainText('덧붙임')
  expect(readFileSync(join(vaultDir, 'wiki', 'other.md'), 'utf8')).toBe('# 다른 글\n\n본문\n덧붙임')
  expect(
    execFileSync('git', ['log', '-1', '--format=%s'], { cwd: vaultDir, encoding: 'utf8' }).trim()
  ).toBe('edit: other')

  // 리더 머리의 "더 보기 → 오른쪽에 열기" 는 지금 문서를 오른쪽에 띄운다
  await page.getByTestId('wiki-more').click()
  await page.getByTestId('wiki-split').click()
  await expect(split.getByTestId('split-title')).toHaveText('노트')

  // 가운데로 가져오면 분할이 닫힌다
  await openDoc(page, 'wiki/source.md')
  await split.getByTestId('split-to-main').click()
  await expect(page.getByTestId('split-pane')).toHaveCount(0)
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('노트')
})
