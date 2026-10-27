import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

// 근거 시트 → 위키에서 열기 → 뒤로·앞으로, Cmd+K, 폴더 접힘 저장, 편집 중 이동 확인.
// 기준 볼트(knowledge, 232페이지)만큼 페이지를 깔고 돈다
const BULK = 232
test('근거는 시트로 보고, 이동 기록으로 돌아오며, 편집 중 이동은 먼저 묻는다', async ({
  launch
}) => {
  test.setTimeout(120000)
  const first = await launch('navigation-e2e')
  const { userData, vaultDir } = first
  let { app, page } = first
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'wiki', 'notes'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'notes', 'alpha.md'), '# 알파\n\n[[beta]] 로 간다\n')
  writeFileSync(join(vaultDir, 'wiki', 'notes', 'beta.md'), '# 베타\n\n두 번째 문서\n')
  mkdirSync(join(vaultDir, 'wiki', 'bulk'), { recursive: true })
  for (let i = 1; i <= BULK; i += 1) {
    writeFileSync(join(vaultDir, 'wiki', 'bulk', `page-${i}.md`), `# 묶음 ${i}\n\n본문 ${i}\n`)
  }

  // 검색 결과 → 시트. 검색 뷰는 그대로, Esc 로 닫는다
  await goTo(page, 'search')
  await page.getByTestId('search-input').fill('알파')
  await page.getByTestId('search-hit:wiki/notes/alpha.md').click()
  await expect(page.getByTestId('wiki-peek-reader')).toContainText('beta')
  await expect(page.getByTestId('search-input')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('wiki-peek')).toHaveCount(0)

  // 다시 열어 위키로 — 리더 헤더에 출발점(검색)이 보인다
  await page.getByTestId('search-hit:wiki/notes/alpha.md').click()
  await page.getByTestId('wiki-peek-open').click()
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')
  await expect(page.getByTestId('wiki-back')).toHaveText('지식 관리')

  // 리더 안 링크는 새 탭에 열린다 — 읽던 탭은 자리도 기록도 그대로고, 새 탭에는 돌아갈 곳이 없다.
  // 탭을 닫고 돌아와 ← 버튼으로 근거를 연 검색 화면, ⌘] 로 다시 알파
  // 링크에 마우스를 올려 두면 그 페이지가 곁에 뜬다 — 읽던 자리는 그대로다
  await page.getByTestId('wiki-reader').getByTestId('wiki-link').hover()
  await expect(page.getByTestId('link-preview')).toContainText('두 번째 문서')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha'])
  await page.getByTestId('wiki-reader').getByTestId('wiki-link').click()
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('베타')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha', 'beta'])
  await expect(page.getByTestId('wiki-back')).toHaveCount(0)
  await page.keyboard.press('Alt+ControlOrMeta+KeyW')
  await expect(page.getByTestId('doc-tab')).toHaveText(['alpha'])
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')
  await expect(page.getByTestId('wiki-back')).toHaveText('지식 관리')
  await page.getByTestId('wiki-back').click()
  await expect(page.getByTestId('search-input')).toBeVisible()
  await expect(page.getByTestId('search-input')).toHaveValue('알파')
  await page.keyboard.press('ControlOrMeta+BracketRight')
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('알파')

  // 단축키는 입력칸의 글자를 가로채지 않는다 — '[' 는 그대로 들어가고, 한글 조합도 끊기지 않는다
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.keyboard.type('[알')
  await expect(page.getByTestId('palette-input')).toHaveValue('[알')
  await page.keyboard.press('Escape')

  // Cmd+K ↑↓ — '묶음 23' 은 제목 앞 일치에서 짧은 것부터, 한 칸 내리면 '묶음 230'
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.getByTestId('palette-input').fill('묶음 23')
  await expect(page.getByTestId('palette-option:wiki/bulk/page-23.md')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('palette-option:wiki/bulk/page-230.md')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('묶음 230')
  // Esc 로 닫는다
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(page.getByTestId('palette')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('palette')).toHaveCount(0)

  // Cmd+K — 빈 입력은 최근 페이지, 입력하면 제목 일치, Enter 로 연다
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(page.getByTestId('palette-option:wiki/notes/beta.md')).toBeVisible()
  await page.getByTestId('palette-input').fill('베타')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette')).toHaveCount(0)
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('베타')

  // 폴더 접기 — 재시작 뒤에도 접혀 있다
  await openDoc(page, 'wiki/INDEX.md')
  await page.getByTestId('tree-dir:wiki/notes').click()
  await expect(page.getByTestId('tree-dir:wiki/notes')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('tree-file:wiki/notes/alpha.md')).toHaveCount(0)
  await app.close()
  const second = await launch('navigation-e2e', { userData, dialogDir: vaultDir })
  ;({ app, page } = second)
  await goTo(page, 'wiki')
  await expect(page.getByTestId('tree-dir:wiki/notes')).toHaveAttribute('aria-expanded', 'false')
  // Cmd+K 로 연 페이지는 그 페이지가 든 폴더를 편다
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.getByTestId('palette-input').fill('알파')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tree-dir:wiki/notes')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('tree-file:wiki/notes/alpha.md')).toBeVisible()

  // 편집 중 이동 — 계속 편집이면 남고, 버리고 이동이면 옮긴다
  await page.getByTestId('wiki-edit').click()
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.type('\n고친 줄')
  // 편집기 안 ⌘[ 는 내어쓰기다 — 이동하지 않으니 확인창도 뜨지 않는다
  await page.keyboard.press('ControlOrMeta+BracketLeft')
  await expect(page.getByTestId('wiki-discard-confirm')).toHaveCount(0)
  await expect(page.getByTestId('wiki-editor')).toBeVisible()
  await openDoc(page, 'wiki/notes/beta.md')
  await expect(page.getByTestId('wiki-discard-confirm')).toBeVisible()
  await page.getByRole('button', { name: '계속 편집' }).click()
  await expect(page.getByTestId('wiki-editor')).toBeVisible()
  await openDoc(page, 'wiki/notes/beta.md')
  await page.getByTestId('wiki-discard').click()
  await expect(page.getByTestId('wiki-reader').locator('h1')).toHaveText('베타')
  await expect(page.getByTestId('wiki-editor')).toHaveCount(0)
})
