import { expect, test } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goTo, openDoc } from './helpers'

const PAGE = '# 회의\n\n**결정** 은 [[alpha|알파]] 를 따른다\n\n- [ ] 자료 보내기\n'
// 1×1 투명 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

const createVault = async (
  page: import('@playwright/test').Page,
  vaultDir: string
): Promise<void> => {
  await goTo(page, 'settings')
  await page.getByTestId('vault-create').click()
  await expect(page.getByTestId('vault-status')).toHaveText(vaultDir)
}

test('라이브 미리보기 — 한 화면에서 서식이 그려진 채로 쓰고, 체크박스를 눌러 저장한다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('live-preview')
  await createVault(page, vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'meeting.md'), PAGE)
  writeFileSync(join(vaultDir, 'wiki', 'alpha.md'), '# Alpha\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/meeting.md')
  await page.getByTestId('wiki-edit').click()
  const editor = page.getByTestId('wiki-editor-source')
  await expect(editor).toBeVisible()
  // 아래 줄이 보이는 글의 분량을 센다 — 기호·링크 주소는 빼고 공백은 넣어서
  await expect(page.getByTestId('wiki-editor-count')).toHaveText('21자 · 단어 8개')
  // 원문 칸과 미리보기 칸이 따로 있지 않다 — 한 칸에 그려진 글이 보인다
  await expect(page.getByTestId('wiki-editor').locator('.prose-wiki')).toHaveCount(0)
  await expect(editor.locator('.cm-lp-h1')).toHaveText('# 회의')
  // 커서가 없는 줄은 기호가 숨는다
  const decided = editor.locator('.cm-line').nth(2)
  await expect(decided).toHaveText('결정 은 알파 를 따른다')
  await expect(decided.locator('.cm-lp-wikilink')).toHaveText('알파')

  // 체크박스를 누르면 원문이 [x] 로 바뀌고 저장하면 edit: 커밋이 된다
  await editor.locator('input.cm-lp-task').click()
  await editor.locator('.cm-line').last().click()
  await page.keyboard.type('추가한 줄')
  // "원문" 을 켜면 기호가 다 보인다
  await page.getByTestId('wiki-source-toggle').click()
  await expect(decided).toHaveText('**결정** 은 [[alpha|알파]] 를 따른다')
  await page.getByTestId('wiki-save').click()
  await expect(page.getByTestId('wiki-reader')).toContainText('추가한 줄')
  const text = readFileSync(join(vaultDir, 'wiki', 'meeting.md'), 'utf8')
  expect(text).toContain('- [x] 자료 보내기')
  expect(
    execFileSync('git', ['log', '-1', '--format=%s'], { cwd: vaultDir, encoding: 'utf8' }).trim()
  ).toBe('edit: meeting')

  // ⌘/Ctrl+클릭은 링크를 따라간다
  await page.getByTestId('wiki-edit').click()
  await editor.locator('.cm-line').first().click()
  await editor.locator('.cm-lp-wikilink').click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByTestId('wiki-reader').locator('h1').first()).toHaveText('Alpha')
})

test('그림을 붙여넣거나 끌어 놓으면 attachments/ 에 저장하고 ![[ ]] 를 넣는다 — 저장 커밋에 같이 탄다', async ({
  launch
}) => {
  const { page, vaultDir } = await launch('live-preview-paste')
  await createVault(page, vaultDir)
  writeFileSync(join(vaultDir, 'wiki', 'pics.md'), '# 그림\n\n')

  await goTo(page, 'wiki')
  await openDoc(page, 'wiki/pics.md')
  await page.getByTestId('wiki-edit').click()
  const editor = page.getByTestId('wiki-editor-source')
  await editor.locator('.cm-line').last().click()

  // 붙여넣기 — 클립보드 그림은 이름이 image.png 다
  await editor.locator('.cm-content').evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'image.png', { type: 'image/png' }))
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    )
  }, PNG.toString('base64'))
  await expect(editor).toContainText('![[attachments/Pasted image ')

  // 끌어 놓기 — 파일 이름을 그대로 쓴다
  await editor.locator('.cm-content').evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], '도식.png', { type: 'image/png' }))
    const box = el.getBoundingClientRect()
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX: box.left + 10,
        clientY: box.bottom - 5
      })
    )
  }, PNG.toString('base64'))
  await expect(editor).toContainText('![[attachments/도식.png]]')
  expect(existsSync(join(vaultDir, 'attachments', '도식.png'))).toBe(true)

  // 커서가 떠난 줄의 임베드는 그림으로 그려진다
  await page.keyboard.press('Enter')
  await page.keyboard.type('끝')
  await expect(editor.getByTestId('lp-image')).toHaveCount(2)

  await page.getByTestId('wiki-save').click()
  await expect(page.getByTestId('wiki-reader')).toBeVisible()
  // 한글 경로를 감싸지 않게 — 전역 git 설정이 기본값인 PC(CI 러너)에서는 "\353\217\204…" 로 나온다
  const files = execFileSync(
    'git',
    ['-c', 'core.quotePath=false', 'show', '--name-only', '--format=', 'HEAD'],
    {
      cwd: vaultDir,
      encoding: 'utf8'
    }
  )
  expect(files).toContain('attachments/도식.png')
  expect(files).toContain('wiki/pics.md')
  // 리더도 그림을 그린다
  await expect(page.getByTestId('wiki-reader').locator('img')).toHaveCount(2)
})
