import { expect, test } from './fixtures'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

test('트리 항목 관리 — 이름 바꾸기·끌어서 옮기기·휴지통, 열린 문서가 따라간다', async ({
  launch
}) => {
  const { app, page, vaultDir } = await launch('tree-manage-e2e')
  // 휴지통은 OS 의 것이다 — 테스트가 사용자 휴지통을 채우지 않게 main 의 shell 만 바꿔 끼운다
  await app.evaluate(({ shell }) => {
    shell.trashItem = async (full: string): Promise<void> => {
      const fs = process.getBuiltinModule('node:fs')
      fs.rmSync(full, { recursive: true, force: true })
    }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'private', 'archive'), { recursive: true })
  writeFileSync(join(vaultDir, 'private', 'plan.md'), '# 계획\n\n- [ ] 할 일\n')

  await goTo(page, 'wiki')
  await expect(await revealInTree(page, 'private/plan.md')).toBeVisible()
  await openDoc(page, 'private/plan.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('할 일')

  // 이름 바꾸기 — 오른쪽 클릭 메뉴, 확장자는 안 쳐도 붙는다. 열린 문서는 새 이름으로 계속 열려 있다
  await page.getByTestId('tree-file:private/plan.md').click({ button: 'right' })
  await page.getByTestId('tree-menu-rename').click()
  await page.getByTestId('tree-rename-input').fill('주간 계획')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tree-file:private/주간 계획.md')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(readFileSync(join(vaultDir, 'private', '주간 계획.md'), 'utf8')).toContain('할 일')
  await expect(page.getByTestId('wiki-reader')).toContainText('할 일')

  // 끌어서 폴더에 놓으면 옮긴다
  // dragTo 는 한 번에 건너뛰어 dragover 를 놓칠 때가 있다 — 사람처럼 두 번 나눠 움직인다
  await page.getByTestId('tree-file:private/주간 계획.md').hover()
  await page.mouse.down()
  await page.getByTestId('tree-dir:private/archive').hover({ position: { x: 20, y: 4 } })
  await page.getByTestId('tree-dir:private/archive').hover({ position: { x: 40, y: 12 } })
  await page.mouse.up()
  await expect(page.getByTestId('tree-file:private/archive/주간 계획.md')).toBeVisible()
  expect(existsSync(join(vaultDir, 'private', '주간 계획.md'))).toBe(false)
  await expect(page.getByTestId('wiki-reader')).toContainText('할 일')

  // 보관함 뼈대 폴더는 지우지 않는다 — 이유를 말한다
  await page.getByTestId('tree-dir:wiki').click({ button: 'right' })
  await page.getByTestId('tree-menu-trash').click()
  await page.getByTestId('tree-trash-confirm').click()
  await expect(page.getByRole('alert')).toContainText('기본 폴더')
  expect(existsSync(join(vaultDir, 'wiki'))).toBe(true)

  // 휴지통 — 키보드(Delete)로 묻고, 보내면 열린 문서가 닫힌다(리더는 고를 문서를 기다리는 빈 자리가 된다)
  await page.getByTestId('tree-file:private/archive/주간 계획.md').focus()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('tree-trash-dialog')).toContainText('되살릴 수 있어요')
  await page.getByTestId('tree-trash-confirm').click()
  await expect(page.getByTestId('tree-file:private/archive/주간 계획.md')).toHaveCount(0)
  expect(existsSync(join(vaultDir, 'private', 'archive', '주간 계획.md'))).toBe(false)
  await expect(page.getByTestId('wiki-reader')).toHaveCount(0)
  await expect(page.getByTestId('blank-tab')).toBeVisible()
})

test('새 노트는 이름부터 쓴다 — 저장하면 그 이름의 파일이 된다', async ({ launch }) => {
  const { page, vaultDir } = await launch('tree-name-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'private'), { recursive: true })
  await goTo(page, 'wiki')

  await page.getByTestId('tree-dir:private').click({ button: 'right' })
  await page.getByTestId('tree-menu-new-note').click()
  // 이름은 트리 안에서 먼저 받는다 — 이름이 정해지기 전에는 디스크에 아무것도 없다
  const input = page.getByTestId('tree-create-input')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('제목 없음')
  expect(existsSync(join(vaultDir, 'private', '제목 없음.md'))).toBe(false)
  await input.fill('회의록')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('wiki-editor-name')).toHaveValue('회의록')
  await page.getByTestId('wiki-editor-source').click()
  await page.keyboard.type('오늘 정한 것')
  await page.getByTestId('wiki-save').click()

  await expect(page.getByTestId('tree-file:private/회의록.md')).toBeVisible()
  await expect(page.getByTestId('tree-file:private/제목 없음.md')).toHaveCount(0)
  expect(readFileSync(join(vaultDir, 'private', '회의록.md'), 'utf8')).toBe('오늘 정한 것')
  await expect(page.getByTestId('wiki-reader')).toContainText('오늘 정한 것')
})

test('새 노트를 한 글자도 안 쓰고 닫으면 빈 파일이 남지 않는다', async ({ launch }) => {
  const { app, page, vaultDir } = await launch('tree-empty-e2e')
  await app.evaluate(({ shell }) => {
    shell.trashItem = async (full: string): Promise<void> => {
      process.getBuiltinModule('node:fs').rmSync(full, { force: true })
    }
  })
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'private'), { recursive: true })
  await goTo(page, 'wiki')

  await page.getByTestId('tree-dir:private').click({ button: 'right' })
  await page.getByTestId('tree-menu-new-note').click()
  await expect(page.getByTestId('tree-create-input')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('wiki-editor')).toBeVisible()
  await expect(page.getByTestId('tree-file:private/제목 없음.md')).toBeVisible()
  await page.getByTestId('wiki-cancel').click()
  await expect(page.getByTestId('tree-file:private/제목 없음.md')).toHaveCount(0)
  expect(existsSync(join(vaultDir, 'private', '제목 없음.md'))).toBe(false)
})
