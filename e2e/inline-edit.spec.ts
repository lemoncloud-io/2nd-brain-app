// 선택 영역 AI 편집 — 편집기에서 고른 글을 지시대로 고친 제안을 보고, 넣거나 버린다. 넣은 뒤 저장이 edit: 커밋이다.
import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { goTo, openDoc } from './helpers'

test('고른 글을 AI 로 고쳐 제안을 보고, 버리면 그대로·바꾸면 그 자리만 바뀌고 저장하면 edit: 커밋', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('inline-edit-e2e', {
    env: { CLAUDE_CLI_PATH: resolve('test/fixtures/fake-claude/e2e/claude') }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'memo.md'), '# 메모\n\n고칠 문장입니다.\n\n남는 문장.\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/memo.md')
  await page.getByTestId('wiki-edit').click()
  const editor = page.getByTestId('wiki-editor-source')
  await expect(editor).toBeVisible()
  // 고른 글이 없으면 꺼져 있다
  await expect(page.getByTestId('wiki-ai-edit')).toBeDisabled()
  await editor.locator('.cm-line', { hasText: '고칠 문장입니다.' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await expect(page.getByTestId('wiki-ai-edit')).toBeEnabled()

  // 버리면 글이 그대로다
  await page.getByTestId('wiki-ai-edit').click()
  await page.getByTestId('ai-edit-instruction').fill('더 짧게')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('ai-edit-proposal-text')).toHaveText(
    'AI가 고친 문장 (고칠 문장입니다.)'
  )
  await page.getByTestId('ai-edit-reject').click()
  await expect(page.getByTestId('ai-edit-bar')).toHaveCount(0)
  await expect(editor.locator('.cm-line', { hasText: '고칠 문장입니다.' })).toHaveCount(1)

  // 바꾸면 그 자리만 바뀐다 — 저장 전에는 파일이 그대로다
  await editor.locator('.cm-line', { hasText: '고칠 문장입니다.' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await page.getByTestId('wiki-ai-edit').click()
  await page.getByTestId('ai-edit-instruction').fill('더 짧게')
  await page.getByTestId('ai-edit-run').click()
  await page.getByTestId('ai-edit-accept').click()
  await expect(editor.locator('.cm-line', { hasText: 'AI가 고친 문장' })).toHaveCount(1)
  expect(readFileSync(join(vaultDir, 'wiki', 'memo.md'), 'utf8')).toContain('고칠 문장입니다.')

  await page.getByTestId('wiki-save').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('AI가 고친 문장')
  expect(readFileSync(join(vaultDir, 'wiki', 'memo.md'), 'utf8')).toBe(
    '# 메모\n\nAI가 고친 문장 (고칠 문장입니다.)\n\n남는 문장.\n'
  )
  expect(
    execFileSync('git', ['log', '-1', '--format=%s'], { cwd: vaultDir, encoding: 'utf8' }).trim()
  ).toBe('edit: memo')
})
