import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

const lastSubject = (dir: string): string =>
  execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()

test('링크 없이 적은 이름 — 리더 아래에 모이고, "링크 걸기" 로 그 자리만 링크가 된다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('mentions')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'llm.md'), '# LLM\n\n거대 언어 모델\n')
  writeFileSync(join(vaultDir, 'wiki', 'talk.md'), '# 대화\n\n요즘 LLM 이야기\n\n`LLM` 은 코드\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/llm.md')
  const mention = page.getByTestId('wiki-mention:wiki/talk.md:2')
  await expect(mention).toContainText('요즘 LLM 이야기')
  // 코드 안 이름은 언급이 아니다
  await expect(page.getByTestId('wiki-mentions').locator('li')).toHaveCount(1)

  await page.getByTestId('wiki-mention-link:wiki/talk.md:2').click()
  await expect(page.getByTestId('wiki-mentions')).toHaveCount(0)
  expect(readFileSync(join(vaultDir, 'wiki', 'talk.md'), 'utf8')).toBe(
    '# 대화\n\n요즘 [[LLM]] 이야기\n\n`LLM` 은 코드\n'
  )
  expect(lastSubject(vaultDir)).toBe('edit: talk')
  // 이제는 백링크다
  await expect(page.getByTestId('wiki-backlink')).toHaveText('대화')
})

test('가리킨 곳이 없는 링크 — 리더와 점검에서 보이고, "만들기" 로 그 노트를 만든다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('unresolved')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'plan.md'), '# 계획\n\n[[예산안]] 과 [[일정표]] 를 본다\n')
  writeFileSync(join(vaultDir, 'wiki', 'memo.md'), '# 메모\n\n[[예산안]] 먼저\n')

  // 점검 — 대상별로 묶는다
  await goTo(page, 'lint')
  await expect(page.getByTestId('lint-unresolved:예산안')).toContainText('계획')
  await expect(page.getByTestId('lint-unresolved:예산안')).toContainText('메모')
  await expect(page.getByTestId('lint-unresolved:일정표')).toBeVisible()

  // 리더 — 이 문서의 없는 링크에서 만들기
  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/plan.md')
  await page.getByTestId('wiki-unresolved-create:일정표').click()
  await expect(page.getByTestId('wiki-editor')).toBeVisible()
  expect(existsSync(join(vaultDir, 'wiki', '일정표.md'))).toBe(true)
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.type('# 일정표')
  await page.getByTestId('wiki-save').click()
  await expect(page.getByTestId('wiki-reader')).toBeVisible()

  // 만든 뒤에는 없는 링크가 아니다
  await openDoc(page, 'wiki/plan.md')
  await expect(page.getByTestId('wiki-unresolved-create:일정표')).toHaveCount(0)
  await expect(page.getByTestId('wiki-unresolved-create:예산안')).toBeVisible()
})
