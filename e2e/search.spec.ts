import { expect, test } from './fixtures'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo } from './helpers'

test('Search 탭 — 한글 검색어로 결과·스니펫 강조, 결과 클릭 시 리더', async ({ launch }) => {
  const { page, vaultDir } = await launch('search-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'graph-note.md'), '# 그래프 노트\n\n그래프는 점과 선이다.\n')
  writeFileSync(join(vaultDir, 'wiki', 'other.md'), '# 다른 문서\n\n무관한 내용이다\n')

  await goTo(page, 'search')
  await page.getByTestId('search-input').fill('그래프')
  await expect(page.getByTestId('search-hit:wiki/graph-note.md')).toBeVisible()
  await expect(page.getByTestId('search-results')).toContainText('그래프는 점과 선이다')
  await expect(page.getByTestId('search-results')).toContainText('그래프 노트')
  // 키워드 결과는 한 번만 나온다
  await expect(page.getByTestId('search-hit:wiki/graph-note.md')).toHaveCount(1)

  // 결과 없음 상태
  // 한글 단일 글자 토큰은 부분 일치 노이즈를 만들므로 라틴 마커로 빈 상태를 검증한다
  await page.getByTestId('search-input').fill('zzqqxx')
  await expect(page.getByTestId('search-empty')).toBeVisible()
  await expect(page.getByTestId('search-empty')).toContainText('채팅으로 물어보기')
  await expect(page.getByTestId('research-from-search')).toHaveCount(0)

  // 지우기 버튼 — 브라우저 기본 × 대신 토큰 색 버튼이 값을 비우고 입력에 초점을 돌려준다
  await page.getByTestId('search-clear').click()
  await expect(page.getByTestId('search-input')).toHaveValue('')
  await expect(page.getByTestId('search-input')).toBeFocused()
  await expect(page.getByTestId('search-empty')).toHaveCount(0)
  await expect(page.getByTestId('search-clear')).toHaveCount(0)

  // 결과 클릭 → 리더
  await page.getByTestId('search-input').fill('그래프')
  await page.getByTestId('search-hit:wiki/graph-note.md').click()
  await expect(page.getByTestId('wiki-peek-reader')).toContainText('그래프는 점과 선이다')
  await page.getByTestId('wiki-peek-open').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('그래프는 점과 선이다')
})
