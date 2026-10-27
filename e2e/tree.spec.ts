import { expect, test } from './fixtures'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc, revealInTree } from './helpers'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

test('파일 트리 — 보관함 전체가 Obsidian 처럼 보이고, 어느 문서든 열리고, ⌘K 가 날짜로 찾는다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('tree-e2e')
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
  mkdirSync(join(vaultDir, 'private'), { recursive: true })
  mkdirSync(join(vaultDir, '.obsidian'), { recursive: true })
  writeFileSync(join(vaultDir, 'private', '2026-09-16.md'), '# 어제\n\n- [ ] 남은 일\n')
  writeFileSync(join(vaultDir, 'outputs', '2026-09-17-plan.md'), '# 오늘 계획\n')
  writeFileSync(join(vaultDir, 'raw', 'shot.png'), PNG_1PX)
  writeFileSync(join(vaultDir, '.obsidian', 'app.json'), '{}')

  await goTo(page, 'wiki')
  // 맨 위: 폴더 먼저, 숨김 폴더 없음, 맨 위 규칙 문서도 보인다
  for (const dir of ['private', 'raw', 'templates', 'outputs', 'wiki']) {
    await expect(page.getByTestId(`tree-dir:${dir}`)).toBeVisible()
  }
  await expect(page.getByTestId('tree-dir:.obsidian')).toHaveCount(0)
  const rules = page.getByTestId('tree-file:VAULT_RULES.md')
  await expect(rules).toHaveText('VAULT_RULES')
  // 접힌 폴더의 자식은 그리지 않는다
  await expect(page.getByTestId('tree-file:private/2026-09-16.md')).toHaveCount(0)

  // md 는 확장자 없이, 그림은 꼬리표와 함께
  await expect(await revealInTree(page, 'raw/shot.png')).toContainText('PNG')
  await openDoc(page, 'private/2026-09-16.md')
  await expect(page.getByTestId('wiki-reader')).toContainText('남은 일')
  await expect(page.getByTestId('tree-file:private/2026-09-16.md')).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await openDoc(page, 'VAULT_RULES.md')
  await expect(page.getByTestId('wiki-reader')).toBeVisible()

  // 키보드 — 위로 올라가 폴더를 접는다
  await page.getByTestId('tree-file:private/2026-09-16.md').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('tree-dir:private')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('tree-dir:private')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('tree-dir:private')).toHaveAttribute('aria-expanded', 'true')

  // 새 노트 — 초점 폴더 안에 이름 칸이 열리고, Enter 로 만들면 편집기로 연다
  await page.getByTestId('tree-new-note').click()
  await expect(page.getByTestId('tree-create-input')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tree-file:private/제목 없음.md')).toBeVisible()
  await expect(page.getByTestId('wiki-editor')).toBeVisible()
  expect(existsSync(join(vaultDir, 'private', '제목 없음.md'))).toBe(true)

  // 모두 접기
  await page.getByTestId('tree-collapse-all').click()
  await expect(page.getByTestId('tree-dir:private')).toHaveAttribute('aria-expanded', 'false')

  // ⌘K — 날짜로 개인 노트와 계획이 나오고, 맨 끝에 본문 찾기가 있다
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+KeyK')
  await page.getByTestId('palette-input').fill('2026-09')
  await expect(page.getByTestId('palette-option:private/2026-09-16.md')).toBeVisible()
  await expect(page.getByTestId('palette-option:outputs/2026-09-17-plan.md')).toBeVisible()
  await page.getByTestId('palette-option:search').click()
  await expect(page.getByTestId('search-input')).toHaveValue('2026-09')
})
