import { expect, test } from './fixtures'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openChatTab, openDoc, revealInTree } from './helpers'

const PLAN = [
  '---',
  'type: note',
  '---',
  '',
  '# 오늘',
  '',
  '## 어제에서 넘어온 것',
  '- [x] 계약서 검토',
  '- [ ] 회의록 정리',
  '',
  '## 오늘 할 일',
  '- [ ] 보고서 초안',
  '- [ ] 견적 보내기',
  ''
].join('\n')

test('검토 리더 — 목차의 n/m, 눌러서 저장되는 체크박스, "열린 항목만", 트리 진행 고리', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('plan-reader-e2e')

  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)

  const rel = 'private/plan.md'
  const full = join(vaultDir, 'private', 'plan.md')
  mkdirSync(join(vaultDir, 'private'), { recursive: true })
  writeFileSync(full, PLAN)

  await goTo(page, 'wiki')
  await expect(await revealInTree(page, rel)).toBeVisible()
  await openDoc(page, rel)
  await expect(page.getByTestId('wiki-reader')).toContainText('보고서 초안')

  // 목차 — 중앙이 좁으면 헤더의 접이식이 맡는다. 절마다 그 절의 n/m 이 붙는다
  await openChatTab(page, 'chat')
  await page.getByTestId('outline-menu').click()
  const panel = page.getByTestId('outline-menu-panel')
  await expect(panel.getByTestId('outline-row:어제에서-넘어온-것')).toContainText('1/2')
  await expect(panel.getByTestId('outline-row:오늘-할-일')).toContainText('0/2')

  // "열린 항목만" — 끝난 항목이 사라진다. 문서는 그대로다(보이는 것만 바뀐다)
  await panel.getByTestId('outline-open-only').click()
  await expect(page.getByTestId('wiki-reader')).not.toContainText('계약서 검토')
  await expect(page.getByTestId('wiki-reader')).toContainText('회의록 정리')
  expect(readFileSync(full, 'utf8')).toBe(PLAN)

  // 다시 끄면 끝난 항목이 돌아온다
  await panel.getByTestId('outline-open-only').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('계약서 검토')
  await page.getByTestId('outline-menu').click()

  // 체크박스를 누르면 원문의 그 줄만 바뀐다 — frontmatter 만큼 어긋나지 않는다
  await page.getByTestId('wiki-reader').getByTestId('wiki-checkbox').nth(2).click()
  await expect
    .poll(() => readFileSync(full, 'utf8'))
    .toBe(PLAN.replace('- [ ] 보고서 초안', '- [x] 보고서 초안'))

  // 다시 누르면 되돌아온다
  await page.getByTestId('wiki-reader').getByTestId('wiki-checkbox').nth(2).click()
  await expect.poll(() => readFileSync(full, 'utf8')).toBe(PLAN)

  // 트리 파일 행의 진행 고리 — 체크박스가 있는 문서에만 붙는다
  writeFileSync(join(vaultDir, 'private', 'memo.md'), '# 메모\n\n체크박스 없는 글\n')
  await expect(await revealInTree(page, 'private/memo.md')).toBeVisible()
  await expect(page.getByTestId(`tree-progress:${rel}`)).toHaveAttribute('aria-label', '할 일 1/4')
  await expect(page.getByTestId('tree-progress:private/memo.md')).toHaveCount(0)
})
