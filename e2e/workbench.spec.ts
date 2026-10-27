import { expect, test } from './fixtures'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openDoc } from './helpers'

// 마감 슬라이스 — 뼈대 볼트 + fake-claude 로 7탭을 한 바퀴 돈다.
test('워크벤치 한 바퀴 — 위키·검색·그래프·lint·채팅·테마', async ({ launch }) => {
  test.setTimeout(120000)
  const { page, userData, vaultDir } = await launch('workbench-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })

  // 볼트 생성 + 페이지 시드
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'wiki'), { recursive: true })
  writeFileSync(join(vaultDir, 'wiki', 'note.md'), '# 노트\n\n볼트의 첫 문서다\n')

  // 위키 — 트리 → 리더
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/note.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('노트')

  // 검색
  await goTo(page, 'search')
  await page.getByTestId('search-input').fill('노트')
  await expect(page.getByTestId('search-hit:wiki/note.md')).toBeVisible()

  // 그래프
  await goTo(page, 'graph')
  await expect(page.getByTestId('graph-canvas')).toBeVisible()

  // lint — 구조 점검 실행
  await goTo(page, 'lint')
  await expect(page.getByTestId('lint-view')).toContainText('보관함 규칙 점검 — 이상 없어요', {
    timeout: 15000
  })

  // 채팅 — fake 답
  await goTo(page, 'chat')
  await page.getByTestId('chat-input').fill('keep 페이지가 뭐야')
  await page.getByTestId('chat-ask').click()
  await expect(page.getByTestId('chat-message-assistant')).toContainText('볼트에서 찾은 답', {
    timeout: 15000
  })

  // 설정 — 다크 테마 토글, 재시작 후 유지되는지 settings.json 저장 확인
  await goTo(page, 'settings')
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const saved = readFileSync(join(userData, 'settings.json'), 'utf8')
  expect(saved).toContain('"theme": "dark"')
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})
