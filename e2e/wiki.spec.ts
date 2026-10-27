import { expect, test } from './fixtures'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

const AI_PAGE = `---\ntype: topic\nup:\n  - index\n---\n\n# AI\n\n| 도구 | 용도 |\n|---|---|\n| A | 분류 |\n\n관련: [[alpha]] · 없는 링크 [[ghost]]\n`

const ALPHA_PAGE = '# Alpha\n\n`[[코드 안 링크]]` 는 링크가 아니다\n'

test('트리에서 페이지를 고르면 리더가 GFM·wikilink·frontmatter로 보여 준다', async ({ launch }) => {
  const { page, vaultDir } = await launch('wiki-e2e')

  // 뼈대 볼트 만들기 → fixture 페이지 2개
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'ai.md'), AI_PAGE)
  writeFileSync(join(vaultDir, 'wiki', 'alpha.md'), ALPHA_PAGE)

  await goTo(page, 'wiki')
  await expect(page.getByTestId('file-tree')).toBeVisible()
  await expect(await revealInTree(page, 'wiki/alpha.md')).toBeVisible()

  // 트리 클릭 → 표 렌더
  await openDoc(page, 'wiki/ai.md')
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  await expect(page.getByTestId('wiki-reader')).toContainText('도구')
  // frontmatter 패널
  const fm = page.getByTestId('wiki-frontmatter')
  await expect(fm).toContainText('종류')

  // wikilink 이동
  await page.getByTestId('wiki-reader').getByTestId('wiki-link').first().click()
  await expect(page.getByTestId('wiki-reader')).toContainText('Alpha')

  // 없는 링크 스타일
  await openDoc(page, 'wiki/ai.md')
  await expect(page.getByTestId('wiki-reader').getByTestId('wiki-link-missing')).toContainText(
    'ghost'
  )

  // 코드 안 링크는 링크가 아니다
  await openDoc(page, 'wiki/alpha.md')
  await expect(page.getByTestId('wiki-reader').getByTestId('wiki-link')).toHaveCount(0)
})

test('편집 → 저장 → 기본 브랜치에 edit: <slug> 커밋 1개', async ({ launch }) => {
  const { execFileSync } = await import('node:child_process')
  const { page, vaultDir } = await launch('wiki-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'editme.md'), '# 편집\n')

  await goTo(page, 'wiki')
  // 고른 페이지가 없으면 빈 화면 대신 위키 입구(INDEX)를 연다
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('Wiki Index')
  await openDoc(page, 'wiki/editme.md')
  await expect(page.getByTestId('wiki-reader')).toBeVisible()

  // 바뀐 게 없으면 취소는 묻지 않고 닫는다
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-cancel').click()
  await expect(page.getByTestId('wiki-reader')).toBeVisible()

  // 바뀐 게 있으면 확인 창을 먼저 띄운다 — 계속 편집하면 글이 남는다
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.type('버릴 문장')
  await page.getByTestId('wiki-cancel').click()
  await expect(page.getByTestId('wiki-discard-confirm')).toBeVisible()
  await page.getByRole('button', { name: '계속 편집' }).click()
  await expect(page.getByTestId('wiki-discard-confirm')).toBeHidden()
  await expect(page.getByTestId('wiki-editor-source')).toContainText('버릴 문장')

  // 버리면 리더로 돌아오고 파일은 그대로다
  await page.getByTestId('wiki-cancel').click()
  await page.getByTestId('wiki-discard').click()
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  await expect(page.getByTestId('wiki-reader')).not.toContainText('버릴 문장')

  // 트리에서 다른 페이지를 골라도 먼저 묻는다 — 계속 편집하면 선택이 그대로다
  writeFileSync(join(vaultDir, 'wiki', 'other.md'), '# 다른 쪽\n')
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.type('남길 문장')
  await openDoc(page, 'wiki/other.md')
  await page.getByRole('button', { name: '계속 편집' }).click()
  await expect(page.getByTestId('wiki-editor-source')).toContainText('남길 문장')

  // 바깥(검색 결과)은 근거 시트로 읽으니 편집을 건드리지 않는다. 시트에서 위키로 열려 하면 먼저 묻고,
  // 계속 편집하면 편집 중인 글이 그대로다
  await goTo(page, 'search')
  await page.getByTestId('search-input').fill('다른 쪽')
  await page.getByTestId('search-hit:wiki/other.md').click()
  await expect(page.getByTestId('wiki-discard-confirm')).toHaveCount(0)
  await page.getByTestId('wiki-peek-open').click()
  await expect(page.getByTestId('wiki-discard-confirm')).toBeVisible()
  await page.getByRole('button', { name: '계속 편집' }).click()
  await expect(page.getByTestId('wiki-editor-name')).toHaveValue('editme')
  await expect(page.getByTestId('wiki-editor-source')).toContainText('남길 문장')

  // 버리면 고른 페이지로 간다
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/other.md')
  await page.getByTestId('wiki-discard').click()
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('다른 쪽')
  await openDoc(page, 'wiki/editme.md')

  // 편집 → 내용 수정 → 저장
  await page.getByTestId('wiki-edit').click()
  await expect(page.getByTestId('wiki-editor')).toBeVisible()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.type('\n\n새 문장')
  await page.getByTestId('wiki-save').click()

  // 저장되면 리더로 돌아오고 새 내용이 보인다
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  await expect(page.getByTestId('wiki-reader')).toContainText('새 문장')

  const subject = execFileSync('git', ['log', '-1', '--format=%s'], {
    cwd: vaultDir,
    encoding: 'utf8'
  }).trim()
  expect(subject).toBe('edit: editme')
})
