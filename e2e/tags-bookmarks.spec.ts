import { expect, test } from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

test('태그 칸 — 속성과 본문의 태그를 세고, 누르면 #태그 로 찾는다', async ({ launch }) => {
  const { page, vaultDir } = await launch('tags')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'a.md'), '---\ntags: [회의]\n---\n# 가\n\n예산 논의 #결정\n')
  writeFileSync(join(vaultDir, 'wiki', 'b.md'), '# 나\n\n#회의 메모\n\n`#코드` 는 태그가 아니다\n')
  writeFileSync(join(vaultDir, 'wiki', 'c.md'), '# 다\n\n태그 없음\n')

  await goTo(page, 'wiki')
  await page.getByTestId('sidebar-pane-tags').click()
  const pane = page.getByTestId('tag-pane')
  await expect(pane.getByTestId('tag-row:회의')).toContainText('2')
  await expect(pane.getByTestId('tag-row:결정')).toContainText('1')
  await expect(pane.getByTestId('tag-row:코드')).toHaveCount(0)
  // 거르기
  await page.getByTestId('tag-filter').fill('결')
  await expect(pane.getByTestId('tag-row:회의')).toHaveCount(0)
  await page.getByTestId('tag-filter').fill('')

  await pane.getByTestId('tag-row:회의').click()
  await expect(page.getByTestId('search-input')).toHaveValue('#회의')
  await expect(page.getByTestId('search-hit:wiki/a.md')).toBeVisible()
  await expect(page.getByTestId('search-hit:wiki/b.md')).toBeVisible()
  await expect(page.getByTestId('search-hit:wiki/c.md')).toHaveCount(0)

  // 태그 + 글 — 태그로 거른 뒤 글로 찾는다
  await page.getByTestId('search-input').fill('#회의 예산')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('search-hit:wiki/a.md')).toBeVisible()
  await expect(page.getByTestId('search-hit:wiki/b.md')).toHaveCount(0)

  // 파일 칸으로 돌아오면 트리가 그대로다
  await page.getByTestId('sidebar-pane-files').click()
  await expect(page.getByTestId('file-tree')).toBeVisible()
})

test('북마크 — 문서 위 ☆ 로 달고 사이드바에서 열며, Obsidian 의 bookmarks.json 에 남는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('bookmarks')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'keep.md'), '# 남길 문서\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/keep.md')
  await page.getByTestId('wiki-more').click()
  await page.getByTestId('wiki-bookmark').click()
  // 고르면 메뉴가 닫힌다 — 다시 열어야 상태를 읽을 수 있다
  await page.getByTestId('wiki-more').click()
  await expect(page.getByTestId('wiki-bookmark')).toHaveAttribute('aria-checked', 'true')
  // 읽고 나면 닫는다 — 열린 메뉴가 뒤의 트리 클릭을 가린다
  await page.keyboard.press('Escape')
  const saved = JSON.parse(readFileSync(join(vaultDir, '.obsidian', 'bookmarks.json'), 'utf8'))
  expect(saved.items).toEqual([expect.objectContaining({ type: 'file', path: 'wiki/keep.md' })])

  await openDoc(page, 'wiki/INDEX.md')
  await page.getByTestId('sidebar-pane-bookmarks').click()
  // 줄은 바로 위 폴더와 이름 — 이름이 같은 문서가 갈린다
  await expect(page.getByTestId('bookmark:wiki/keep.md')).toHaveText('위키 · keep')
  await page.getByTestId('bookmark:wiki/keep.md').click()
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('남길 문서')

  // 떼기
  await page.getByTestId('bookmark:wiki/keep.md').hover()
  await page.getByTestId('bookmark-remove:wiki/keep.md').click()
  await expect(page.getByTestId('bookmark-empty')).toBeVisible()
  // 메뉴를 열어야 지금 문서의 북마크 상태를 읽을 수 있다
  await page.getByTestId('wiki-more').click()
  await expect(page.getByTestId('wiki-bookmark')).toHaveAttribute('aria-checked', 'false')
})
