import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

const lastSubject = (dir: string): string =>
  execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()

test('속성 칸 — 값을 눌러 고치고, 더하고, 지우면 edit: 커밋으로 저장된다', async ({ launch }) => {
  const { page, vaultDir } = await launch('properties')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  const file = join(vaultDir, 'wiki', 'plan.md')
  writeFileSync(file, '---\ntype: topic # 종류\nstatus: draft\n---\n\n# 계획\n\n본문\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/plan.md')
  const fm = page.getByTestId('wiki-frontmatter')
  await expect(fm.getByTestId('prop-value:status')).toHaveText('draft')

  // 고치기 — 주석과 다른 키는 그대로 남는다
  await fm.getByTestId('prop-value:status').click()
  await page.getByTestId('prop-input:status').fill('done')
  await page.keyboard.press('Enter')
  await expect(fm.getByTestId('prop-value:status')).toHaveText('done')
  expect(readFileSync(file, 'utf8')).toContain('type: topic # 종류\nstatus: done\n')
  expect(lastSubject(vaultDir)).toBe('edit: plan')

  // 더하기 — 태그는 쉼표로 여러 개
  await fm.getByTestId('prop-add').click()
  await page.getByTestId('prop-new-key').fill('tags')
  await page.getByTestId('prop-new-value').fill('회의, #계획')
  await page.keyboard.press('Enter')
  await expect(fm.getByTestId('prop-value:tags')).toHaveText('회의, 계획')
  expect(readFileSync(file, 'utf8')).toContain('tags:\n  - 회의\n  - 계획\n')

  // 지우기
  await fm.getByTestId('prop-value:status').hover()
  await fm.getByTestId('prop-remove:status').click()
  await expect(fm.getByTestId('prop-value:status')).toHaveCount(0)
  expect(readFileSync(file, 'utf8')).not.toContain('status:')
  expect(readFileSync(file, 'utf8')).toContain('# 계획\n\n본문\n')
})

test('템플릿 넣기 — 커서 자리에 본문을, 맨 위 속성에 템플릿 속성을 합친다', async ({ launch }) => {
  const { page, vaultDir } = await launch('templates')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(
    join(vaultDir, 'templates', '회의록.md'),
    '---\ntype: meeting\ndate: "{{date}}"\n---\n\n## {{title}} 결정\n\n- [ ] \n'
  )
  writeFileSync(join(vaultDir, 'wiki', 'weekly.md'), '---\ntype: note\n---\n\n# 주간\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/weekly.md')
  await page.getByTestId('wiki-edit').click()
  const editor = page.getByTestId('wiki-editor-source')
  // 맨 위 속성 원문은 한 줄로 접혀 있다 — 누르면 펼쳐진다
  await expect(editor.getByTestId('lp-properties')).toHaveText('속성 1개 · 펼치기')
  await expect(editor).not.toContainText('type: note')
  // 키보드 길 — 본문 첫 줄에서 ↑ 로 펼치고, ⌫ 가 숨은 줄바꿈을 지우지 않는다
  await editor.locator('.cm-line').nth(1).click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowUp')
  await expect(editor).toContainText('type: note')
  await editor.locator('.cm-line').last().click()
  await expect(editor.getByTestId('lp-properties')).toBeVisible()
  await editor.getByTestId('lp-properties').click()
  await expect(editor).toContainText('type: note')
  await editor.locator('.cm-line').last().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')

  await page.getByTestId('wiki-template').click()
  await page.getByTestId('template-option:templates/회의록.md').click()
  await expect(editor).toContainText('weekly 결정')
  await page.getByTestId('wiki-save').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('weekly 결정')

  const text = readFileSync(join(vaultDir, 'wiki', 'weekly.md'), 'utf8')
  // 문서의 type 은 그대로, 템플릿이 준 date 는 오늘로 채워 더한다
  expect(text).toMatch(/^---\ntype: note\ndate: "?\d{4}-\d{2}-\d{2}"?\n---\n/)
  expect(text).toContain('# 주간\n\n## weekly 결정\n\n- [ ] \n')
  expect(lastSubject(vaultDir)).toBe('edit: weekly')
})
